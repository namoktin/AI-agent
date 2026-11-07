import sys
import os
import json
import time
import urllib.request
from pathlib import Path

# Force UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

BASE_DIR = Path('C:/Users/Nam/Desktop/AI agent/benchmarks/gaia')
TASKS_FILE = BASE_DIR / "data" / "tasks_for_agent.json"
GT_FILE = BASE_DIR / "data" / "ground_truth_evaluator.json"
ATTACHMENTS_DIR = BASE_DIR / "data" / "attachments"
API_ENDPOINT = "http://127.0.0.1:3000/api/v2/execute"

sys.path.append(str(BASE_DIR / "runner"))
from scoring import extract_final_answer, compare_answers

# Target 3 hardest tasks that previously failed under Gemini
TARGET_TASK_IDS = [
    "54612da3-fd56-4941-80f4-5eb82330de25",  # Level 2: Locomotives wheels (.xlsx)
    "0bb3b44a-ede5-4db5-a520-4e844b0079c5",  # Level 2: Babylonian symbols math
    "e1fc63a2-da7a-432f-be78-7c4a95598703"   # Level 1: Eliud Kipchoge marathon light-second
]

PREVIOUS_FAILURES = {
    "54612da3-fd56-4941-80f4-5eb82330de25": "120 (Nhầm Whyte notation là số trục xe thay vì số bánh xe, nhân đôi)",
    "0bb3b44a-ede5-4db5-a520-4e844b0079c5": "console.log(babylonValue); (Dính bẫy Anti-Code-Echo trap)",
    "e1fc63a2-da7a-432f-be78-7c4a95598703": "17000 (Sai thứ nguyên, không đổi ra nghìn giờ)"
}

with open(TASKS_FILE, "r", encoding="utf-8") as f:
    all_tasks = {t["task_id"]: t for t in json.load(f)}

with open(GT_FILE, "r", encoding="utf-8") as f:
    gt_data = json.load(f)

print("=" * 65)
print("🚀 KIỂM THỬ THỰC TẾ 3 TASK KHÓ NHẤT TỪNG BỊ LỖI VỚI MODEL GEMINI")
print("Hệ thống: Cyber Agent Pro (Update 17 - Tier 4 Architecture)")
print("Backend: Google Gemini Model Pool (USE_CUSTOM_AI = false)")
print("=" * 65)

results = []

for idx, tid in enumerate(TARGET_TASK_IDS, start=1):
    task = all_tasks.get(tid)
    if not task:
        print(f"[{idx}/3] Không tìm thấy task {tid}")
        continue

    lvl = task["level"]
    q = task["question"]
    prev_fail = PREVIOUS_FAILURES.get(tid, "FAIL")
    raw_gt = gt_data.get(tid, "")
    gt = raw_gt.get("final_answer", "") if isinstance(raw_gt, dict) else str(raw_gt)

    print(f"\n[{idx}/3] Đang chạy Task {tid[:8]} (Level {lvl})...")
    print(f"Câu hỏi: {q[:120]}...")
    if task.get("file_name"):
        print(f"File đính kèm: {task.get('file_name')}")
    print(f"Kết quả lỗi trước đây (Gemini cũ): {prev_fail}")
    print(f"Đáp án chuẩn (Ground Truth): {gt}")

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
        f"--- TASK QUESTION ---\n\n{q}"
    )

    if task.get("attachment_path"):
        att_path = ATTACHMENTS_DIR / task.get("file_name")
        if att_path.exists():
            prompt += (
                f"\n\nAttachment file: {task.get('file_name')}\n"
                f"File location on disk: {att_path.resolve()}\n"
                "You can inspect, read, or process this file using your available tools."
            )

    payload = {
        "task": prompt,
        "level": lvl,
        "context": {
            "taskId": f"gaia_{tid}",
            "benchmark": "GAIA_VERIFICATION_SPLIT"
        }
    }

    t0 = time.time()
    try:
        req = urllib.request.Request(
            API_ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            agent_output = data.get("result", "")
    except Exception as e:
        agent_output = f"ERROR: {e}"

    duration = round(time.time() - t0, 2)
    model_ans = extract_final_answer(agent_output)
    is_correct = compare_answers(model_ans, gt)

    verdict = "PASS ✅" if is_correct else "FAIL ❌"
    print(f"--> Hoàn thành trong {duration}s")
    print(f"--> Raw output preview: {repr(agent_output[-250:] if len(agent_output) > 250 else agent_output)}")
    print(f"--> Đáp án trích xuất: '{model_ans}'")
    print(f"--> Kết quả nghiệm thu: {verdict}")

    results.append({
        "task_id": tid,
        "level": lvl,
        "duration": duration,
        "model_answer": model_ans,
        "ground_truth": gt,
        "is_correct": is_correct,
        "previous_fail": prev_fail
    })

print("\n" + "=" * 65)
print("🏁 TỔNG HỢP KẾT QUẢ KIỂM THỬ 3 TASK KHÓ TRÊN GEMINI:")
print("=" * 65)
passed_count = sum(1 for r in results if r["is_correct"])
print(f"Tỷ lệ thành công: {passed_count}/{len(results)} ({passed_count/len(results)*100:.1f}%)")
for r in results:
    s = "PASS ✅" if r["is_correct"] else "FAIL ❌"
    print(f"[{r['task_id'][:8]}] L{r['level']} | {s} | Model mới: '{r['model_answer']}' | Chuẩn: '{r['ground_truth']}' | Cũ: '{r['previous_fail']}'")
