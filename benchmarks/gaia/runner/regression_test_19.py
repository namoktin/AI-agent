import os
import sys
import time
import json
import urllib.request
import urllib.error
from pathlib import Path

# Force UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "results"
FAILED_ANALYSIS_FILE = RESULTS_DIR / "failed_analysis.json"
REGRESSION_OUTPUT_FILE = RESULTS_DIR / "regression_19_results.jsonl"
GT_FILE = DATA_DIR / "ground_truth_evaluator.json"

API_ENDPOINT = "http://127.0.0.1:3000/api/v2/execute"
TIMEOUT_SECONDS = 300

from scoring import extract_final_answer, compare_answers

SYSTEM_INSTRUCTION = """You are a general AI assistant. Solve the task using available tools, resources, and capabilities. You may browse the web, inspect files, process data, execute code, and use other available tools as needed.

Carefully complete the requested task. Your final answer must end with:

FINAL ANSWER: [YOUR ANSWER]

The final answer should be a number, a few words, or a comma-separated list of numbers and/or strings, depending on the question.

For numerical answers, do not include units, currency symbols, commas as thousands separators, or percent signs unless explicitly requested.

For string answers, use the shortest unambiguous answer, without unnecessary articles or explanations.

Do not invent information. If you cannot solve the task, report that honestly.

Do not put additional content after the FINAL ANSWER line."""

def run_regression_test(target_index=None, target_task_id=None, max_count=None):
    if not FAILED_ANALYSIS_FILE.exists():
        print(f"Error: {FAILED_ANALYSIS_FILE} not found.")
        return

    with open(FAILED_ANALYSIS_FILE, "r", encoding="utf-8") as f:
        failed_tasks = json.load(f)

    with open(GT_FILE, "r", encoding="utf-8") as f:
        ground_truth = json.load(f)

    if target_index is not None:
        failed_tasks = [failed_tasks[target_index - 1]]
    elif target_task_id:
        failed_tasks = [t for t in failed_tasks if t["task_id"].startswith(target_task_id)]
    elif max_count:
        failed_tasks = failed_tasks[:max_count]

    print(f"===============================================================")
    print(f"🧪 BẮT ĐẦU REGRESSION BENCHMARK CHO {len(failed_tasks)} CÂU THẤT BẠI CŨ")
    print(f"===============================================================")

    results = []
    pass_count = 0
    fail_count = 0

    for idx, item in enumerate(failed_tasks, 1):
        task_id = item["task_id"]
        question = item["question"]
        attachment = item.get("attachment")
        gt_answer = str(ground_truth.get(task_id, {}).get("final_answer", "")).strip()

        print(f"[{idx}/19] Running Task {task_id[:8]}...")
        print(f"Q: {question[:100]}...")

        # Build prompt
        prompt_parts = [SYSTEM_INSTRUCTION, "\n--- TASK QUESTION ---", question]
        if attachment:
            att_path = DATA_DIR / "attachments" / attachment
            if att_path.exists():
                prompt_parts.append(f"\nAttachment file: {attachment}\nFile location on disk: {att_path}\nYou can inspect, read, or process this file using your available tools.")

        full_prompt = "\n\n".join(prompt_parts)

        payload = {
            "task": full_prompt,
            "useCache": False,
            "context": {
                "taskId": f"reg_{task_id}_{int(time.time())}",
                "benchmark": "GAIA_REGRESSION",
                "attachment": str(DATA_DIR / "attachments" / attachment) if attachment else ""
            }
        }

        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(API_ENDPOINT, data=req_data, headers={"Content-Type": "application/json"})

        start_time = time.time()
        agent_raw_output = ""
        status = "completed"

        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
                resp_bytes = response.read()
                res_obj = json.loads(resp_bytes.decode("utf-8"))
                agent_raw_output = res_obj.get("result", "")
        except Exception as e:
            status = "infra_error"
            agent_raw_output = str(e)

        duration = time.time() - start_time
        extracted = extract_final_answer(agent_raw_output)
        is_pass = compare_answers(extracted, gt_answer)

        verdict = "PASS" if is_pass else ("INFRA_ERROR" if status == "infra_error" else "FAIL")
        if is_pass:
            pass_count += 1
            status_icon = "✅ PASS"
        else:
            fail_count += 1
            status_icon = "❌ FAIL"

        print(f"Result: {status_icon} | Extracted: '{extracted}' | GT: '{gt_answer}' | Time: {duration:.1f}s\n")

        rec = {
            "task_id": task_id,
            "question": question,
            "old_predicted": item.get("predicted", ""),
            "new_predicted": extracted,
            "ground_truth": gt_answer,
            "verdict": verdict,
            "is_pass": is_pass,
            "duration": round(duration, 2)
        }
        results.append(rec)

        with open(REGRESSION_OUTPUT_FILE, "a", encoding="utf-8") as rf:
            rf.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"===============================================================")
    print(f"📊 KẾT QUẢ KIỂM THỬ HỒI QUY: {pass_count}/19 PASS ({(pass_count/len(failed_tasks))*100:.1f}%)")
    print(f"===============================================================")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--index", type=int, default=None, help="1-based index of task to run (1 to 19)")
    parser.add_argument("--task_id", type=str, default=None, help="Task ID or prefix to run")
    parser.add_argument("--max", type=int, default=None, help="Max number of tasks to run")
    args = parser.parse_args()

    run_regression_test(target_index=args.index, target_task_id=args.task_id, max_count=args.max)

