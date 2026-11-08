import os
import sys
import time
import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request
import urllib.error
from pathlib import Path

# Force UTF-8 stdout/stderr on Windows to avoid UnicodeEncodeError
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "results"
RAW_RESULTS_FILE = RESULTS_DIR / "raw_results.jsonl"
TRACES_DIR = RESULTS_DIR / "traces"

API_ENDPOINT = "http://127.0.0.1:3000/api/v2/execute"
TIMEOUT_SECONDS = 600 # 10 minutes max per task

SYSTEM_INSTRUCTION = """You are a general AI assistant. Solve the task using available tools, resources, and capabilities. You may browse the web, inspect files, process data, execute code, and use other available tools as needed.

Carefully complete the requested task. Your final answer must end with:

FINAL ANSWER: [YOUR ANSWER]

The final answer should be a number, a few words, or a comma-separated list of numbers and/or strings, depending on the question.

For numerical answers, do not include units, currency symbols, commas as thousands separators, or percent signs unless explicitly requested.

For string answers, use the shortest unambiguous answer, without unnecessary articles or explanations.

Do not invent information. If you cannot solve the task, report that honestly.

Do not put additional content after the FINAL ANSWER line."""

def load_completed_task_ids():
    completed = set()
    if RAW_RESULTS_FILE.exists():
        with open(RAW_RESULTS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        record = json.loads(line)
                        if record.get("status") == "completed":
                            completed.add(record.get("task_id"))
                    except Exception:
                        pass
    return completed

def build_prompt(task_dict):
    question = task_dict["question"]
    attachment_path = task_dict.get("attachment_path")
    file_name = task_dict.get("file_name")

    prompt_parts = [SYSTEM_INSTRUCTION, "\n--- TASK QUESTION ---", question]
    if attachment_path and Path(attachment_path).exists():
        prompt_parts.append(f"\nAttachment file: {file_name}\nFile location on disk: {attachment_path}\nYou can inspect, read, or process this file using your available tools.")

    return "\n\n".join(prompt_parts)

def execute_task(task_dict, worker_id=0, total_workers=1):
    task_id = task_dict["task_id"]
    level = task_dict["level"]
    prompt = build_prompt(task_dict)

    payload = {
        "task": prompt,
        "useCache": True,
        "useGrounding": True,
        "context": {
            "taskId": f"gaia_{task_id}",
            "benchmark": "GAIA",
            "level": level,
            "attachment": task_dict.get("attachment_path"),
            "workerId": worker_id,
            "totalWorkers": total_workers
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
    raw_response_text = ""
    result_data = {}

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            resp_bytes = response.read()
            raw_response_text = resp_bytes.decode("utf-8")
            result_data = json.loads(raw_response_text)
    except urllib.error.HTTPError as he:
        status = "infra_error"
        error_msg = f"HTTP {he.code}: {he.reason}"
    except urllib.error.URLError as ue:
        if "timed out" in str(ue).lower():
            status = "timeout"
            error_msg = f"Task timed out after {TIMEOUT_SECONDS}s"
        else:
            status = "infra_error"
            error_msg = f"URLError: {ue.reason}"
    except TimeoutError:
        status = "timeout"
        error_msg = f"Task timed out after {TIMEOUT_SECONDS}s"
    except Exception as e:
        status = "infra_error"
        error_msg = str(e)

    duration = time.time() - start_time

    agent_output = ""
    stats = {}
    if isinstance(result_data, dict):
        agent_output = result_data.get("result", "")
        stats = result_data.get("stats", {})

    if "chạm ngưỡng" in agent_output or "tạm hoãn điều phối" in agent_output or "kiệt hạn mức" in agent_output:
        status = "infra_error"
        error_msg = "Gemini API Quota/RateLimit Exceeded"

    record = {
        "task_id": task_id,
        "level": level,
        "status": status,
        "execution_time_seconds": round(duration, 2),
        "error": error_msg,
        "raw_output": agent_output,
        "stats": stats,
        "agent_name": "Cyber Agent Pro",
        "timestamp": time.time()
    }

    # Save detailed trace
    trace_file = TRACES_DIR / f"{task_id}.json"
    TRACES_DIR.mkdir(parents=True, exist_ok=True)
    with open(trace_file, "w", encoding="utf-8") as tf:
        json.dump({
            "task_id": task_id,
            "level": level,
            "question": task_dict["question"],
            "prompt_sent": prompt,
            "response": result_data,
            "duration": duration,
            "status": status
        }, tf, indent=2, ensure_ascii=False)

    return record

def run_gaia_benchmark(target_level=None, max_tasks=None, fresh=False, workers=4):
    tasks_file = DATA_DIR / "tasks_for_agent.json"
    if not tasks_file.exists():
        print(f"Error: {tasks_file} not found. Please run download_gaia.py first.")
        return

    with open(tasks_file, "r", encoding="utf-8") as f:
        tasks = json.load(f)

    if target_level:
        tasks = [t for t in tasks if t["level"] == target_level]

    if max_tasks:
        tasks = tasks[:max_tasks]

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    if fresh:
        ts = int(time.time())
        if RAW_RESULTS_FILE.exists():
            arc = RESULTS_DIR / f"raw_results_pre_fresh_{ts}.jsonl"
            import shutil
            shutil.copy2(RAW_RESULTS_FILE, arc)
            open(RAW_RESULTS_FILE, "w", encoding="utf-8").close()
            print(f"[Fresh Run] Cleared raw_results.jsonl (archived to {arc.name})")
        eval_file = RESULTS_DIR / "evaluator_results.jsonl"
        if eval_file.exists():
            eval_arc = RESULTS_DIR / f"evaluator_results_pre_fresh_{ts}.jsonl"
            import shutil
            shutil.copy2(eval_file, eval_arc)
            open(eval_file, "w", encoding="utf-8").close()
        completed_ids = set()
    else:
        completed_ids = load_completed_task_ids()

    remaining = [t for t in tasks if t["task_id"] not in completed_ids]

    print(f"=== CYBER AGENT PRO - GAIA BENCHMARK RUNNER ===")
    print(f"Total tasks in queue: {len(tasks)}")
    print(f"Already completed: {len(completed_ids)}")
    print(f"Remaining to run: {len(remaining)}")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    import queue
    file_lock = threading.Lock()
    eval_lock = threading.Lock()
    print_lock = threading.Lock()

    worker_queue = queue.Queue()
    for w in range(workers):
        worker_queue.put(w)

    def process_task_item(item):
        idx, task = item
        task_id = task["task_id"]
        lvl = task["level"]
        w_id = worker_queue.get()
        try:
            with print_lock:
                print(f"\n[Worker #{w_id}] [{idx}/{len(remaining)}] Running Task {task_id} (Level {lvl})...")
                print(f"Question preview: {task['question'][:120]}...")
                if task.get("attachment_path"):
                    print(f"Attachment: {task.get('file_name')}")

            record = execute_task(task, worker_id=w_id, total_workers=workers)

            with print_lock:
                print(f"[Worker #{w_id}] [{idx}/{len(remaining)}] Finished Task {task_id} in {record['execution_time_seconds']}s | Status: {record['status']}")

            # Thread-safe append to raw_results.jsonl
            with file_lock:
                with open(RAW_RESULTS_FILE, "a", encoding="utf-8") as f:
                    f.write(json.dumps(record, ensure_ascii=False) + "\n")

            # Periodically update evaluation report
            with eval_lock:
                try:
                    from gaia_evaluator import evaluate_gaia
                    evaluate_gaia()
                except Exception as eval_err:
                    pass

            if record.get("status") == "infra_error":
                time.sleep(5)
            else:
                time.sleep(1)

            return record
        finally:
            worker_queue.put(w_id)

    if workers <= 1:
        for idx, task in enumerate(remaining, start=1):
            process_task_item((idx, task))
    else:
        print(f"🚀 Launching Parallel Concurrency Pool with {workers} simultaneous workers!")
        items = list(enumerate(remaining, start=1))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(process_task_item, item) for item in items]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    with print_lock:
                        print(f"Worker task error: {e}")

    print("\nBenchmark run session finished.")
    try:
        from gaia_evaluator import evaluate_gaia
        evaluate_gaia()
    except Exception:
        pass

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", type=int, default=None, help="Specific level to run (1, 2, or 3)")
    parser.add_argument("--max", type=int, default=None, help="Max number of tasks to run")
    parser.add_argument("--workers", type=int, default=4, help="Number of concurrent workers (default: 4)")
    parser.add_argument("--fresh", action="store_true", help="Start fresh benchmark run from task 1 (clear previous raw results)")
    args = parser.parse_args()

    run_gaia_benchmark(target_level=args.level, max_tasks=args.max, fresh=args.fresh, workers=args.workers)
