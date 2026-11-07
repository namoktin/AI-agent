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
TIMEOUT_SECONDS = 300

def get_failed_tasks():
    if not EVAL_RESULTS_FILE.exists():
        return []
    
    with open(TASKS_FILE, "r", encoding="utf-8") as f:
        all_tasks = {t["task_id"]: t for t in json.load(f)}
        
    failed_ids = []
    with open(EVAL_RESULTS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rec = json.loads(line)
                if not rec.get("is_correct"):
                    failed_ids.append(rec["task_id"])
                    
    # Prioritize tasks: tool envelope leaks first, then others
    raw_by_id = {}
    if RAW_RESULTS_FILE.exists():
        with open(RAW_RESULTS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    r = json.loads(line)
                    raw_by_id[r["task_id"]] = r
                    
    recently_run = {
        'cca530fc', 'cffe0e32', 'e142056d', '023e9d44', '04a04a9b',
        '08f3a05f', '0b260a57', '0bb3b44a', '16d825ff', '1dcc160f',
        '20194330', '4d51c4bf', '2dfc4c37', '56137764', '624cbf11'
    }
    def priority_key(tid):
        is_recent = any(tid.startswith(r) for r in recently_run)
        raw = raw_by_id.get(tid, {}).get("raw_output", "")
        # Tool envelope leak gets top priority
        has_leak = "Dữ liệu thu thập từ các công cụ:" in raw or raw.startswith("[")
        return (1 if is_recent else 0, 0 if has_leak else 1, all_tasks[tid].get("level", 2))
        
    failed_ids.sort(key=priority_key)
    return [all_tasks[tid] for tid in failed_ids if tid in all_tasks]

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
    failed_tasks = get_failed_tasks()
    print(f"=== RETRY RUNNER: {len(failed_tasks)} failed tasks queued ===", flush=True)
    for idx, t in enumerate(failed_tasks, 1):
        print(f"[{idx}/{len(failed_tasks)}] Retrying Task {t['task_id']} (Level {t['level']})...", flush=True)
        rec = run_single_task(t)
        print(f"Finished in {rec['execution_time_seconds']}s | Status: {rec['status']}", flush=True)
        # Re-evaluate periodically
        if idx % 5 == 0 or idx == len(failed_tasks):
            from gaia_evaluator import evaluate_gaia
            evaluate_gaia()
