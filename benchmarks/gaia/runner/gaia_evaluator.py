import os
import sys
import json
import csv
from pathlib import Path
from scoring import extract_final_answer, compare_answers, normalize_text

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "results"
REPORTS_DIR = BASE_DIR / "reports"

RAW_RESULTS_FILE = RESULTS_DIR / "raw_results.jsonl"
EVAL_RESULTS_FILE = RESULTS_DIR / "evaluator_results.jsonl"
GT_FILE = DATA_DIR / "ground_truth_evaluator.json"

def evaluate_gaia():
    if not RAW_RESULTS_FILE.exists():
        print(f"Error: {RAW_RESULTS_FILE} does not exist.")
        return

    if not GT_FILE.exists():
        print(f"Error: {GT_FILE} does not exist.")
        return

    with open(GT_FILE, "r", encoding="utf-8") as f:
        ground_truth = json.load(f)

    raw_records = []
    with open(RAW_RESULTS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    raw_records.append(json.loads(line))
                except Exception:
                    pass

    # Deduplicate by task_id taking latest
    records_by_task = {}
    for r in raw_records:
        records_by_task[r["task_id"]] = r

    eval_records = []
    level_stats = {
        1: {"pass": 0, "fail": 0, "timeout": 0, "infra_error": 0, "total": 0, "under_5m": 0, "total_time": 0.0},
        2: {"pass": 0, "fail": 0, "timeout": 0, "infra_error": 0, "total": 0, "under_5m": 0, "total_time": 0.0},
        3: {"pass": 0, "fail": 0, "timeout": 0, "infra_error": 0, "total": 0, "under_5m": 0, "total_time": 0.0}
    }

    for task_id, rec in records_by_task.items():
        gt_info = ground_truth.get(task_id, {})
        gt_answer = str(gt_info.get("final_answer", "")).strip()
        lvl = rec.get("level", gt_info.get("level", 1))

        if lvl not in level_stats:
            level_stats[lvl] = {"pass": 0, "fail": 0, "timeout": 0, "infra_error": 0, "total": 0, "under_5m": 0, "total_time": 0.0}

        status = rec.get("status", "completed")
        duration = rec.get("execution_time_seconds", 0)
        level_stats[lvl]["total"] += 1
        level_stats[lvl]["total_time"] += duration
        if duration <= 300:
            level_stats[lvl]["under_5m"] += 1

        extracted_pred = ""
        is_pass = False

        if status == "timeout":
            verdict = "TIMEOUT"
            level_stats[lvl]["timeout"] += 1
        elif status == "infra_error":
            verdict = "INFRA_ERROR"
            level_stats[lvl]["infra_error"] += 1
        else:
            raw_out = rec.get("raw_output", "")
            if "chạm ngưỡng" in raw_out or "tạm hoãn điều phối" in raw_out or "kiệt hạn mức" in raw_out:
                verdict = "INFRA_ERROR"
                level_stats[lvl]["infra_error"] += 1
            else:
                extracted_pred = extract_final_answer(raw_out)
                is_pass = compare_answers(extracted_pred, gt_answer)
                verdict = "PASS" if is_pass else "FAIL"
                if is_pass:
                    level_stats[lvl]["pass"] += 1
                else:
                    level_stats[lvl]["fail"] += 1

        eval_rec = {
            "task_id": task_id,
            "level": lvl,
            "verdict": verdict,
            "is_correct": is_pass,
            "extracted_answer": extracted_pred,
            "ground_truth": gt_answer,
            "duration_seconds": duration,
            "status": status,
            "stats": rec.get("stats", {})
        }
        eval_records.append(eval_rec)

    # Write evaluator_results.jsonl
    with open(EVAL_RESULTS_FILE, "w", encoding="utf-8") as f:
        for r in eval_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # Generate CSV Summary
    csv_file = REPORTS_DIR / "GAIA_SUMMARY.csv"
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Level", "Total Tasks", "Pass", "Fail", "Timeout", "Infra Error", "Accuracy (%)", "Under 5 Min (%)", "Avg Time (s)"])
        
        tot_all = {"pass": 0, "fail": 0, "timeout": 0, "infra_error": 0, "total": 0, "under_5m": 0, "total_time": 0.0}

        for lvl in [1, 2, 3]:
            st = level_stats[lvl]
            for k in tot_all:
                tot_all[k] += st[k]
            valid_den = st["pass"] + st["fail"] + st["timeout"]
            acc = (st["pass"] / valid_den * 100) if valid_den > 0 else 0.0
            u5 = (st["under_5m"] / st["total"] * 100) if st["total"] > 0 else 0.0
            avg_t = (st["total_time"] / st["total"]) if st["total"] > 0 else 0.0
            writer.writerow([f"Level {lvl}", st["total"], st["pass"], st["fail"], st["timeout"], st["infra_error"], f"{acc:.2f}", f"{u5:.2f}", f"{avg_t:.1f}"])

        overall_den = tot_all["pass"] + tot_all["fail"] + tot_all["timeout"]
        overall_acc = (tot_all["pass"] / overall_den * 100) if overall_den > 0 else 0.0
        overall_u5 = (tot_all["under_5m"] / tot_all["total"] * 100) if tot_all["total"] > 0 else 0.0
        overall_avg_t = (tot_all["total_time"] / tot_all["total"]) if tot_all["total"] > 0 else 0.0
        writer.writerow(["Overall", tot_all["total"], tot_all["pass"], tot_all["fail"], tot_all["timeout"], tot_all["infra_error"], f"{overall_acc:.2f}", f"{overall_u5:.2f}", f"{overall_avg_t:.1f}"])

    # Generate Markdown Report
    md_file = REPORTS_DIR / "GAIA_FINAL_REPORT.md"
    with open(md_file, "w", encoding="utf-8") as f:
        f.write("# BÁO CÁO BENCHMARK GAIA - CYBER AGENT PRO\n\n")
        f.write(f"- **Ngày đánh giá:** {Path(__file__).stat().st_mtime}\n")
        f.write(f"- **Hệ thống kiểm thử:** Cyber Agent Pro (Multi-Agent v2.0-ultimate)\n")
        f.write(f"- **Bộ dữ liệu:** GAIA Validation Split (`gaia-benchmark/GAIA`, `2023_all`)\n\n")
        f.write("## 1. Kết quả tổng hợp\n\n")
        f.write("| Cấp độ | Tổng số task | PASS | FAIL | TIMEOUT | INFRA ERROR | Độ chính xác (Accuracy) | Hoàn thành < 5 phút | Thời gian TB (giây) |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n")

        for lvl in [1, 2, 3]:
            st = level_stats[lvl]
            valid_den = st["pass"] + st["fail"] + st["timeout"]
            acc = (st["pass"] / valid_den * 100) if valid_den > 0 else 0.0
            u5 = (st["under_5m"] / st["total"] * 100) if st["total"] > 0 else 0.0
            avg_t = (st["total_time"] / st["total"]) if st["total"] > 0 else 0.0
            f.write(f"| Level {lvl} | {st['total']} | {st['pass']} | {st['fail']} | {st['timeout']} | {st['infra_error']} | **{acc:.2f}%** | {u5:.1f}% | {avg_t:.1f}s |\n")

        f.write(f"| **Tổng cộng (Overall)** | **{tot_all['total']}** | **{tot_all['pass']}** | **{tot_all['fail']}** | **{tot_all['timeout']}** | **{tot_all['infra_error']}** | **{overall_acc:.2f}%** | **{overall_u5:.1f}%** | **{overall_avg_t:.1f}s** |\n\n")

        f.write("## 2. Chi tiết từng task\n\n")
        f.write("| Task ID | Level | Verdict | Extracted Answer | Ground Truth | Duration |\n")
        f.write("| :--- | :---: | :---: | :--- | :--- | :---: |\n")
        for r in eval_records:
            f.write(f"| `{r['task_id'][:12]}` | L{r['level']} | {r['verdict']} | `{str(r['extracted_answer'])[:30]}` | `{str(r['ground_truth'])[:30]}` | {r['duration_seconds']:.1f}s |\n")

    print(f"\n[OK] Evaluation completed.")
    print(f"Overall Accuracy: {overall_acc:.2f}% ({tot_all['pass']}/{overall_den})")
    print(f"Summary report written to {md_file}")

if __name__ == "__main__":
    evaluate_gaia()
