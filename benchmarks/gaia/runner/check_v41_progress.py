import json
import time
from datetime import datetime
from pathlib import Path

BASE_DIR = Path('C:/Users/Nam/Desktop/AI agent/benchmarks/gaia')
RAW_FILE = BASE_DIR / 'results' / 'raw_results.jsonl'
EVAL_FILE = BASE_DIR / 'results' / 'evaluator_results.jsonl'
GT_FILE = BASE_DIR / 'data' / 'ground_truth_evaluator.json'
TASKS_FILE = BASE_DIR / 'data' / 'tasks_for_agent.json'

with open(GT_FILE, 'r', encoding='utf-8') as f:
    gt_data = json.load(f)

# Load evaluator results
eval_map = {}
if EVAL_FILE.exists():
    with open(EVAL_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip(): continue
            try:
                d = json.loads(line)
                eval_map[d['task_id']] = d
            except Exception:
                pass

# Load raw records
raw_records = []
if RAW_FILE.exists():
    with open(RAW_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip(): continue
            try:
                raw_records.append(json.loads(line))
            except Exception:
                pass

# Let's inspect the log of task-35576 (forward runner)
fwd_log = Path('C:/Users/Nam/.gemini/antigravity/brain/5b497de6-9581-4591-a211-6df39eec5973/.system_generated/tasks/task-35576.log')
fwd_finished = []
if fwd_log.exists():
    with open(fwd_log, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if "Finished Task" in line:
                fwd_finished.append(line.strip())

# Let's inspect the log of task-35661 (retry runner)
retry_log = Path('C:/Users/Nam/.gemini/antigravity/brain/5b497de6-9581-4591-a211-6df39eec5973/.system_generated/tasks/task-35661.log')
retry_lines = []
if retry_log.exists():
    with open(retry_log, 'r', encoding='utf-8', errors='ignore') as f:
        retry_lines = [l.strip() for l in f if l.strip()]

print("===============================================================")
print("1. TIẾN ĐỘ SỬA LỖI CỦA 2 RETRY WORKERS (task-35661)")
print("===============================================================")
print(f"Tổng số dòng log của Retry Runner: {len(retry_lines)}")
for l in retry_lines[-20:]:
    print(" ", l)

print("\n===============================================================")
print(f"2. TIẾN ĐỘ CHẠY MỚI CỦA 3 FORWARD WORKERS (task-35576)")
print("===============================================================")
print(f"Tổng số task đã hoàn thành trên luồng Forward từ lúc bật v4.1: {len(fwd_finished)}")
for l in fwd_finished:
    print(" ", l)

# Now let's calculate exact stats for tasks executed under v4.1
# The tasks executed under v4.1 are the tasks finished by task-35576 and task-35661
import re
v41_task_ids = []
for l in fwd_finished:
    m = re.search(r'Finished Task ([0-9a-f\-]+)', l)
    if m:
        v41_task_ids.append(m.group(1))

# Also check retry finished tasks
for l in retry_lines:
    m = re.search(r'Finished Task ([0-9a-f\-]+)', l)
    if m:
        v41_task_ids.append(m.group(1))

print(f"\n===============================================================")
print(f"3. THỐNG KÊ CHI TIẾT CÁC CÂU CHẠY BẰNG DEEPSEEK-V4.1-FLASH ({len(v41_task_ids)} câu hoàn tất)")
print("===============================================================")
v41_pass = 0
v41_fail = 0
for tid in v41_task_ids:
    ev = eval_map.get(tid, {})
    is_correct = ev.get('is_correct', False)
    lvl = ev.get('level', 1)
    ans = ev.get('model_answer', '')
    gt = gt_data.get(tid, '')
    if is_correct:
        v41_pass += 1
        status_str = "PASS ✅"
    else:
        v41_fail += 1
        status_str = "FAIL ❌"
    print(f"  [{tid[:8]}] L{lvl} | {status_str} | Model: '{str(ans)[:25]}' | GT: '{str(gt)[:25]}'")

tot_v41 = v41_pass + v41_fail
if tot_v41 > 0:
    print(f"\n=> TỈ LỆ PASS/FAIL TRÊN V4.1 FLASH: {v41_pass}/{tot_v41} ({v41_pass/tot_v41*100:.2f}% PASS)")
else:
    print("Chưa có task nào hoàn tất ghi nhận.")

# Total GAIA overall stats right now
print(f"\n===============================================================")
print(f"4. TỔNG THỂ BENCHMARK GAIA TOÀN BỘ HIỆN TẠI (165 TASKS)")
print("===============================================================")
tot_eval = len(eval_map)
all_pass = sum(1 for v in eval_map.values() if v.get('is_correct'))
all_fail = tot_eval - all_pass
print(f"Đã hoàn thành đánh giá : {tot_eval} / 165 ({tot_eval/165*100:.1f}%)")
print(f"Còn lại                : {165 - tot_eval} câu")
print(f"Tỷ lệ PASS toàn hệ thống: {all_pass}/{tot_eval} ({all_pass/tot_eval*100:.2f}%)")
