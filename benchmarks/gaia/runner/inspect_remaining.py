import json
from pathlib import Path

BASE = Path("C:/Users/Nam/Desktop/AI agent/benchmarks/gaia/data")
tasks = json.load(open(BASE / "tasks_for_agent.json", encoding="utf-8"))
gt = json.load(open(BASE / "ground_truth_evaluator.json", encoding="utf-8"))

remaining = ['7d4a7d1d', '9318445f', '72e110e7', '0383a3ee', 'a1e91b78']
for t in tasks:
    for r in remaining:
        if t['task_id'].startswith(r):
            tid = t['task_id']
            print("="*60)
            print(f"ID: {tid} (Level {t.get('level')})")
            print(f"File: {t.get('file_name')}")
            print(f"GT: {gt.get(tid, {}).get('final_answer')}")
            print(f"Annotator Metadata: {gt.get(tid, {}).get('annotator_metadata')}")
            print("Question:")
            print(t.get('question'))

