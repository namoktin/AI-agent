import json
from pathlib import Path

BASE_DIR = Path('C:/Users/Nam/Desktop/AI agent/benchmarks/gaia')
RAW_FILE = BASE_DIR / 'results' / 'raw_results.jsonl'
EVAL_FILE = BASE_DIR / 'results' / 'evaluator_results.jsonl'
TASKS_FILE = BASE_DIR / 'data' / 'tasks_for_agent.json'
GT_FILE = BASE_DIR / 'data' / 'ground_truth_evaluator.json'
RETRY_FILE = BASE_DIR / 'runner' / 'results' / 'retry_results.jsonl'

with open(TASKS_FILE, 'r', encoding='utf-8') as f:
    all_tasks = json.load(f)

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
            except Exception as e:
                pass

print(f"=== TỔNG THỂ TOÀN BỘ BENCHMARK GAIA (165 TASKS) ===")
print(f"Tổng số task trong bộ đề: {len(all_tasks)}")
print(f"Số task đã hoàn thành đánh giá: {len(eval_map)} / 165 ({len(eval_map)/len(all_tasks)*100:.1f}%)")
print(f"Số task còn lại chưa chạy xong: {165 - len(eval_map)}")

passes = [v for v in eval_map.values() if v.get('is_correct')]
fails = [v for v in eval_map.values() if not v.get('is_correct')]

print(f"\nKết quả trên các task đã đánh giá ({len(eval_map)} task):")
print(f"  ✅ PASS: {len(passes)} ({len(passes)/len(eval_map)*100:.2f}%)")
print(f"  ❌ FAIL: {len(fails)} ({len(fails)/len(eval_map)*100:.2f}%)")

by_lvl = {}
for v in eval_map.values():
    lvl = v.get('level', 1)
    if lvl not in by_lvl:
        by_lvl[lvl] = {'pass': 0, 'fail': 0}
    if v.get('is_correct'):
        by_lvl[lvl]['pass'] += 1
    else:
        by_lvl[lvl]['fail'] += 1

print("\nChi tiết theo cấp độ (Level):")
for lvl, s in sorted(by_lvl.items()):
    tot_l = s['pass'] + s['fail']
    print(f"  - Level {lvl}: {s['pass']}/{tot_l} ({s['pass']/tot_l*100:.2f}%)")

# Check retry history
print(f"\n=== TIẾN TRÌNH RETRY (SỬA CÁC CÂU TỪNG SAI) ===")
# Look at raw_results to see tasks that had multiple attempts
task_attempts = {}
with open(RAW_FILE, 'r', encoding='utf-8') as f:
    for line in f:
        if not line.strip(): continue
        try:
            d = json.loads(line)
            tid = d.get('task_id')
            if tid not in task_attempts:
                task_attempts[tid] = []
            task_attempts[tid].append(d)
        except Exception:
            pass

retried_tasks = {tid: atts for tid, atts in task_attempts.items() if len(atts) > 1}
print(f"Số task có nhiều lượt chạy (đã từng chạy lại): {len(retried_tasks)}")

# Count how many failed tasks turned into PASS
flipped_to_pass = []
still_fail = []
for tid, atts in retried_tasks.items():
    first_attempt = atts[0]
    last_attempt = atts[-1]
    is_now_pass = eval_map.get(tid, {}).get('is_correct', False)
    # Check if first attempt was fail
    first_pass = first_attempt.get('is_correct', False)
    if not first_pass and is_now_pass:
        flipped_to_pass.append((tid, atts[0].get('level', 1), last_attempt.get('final_answer', '')))
    elif not first_pass and not is_now_pass:
        still_fail.append((tid, atts[0].get('level', 1)))

print(f"Số câu từ SAI chuyển thành ĐÚNG (Flipped to PASS): {len(flipped_to_pass)}")
for tid, lvl, ans in flipped_to_pass:
    print(f"  🎉 [L{lvl}] Task {tid[:8]}: Đáp án đúng -> '{ans[:30]}'")

# Check retry runner log
retry_log = Path('C:/Users/Nam/.gemini/antigravity/brain/5b497de6-9581-4591-a211-6df39eec5973/.system_generated/tasks/task-35582.log')
if retry_log.exists():
    with open(retry_log, 'r', encoding='utf-8', errors='ignore') as f:
        r_lines = f.readlines()
    print(f"\nLog Retry Runner hiện tại ({len(r_lines)} dòng):")
    for l in r_lines[-15:]:
        print("  " + l.strip())

# Check forward runner log
fwd_log = Path('C:/Users/Nam/.gemini/antigravity/brain/5b497de6-9581-4591-a211-6df39eec5973/.system_generated/tasks/task-35576.log')
if fwd_log.exists():
    with open(fwd_log, 'r', encoding='utf-8', errors='ignore') as f:
        f_lines = f.readlines()
    print(f"\nLog Forward Runner hiện tại ({len(f_lines)} dòng):")
    for l in f_lines[-15:]:
        print("  " + l.strip())
