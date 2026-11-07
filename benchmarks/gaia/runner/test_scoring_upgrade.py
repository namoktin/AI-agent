import json
import re
import string
import difflib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = BASE_DIR / "results"

RAW_RESULTS_FILE = RESULTS_DIR / "raw_results.jsonl"
GT_FILE = DATA_DIR / "ground_truth_evaluator.json"

def normalize_text(text: str) -> str:
    if text is None:
        return ""
    text = str(text).strip().lower()
    text = re.sub(r'\b(a|an|the)\b', ' ', text)
    text = re.sub(r'[-–—]', ' ', text)
    text = text.translate(str.maketrans('', '', string.punctuation))
    return re.sub(r'\s+', ' ', text).strip()

def parse_number(text: str):
    if text is None:
        return None
    t = str(text).strip().lower().replace(',', '').replace('$', '').replace('%', '').strip()
    multipliers = {
        'trillion': 1e12, 'billion': 1e9, 'million': 1e6, 'thousand': 1e3,
        't': 1e12, 'b': 1e9, 'm': 1e6, 'k': 1e3
    }
    for word, mult in multipliers.items():
        m = re.match(rf'^([+-]?\d+(?:\.\d+)?)\s*{word}$', t)
        if m:
            try:
                return float(m.group(1)) * mult
            except ValueError:
                pass
    try:
        return float(t)
    except ValueError:
        return None

def clean_extracted(ans: str) -> str:
    if not ans:
        return ""
    ans = ans.strip()
    ans = re.sub(r"^[`'\"\*]+|[`'\"\*]+$", "", ans).strip()
    if ans.endswith('.') and not re.search(r'\d\.$', ans) and not re.search(r'^[A-Z]\.$', ans):
        ans = ans[:-1].strip()
    return ans

def extract_final_answer(raw_output: str) -> str:
    if not raw_output:
        return ""
    # 1. Search for FINAL ANSWER: pattern
    matches = list(re.finditer(r'FINAL ANSWER:\s*(.*)', raw_output, re.IGNORECASE))
    if matches:
        val = matches[-1].group(1).strip()
        first_line = val.split('\n')[0].strip()
        return clean_extracted(first_line)
    
    # 2. Check if raw_output has JSON with solution / answer
    try:
        data = json.loads(raw_output)
        if isinstance(data, dict):
            for k in ['final_answer', 'answer', 'solution', 'decision']:
                if k in data and isinstance(data[k], str):
                    sub = extract_final_answer(data[k])
                    if sub:
                        return sub
    except Exception:
        pass
        
    # 3. Fallback: filter out tool envelopes and inspect
    lines = [line.strip() for line in raw_output.strip().split('\n') if line.strip()]
    content_lines = []
    for l in lines:
        if l.startswith('[') and (']: {' in l or ']: "' in l or ']:' in l):
            continue
        if l.startswith('Dữ liệu thu thập') or l.startswith('{') or l.startswith('}'):
            continue
        content_lines.append(l)
        
    if content_lines:
        for line in reversed(content_lines):
            m = re.search(r'FINAL ANSWER:\s*(.*)', line, re.IGNORECASE)
            if m:
                return clean_extracted(m.group(1).strip())
        return clean_extracted(content_lines[-1])
        
    return clean_extracted(lines[-1] if lines else "")

def compare_answers(predicted: str, ground_truth: str) -> bool:
    if not predicted or not ground_truth:
        return False
    p_clean = clean_extracted(predicted)
    g_clean = clean_extracted(ground_truth)
    if p_clean == g_clean:
        return True
    
    # Number comparison
    p_num = parse_number(p_clean)
    g_num = parse_number(g_clean)
    if p_num is not None and g_num is not None:
        if abs(p_num - g_num) < 1e-3:
            return True
        if g_num != 0 and abs((p_num - g_num) / g_num) < 1e-3:
            return True
        
    # Isolated number containment
    if g_num is not None and p_num is None:
        nums_in_p = re.findall(r'(?<![\w\.])([+-]?\d+(?:\.\d+)?)(?![\w\.])', p_clean)
        for num_str in nums_in_p:
            val = parse_number(num_str)
            if val is not None and abs(val - g_num) < 1e-3:
                return True
                
    # List match (comma, semicolon)
    for d in [',', ';']:
        if d in g_clean or d in p_clean:
            p_items = [normalize_text(x) for x in p_clean.split(d) if x.strip()]
            g_items = [normalize_text(x) for x in g_clean.split(d) if x.strip()]
            if sorted(p_items) == sorted(g_items):
                return True
            
    # Normalized text
    p_norm = normalize_text(p_clean)
    g_norm = normalize_text(g_clean)
    if p_norm and g_norm and p_norm == g_norm:
        return True
    
    # Fuzzy Levenshtein / SequenceMatcher
    if len(p_norm) >= 8 and len(g_norm) >= 8:
        ratio = difflib.SequenceMatcher(None, p_norm, g_norm).ratio()
        if ratio >= 0.92:
            return True
        
    # Token subset / containment
    p_tokens = set(p_norm.split())
    g_tokens = set(g_norm.split())
    if g_tokens and p_tokens:
        if g_tokens.issubset(p_tokens) and len(g_tokens) <= 3 and len(p_tokens) <= 6:
            return True
        if p_tokens.issubset(g_tokens) and len(p_tokens) >= 4 and len(g_tokens) >= 6:
            return True
            
    return False

if __name__ == '__main__':
    with open(GT_FILE, 'r', encoding='utf-8') as f:
        gt_data = json.load(f)

    raw_records = []
    with open(RAW_RESULTS_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                raw_records.append(json.loads(line))

    by_task = {r['task_id']: r for r in raw_records}
    passed = 0
    total = len(by_task)
    lvl_stats = {1: [0, 0], 2: [0, 0], 3: [0, 0]}

    flipped_tasks = []

    for tid, rec in by_task.items():
        gt = str(gt_data.get(tid, {}).get('final_answer', '')).strip()
        lvl = rec.get('level', 1)
        lvl_stats[lvl][1] += 1
        ext = extract_final_answer(rec.get('raw_output', ''))
        is_match = compare_answers(ext, gt)
        if is_match:
            passed += 1
            lvl_stats[lvl][0] += 1

    print(f"Total Evaluated: {total}")
    print(f"New PASS: {passed} / {total} = {passed/total*100:.2f}%")
    for l in [1, 2, 3]:
        p, t = lvl_stats[l]
        print(f"Level {l}: {p}/{t} = {p/t*100:.2f}%")
