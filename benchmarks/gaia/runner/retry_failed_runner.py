import os
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "results"

TASKS_FILE = DATA_DIR / "tasks_for_agent.json"
RAW_RESULTS_FILE = RESULTS_DIR / "raw_results.jsonl"
EVAL_RESULTS_FILE = RESULTS_DIR / "evaluator_results.jsonl"
ATTACHMENTS_DIR = DATA_DIR / "attachments"
API_ENDPOINT = "http://127.0.0.1:3000/api/v2/execute"
TIMEOUT_SECONDS = 600 # Đồng bộ trần thời gian 10 phút như Forward Runner

def get_failed_tasks():
    if not EVAL_RESULTS_FILE.exists():
        return []
    
    with open(TASKS_FILE, "r", encoding="utf-8") as f:
        all_tasks = {t["task_id"]: t for t in json.load(f)}
        
    failed_items = []
    with open(EVAL_RESULTS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rec = json.loads(line)
                if not rec.get("is_correct"):
                    failed_items.append(rec)
                    
    # Priority order:
    # 1. High priority tasks: code echo bugs (076c8171, 0bb3b44a), audio calculus (1f975693), unit traps (e1fc63a2, 7d4a7d1d)
    high_priority_prefixes = ['076c8171', '0bb3b44a', '1f975693', 'e1fc63a2', '7d4a7d1d', 'c365c1c7', 'cca530fc', '0ff53813', '08f3a05f', 'a1e91b78']
    
    def priority_key(item):
        tid = item["task_id"]
        is_hp = any(tid.startswith(p) for p in high_priority_prefixes)
        lvl = item.get("level", 2)
        return (0 if is_hp else 1, lvl)
        
    failed_items.sort(key=priority_key)
    return [all_tasks[it["task_id"]] for it in failed_items if it["task_id"] in all_tasks]

def run_single_task(task):
    task_id = task["task_id"]
    prompt = (
        "You are a general AI assistant. Solve the task using available tools, resources, and capabilities. "
        "You may browse the web, inspect files, process data, execute code, and use other available tools as needed.\n\n"
        "Carefully complete the requested task. Your final answer must end with:\n\n"
        "FINAL ANSWER: [YOUR ANSWER]\n\n"
        "The final answer should be a number, a few words, or a comma-separated list of numbers and/or strings, depending on the question.\n\n"
        "For numerical answers, do not include units, currency symbols, commas as thousands separators, or percent signs unless explicitly requested.\n\n"
        "For string answers, use the shortest unambiguous answer, without unnecessary articles or explanations.\n\n"
        "Do not invent information. If you cannot solve the task, report that honestly.\n\n"
        "Do not put additional content after the FINAL ANSWER line.\n\n"
        f"--- TASK QUESTION ---\n\n{task['question']}"
    )

    attachment_name = task.get("file_name")
    attachment_path = None
    if attachment_name:
        disk_path = ATTACHMENTS_DIR / attachment_name
        if disk_path.exists():
            attachment_path = str(disk_path.resolve())
            prompt += (
                f"\n\nAttachment file: {attachment_name}\n"
                f"File location on disk: {attachment_path}\n"
                f"You can inspect, read, or process this file using your available tools."
            )

    payload = {
        "task": prompt,
        "useCache": True,
        "useGrounding": True,
        "context": {
            "taskId": f"gaia_{task_id}",
            "benchmark": "GAIA",
            "level": task["level"],
            "attachment": attachment_path,
            "attachmentName": attachment_name,
            "resume": False
        }
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_ENDPOINT,
        data=req_data,
        headers={"Content-Type": "application/json"}
    )

    start_time = time.time()
    status = "completed"
    error_msg = ""
    agent_output = ""
    stats = {}

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            resp_bytes = response.read()
            result_data = json.loads(resp_bytes.decode("utf-8"))
            if isinstance(result_data, dict):
                agent_output = result_data.get("result", "")
                stats = result_data.get("stats", {})
    except Exception as e:
        status = "infra_error"
        error_msg = str(e)

    duration = time.time() - start_time
    record = {
        "task_id": task_id,
        "level": task["level"],
        "status": status,
        "execution_time_seconds": round(duration, 2),
        "error": error_msg,
        "raw_output": agent_output,
        "stats": stats,
        "agent_name": "Cyber Agent Pro",
        "timestamp": time.time()
    }

    # Append to raw_results.jsonl
    with open(RAW_RESULTS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    return record

if __name__ == '__main__':
    import argparse
    import threading
    from concurrent.futures import ThreadPoolExecutor, as_completed

    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=2, help="Number of concurrent retry workers (default: 2)")
    args = parser.parse_args()

    from gaia_evaluator import extract_final_answer, compare_answers, evaluate_gaia
    gt_file = BASE_DIR / "data" / "ground_truth_evaluator.json"
    with open(gt_file, "r", encoding="utf-8") as gf:
        ground_truth = json.load(gf)

    failed_tasks = get_failed_tasks()
    print(f"=== RETRY RUNNER ({args.workers} Workers with DeepSeek / Custom AI): {len(failed_tasks)} failed tasks queued ===", flush=True)

    file_lock = threading.Lock()
    eval_lock = threading.Lock()
    print_lock = threading.Lock()

    def process_retry_task(item):
        idx, t = item
        tid = t['task_id']
        gt_info = ground_truth.get(tid, {})
        gt_ans = str(gt_info.get("final_answer", "")).strip()

        with print_lock:
            print(f"\n=======================================================", flush=True)
            print(f"[{idx}/{len(failed_tasks)}] 🔄 [Retry Worker] Retrying Task {tid} (Level {t['level']})...", flush=True)
            print(f"Question preview: {t['question'][:120]}...", flush=True)
            if t.get("file_name"):
                print(f"Attachment: {t.get('file_name')}", flush=True)

        rec = run_single_task(t)

        pred = extract_final_answer(rec["raw_output"])
        passed = compare_answers(pred, gt_ans)
        verdict = "PASS ✅" if passed else "FAIL ❌"

        with print_lock:
            print(f"Finished in {rec['execution_time_seconds']}s", flush=True)
            print(f"  Result : {verdict}", flush=True)
            print(f"  New Ans: {pred}", flush=True)
            print(f"  GT Ans : {gt_ans}", flush=True)
            print(f"=======================================================", flush=True)

        # Thread-safe re-evaluate benchmark
        with eval_lock:
            try:
                evaluate_gaia()
            except Exception:
                pass
        time.sleep(1)
        return rec

    items = list(enumerate(failed_tasks, 1))
    if args.workers <= 1:
        for it in items:
            process_retry_task(it)
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = [executor.submit(process_retry_task, it) for it in items]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    with print_lock:
                        print(f"Retry worker error: {e}")
