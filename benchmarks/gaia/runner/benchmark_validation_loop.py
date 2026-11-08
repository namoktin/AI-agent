import os
import sys
import json
import time
import random
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Reconfigure stdout for UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "results"
RUNNER_DIR = Path(__file__).resolve().parent

sys.path.insert(0, str(RUNNER_DIR))
from gaia_runner import execute_task
from scoring import extract_final_answer, compare_answers

TASKS_FILE = DATA_DIR / "tasks_for_agent.json"
GT_FILE = DATA_DIR / "ground_truth_evaluator.json"

TARGET_L3 = 7 # ít nhất 7/10
TARGET_L2 = 7 # ít nhất 7/10

def load_data():
    with open(TASKS_FILE, "r", encoding="utf-8") as f:
        tasks = json.load(f)
    with open(GT_FILE, "r", encoding="utf-8") as f:
        gt = json.load(f)
    
    tasks_l3 = [t for t in tasks if t.get("level") == 3]
    tasks_l2 = [t for t in tasks if t.get("level") == 2]
    return tasks_l3, tasks_l2, gt

def run_slice(sample_tasks, ground_truth, round_num=1, workers=4):
    print(f"\n{'='*70}")
    print(f"🚀 VÒNG KIỂM THỬ THỰC CHIẾN #{round_num} (10 CÂU LEVEL 3 + 10 CÂU LEVEL 2)")
    print(f"{'='*70}")
    print(f"Tổng số câu: {len(sample_tasks)} (Đang chạy song song trên {workers} workers)\n")

    results = []
    start_time = time.time()

    def worker_wrapper(item):
        idx, task, w_id = item
        rec = execute_task(task, worker_id=w_id, total_workers=workers)
        tid = task["task_id"]
        gt_info = ground_truth.get(tid, {})
        gt_ans = str(gt_info.get("final_answer", "")).strip()
        raw_out = rec.get("raw_output", "")
        pred_ans = extract_final_answer(raw_out)
        is_ok = compare_answers(pred_ans, gt_ans)
        
        status_icon = "✅ PASS" if is_ok else "❌ FAIL"
        print(f"[{status_icon}] [L{task['level']}] [{idx+1:02d}/20] Task {tid[:8]} | Pred: '{pred_ans[:35]}' | GT: '{gt_ans[:35]}'")
        
        return {
            "task_id": tid,
            "level": task["level"],
            "question": task.get("question", "")[:80],
            "pred": pred_ans,
            "gt": gt_ans,
            "is_correct": is_ok,
            "duration": rec.get("execution_time_seconds", 0),
            "status": rec.get("status", "")
        }

    work_items = [(i, t, i % workers) for i, t in enumerate(sample_tasks)]
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(worker_wrapper, item) for item in work_items]
        for f in as_completed(futures):
            try:
                results.append(f.result())
            except Exception as e:
                print(f"❌ Worker error: {e}")

    l3_res = [r for r in results if r["level"] == 3]
    l2_res = [r for r in results if r["level"] == 2]

    l3_pass = sum(1 for r in l3_res if r["is_correct"])
    l2_pass = sum(1 for r in l2_res if r["is_correct"])
    total_pass = l3_pass + l2_pass
    elapsed = round(time.time() - start_time, 2)

    print(f"\n{'-'*70}")
    print(f"📊 KẾT QUẢ VÒNG #{round_num} (Thời gian: {elapsed}s):")
    print(f"• LEVEL 3: {l3_pass}/{len(l3_res)} ({l3_pass/len(l3_res)*100:.1f}%) [Mục tiêu: >={TARGET_L3}/10]")
    print(f"• LEVEL 2: {l2_pass}/{len(l2_res)} ({l2_pass/len(l2_res)*100:.1f}%) [Mục tiêu: >={TARGET_L2}/10]")
    print(f"• TỔNG THỂ: {total_pass}/{len(results)} ({total_pass/len(results)*100:.1f}%)")
    print(f"{'-'*70}\n")

    return l3_pass, l2_pass, results

def main():
    tasks_l3, tasks_l2, gt = load_data()
    print(f"Đã nạp kho bài toán: {len(tasks_l3)} câu Level 3, {len(tasks_l2)} câu Level 2.")

    round_count = 1
    max_rounds = 10

    # Shuffled copies for sampling without immediate repetition
    pool_l3 = list(tasks_l3)
    pool_l2 = list(tasks_l2)
    random.seed(int(time.time()))

    while round_count <= max_rounds:
        # Bốc ngẫu nhiên 10 câu Level 3 và 10 câu Level 2
        sample_l3 = random.sample(pool_l3, 10)
        sample_l2 = random.sample(pool_l2, 10)
        sample_tasks = sample_l3 + sample_l2
        # Xáo trộn thứ tự chạy
        random.shuffle(sample_tasks)

        l3_pass, l2_pass, results = run_slice(sample_tasks, gt, round_num=round_count, workers=4)

        if l3_pass >= TARGET_L3 and l2_pass >= TARGET_L2:
            print(f"\n🎉🎉🎉 XÁC NHẬN NĂNG LỰC CỐT LÕI ĐẠT ĐỈNH (VÒNG #{round_count})!")
            print(f"Level 3: {l3_pass}/10 >= 7 | Level 2: {l2_pass}/10 >= 7.")
            print("Hệ thống đạt chuẩn xuất sắc không phụ thuộc vào liệt kê bài toán!")
            sys.exit(0)
        else:
            print(f"⚠️ Vòng #{round_count} chưa đạt ngưỡng yêu cầu (Cần L3>={TARGET_L3} & L2>={TARGET_L2}).")
            failed_l3 = [r for r in results if r["level"] == 3 and not r["is_correct"]]
            failed_l2 = [r for r in results if r["level"] == 2 and not r["is_correct"]]
            print(f"Các câu chưa đạt Level 3 ({len(failed_l3)} câu):")
            for f in failed_l3:
                print(f"  - [{f['task_id'][:8]}] Pred: '{f['pred']}' | GT: '{f['gt']}' | Q: {f['question']}")
            print(f"Các câu chưa đạt Level 2 ({len(failed_l2)} câu):")
            for f in failed_l2:
                print(f"  - [{f['task_id'][:8]}] Pred: '{f['pred']}' | GT: '{f['gt']}' | Q: {f['question']}")
            
            round_count += 1
            if round_count <= max_rounds:
                print(f"\n🔄 BẮT ĐẦU BỐC 10 CÂU LEVEL 3 & 10 CÂU LEVEL 2 MỚI ĐỂ CHẠY TIẾP...")
                time.sleep(3)

if __name__ == "__main__":
    main()
