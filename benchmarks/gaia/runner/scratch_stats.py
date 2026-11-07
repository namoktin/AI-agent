import json

def get_stats(path):
    seen = {}
    levels = {}
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                tid = d.get('task_id')
                is_p = d.get('is_correct', False) or d.get('eval_result', {}).get('is_correct', False)
                lvl = d.get('level', 1)
                ans = d.get('final_answer', d.get('model_answer', ''))
                seen[tid] = {'level': lvl, 'is_correct': is_p, 'ans': str(ans)[:40]}
            except Exception as e:
                pass
    passes = 0
    total = len(seen)
    for tid, v in seen.items():
        lvl = v['level']
        if v['is_correct']:
            passes += 1
        if lvl not in levels:
            levels[lvl] = [0, 0]
        levels[lvl][1] += 1
        if v['is_correct']:
            levels[lvl][0] += 1
    return total, passes, levels, list(seen.items())[-10:]

tot, p, lvls, last = get_stats('C:/Users/Nam/Desktop/AI agent/benchmarks/gaia/results/raw_results.jsonl')
print(f"RAW RESULTS: {tot} tasks, {p} PASS ({p/tot*100:.2f}%)")
for l, s in sorted(lvls.items()):
    print(f"  Level {l}: {s[0]}/{s[1]} ({s[0]/s[1]*100:.2f}%)")

print("\nLast 10 evaluated tasks:")
for tid, v in last:
    status = "PASS ✅" if v['is_correct'] else "FAIL ❌"
    print(f"  [{tid[:8]}] L{v['level']} | {status} | Ans: {v['ans']}")
