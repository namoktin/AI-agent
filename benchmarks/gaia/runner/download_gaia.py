import os
import sys
import json
import shutil
from pathlib import Path

def download_and_prepare_gaia():
    try:
        from huggingface_hub import snapshot_download, hf_hub_download
        import pyarrow.parquet as pq
    except ImportError:
        print("Missing huggingface_hub or pyarrow. Please install them.")
        sys.exit(1)

    base_dir = Path(__file__).resolve().parent.parent
    data_dir = base_dir / "data"
    raw_dir = data_dir / "raw"
    attachments_dir = data_dir / "attachments"
    data_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(parents=True, exist_ok=True)
    attachments_dir.mkdir(parents=True, exist_ok=True)

    print("Step 1: Downloading GAIA validation split from Hugging Face Hub...")
    try:
        # STRICTLY ONLY DOWNLOAD VALIDATION FILES (2023/validation/*)
        repo_path = snapshot_download(
            repo_id="gaia-benchmark/GAIA",
            repo_type="dataset",
            local_dir=str(raw_dir),
            allow_patterns=["2023/validation/*"]
        )
        print(f"Validation files downloaded to: {repo_path}")
    except Exception as e:
        print(f"Failed to download validation files: {e}")
        return False

    val_dir = raw_dir / "2023" / "validation"
    parquet_path = val_dir / "metadata.parquet"
    if not parquet_path.exists():
        print(f"Error: {parquet_path} does not exist.")
        return False

    print(f"Step 2: Parsing {parquet_path}...")
    table = pq.read_table(str(parquet_path))
    df = table.to_pandas()
    total_tasks = len(df)
    print(f"Total validation tasks loaded: {total_tasks}")

    level_counts = {}
    agent_tasks = []
    ground_truth = {}

    for _, row in df.iterrows():
        task_id = str(row["task_id"])
        question = str(row["Question"])
        level = int(row["Level"])
        file_name = str(row.get("file_name", "") or "")
        final_answer = str(row.get("Final answer", "") or "").strip()
        annotator_meta = row.get("Annotator Metadata", {})

        level_counts[level] = level_counts.get(level, 0) + 1

        attachment_dest = ""
        if file_name and file_name != "nan" and file_name.strip():
            fn = file_name.strip()
            src_file = val_dir / fn
            if src_file.exists():
                dest_file = attachments_dir / fn
                if not dest_file.exists():
                    shutil.copy2(src_file, dest_file)
                attachment_dest = str(dest_file)

        # STRICT DATA ISOLATION:
        # Agent task ONLY contains task_id, Question, Level, file_name, attachment_path
        agent_task = {
            "task_id": task_id,
            "level": level,
            "question": question,
            "file_name": file_name if file_name != "nan" else "",
            "attachment_path": attachment_dest
        }
        agent_tasks.append(agent_task)

        # Ground truth strictly isolated
        ground_truth[task_id] = {
            "task_id": task_id,
            "level": level,
            "final_answer": final_answer,
            "annotator_metadata": annotator_meta if isinstance(annotator_meta, dict) else {}
        }

    print("\nTask counts per level:")
    for lvl in sorted(level_counts.keys()):
        print(f"  Level {lvl}: {level_counts[lvl]}")
    print(f"  Total: {total_tasks}")

    agent_file = data_dir / "tasks_for_agent.json"
    with open(agent_file, "w", encoding="utf-8") as f:
        json.dump(agent_tasks, f, indent=2, ensure_ascii=False)
    print(f"\n[OK] Agent tasks saved to: {agent_file} ({len(agent_tasks)} tasks, NO answers)")

    gt_file = data_dir / "ground_truth_evaluator.json"
    with open(gt_file, "w", encoding="utf-8") as f:
        json.dump(ground_truth, f, indent=2, ensure_ascii=False)
    print(f"[OK] Evaluator ground truth saved to: {gt_file} ({len(ground_truth)} entries, isolated)")

    return True

if __name__ == "__main__":
    download_and_prepare_gaia()
