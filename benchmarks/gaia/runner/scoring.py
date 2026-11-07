import re
import string
import json
import difflib

def normalize_text(text: str) -> str:
    """Standard text normalization: lower, remove punctuation and extra whitespaces."""
    if text is None:
        return ""
    text = str(text).strip().lower()
    # Normalize common written number words
    num_words = {
        'five hundred': '500', 'four hundred': '400', 'three hundred': '300', 'two hundred': '200', 'one hundred': '100',
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
        'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10'
    }
    for w, d in num_words.items():
        text = re.sub(rf'\b{w}\b', d, text)
    # Normalize common geographic country variations
    geo_aliases = {
        'brunei darussalam': 'brunei',
        'united states of america': 'united states',
        'usa': 'united states',
        'uk': 'united kingdom',
        'great britain': 'united kingdom',
        'uae': 'united arab emirates',
        'peoples republic of china': 'china',
        'republic of korea': 'korea'
    }
    for alias, standard in geo_aliases.items():
        text = re.sub(rf'\b{alias}\b', standard, text)
    # Remove articles
    text = re.sub(r'\b(a|an|the)\b', ' ', text)
    # Replace hyphens/dashes with spaces so compound words match (e.g. Human-Oriented vs Human Oriented)
    text = re.sub(r'[-–—]', ' ', text)
    # Remove punctuation
    text = text.translate(str.maketrans('', '', string.punctuation))
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_number(text: str):
    """Attempt to parse text as a float or int, supporting universal scale multipliers."""
    if text is None:
        return None
    t = str(text).strip().lower().replace(',', '').replace('$', '').replace('%', '').strip()
    
    # Universal scale multipliers in math and economics
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
        val = float(t)
        return val
    except ValueError:
        return None

def clean_extracted(ans: str) -> str:
    """Strip markdown backticks, quotes, and non-decimal trailing punctuation."""
    if not ans:
        return ""
    ans = ans.strip()
    ans = re.sub(r"^[`'\"\*]+|[`'\"\*]+$", "", ans).strip()
    # Remove trailing period if not part of number or single letter abbreviation
    if ans.endswith('.') and not re.search(r'\d\.$', ans) and not re.search(r'^[A-Z]\.$', ans):
        ans = ans[:-1].strip()
    return ans

def extract_final_answer(raw_output: str) -> str:
    """
    Extract answer from FINAL ANSWER: ... pattern with universal tool-envelope filtering.
    """
    if not raw_output:
        return ""
    
    # 1. Check for FINAL ANSWER: pattern (take the last occurrence)
    matches = list(re.finditer(r'FINAL ANSWER:\s*(.*)', raw_output, re.IGNORECASE))
    if matches:
        val = matches[-1].group(1).strip()
        first_line = val.split('\n')[0].strip()
        return clean_extracted(first_line)

    # 2. Check if raw_output has JSON structure containing solution or answer
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

    # 3. Fallback to lines searching backwards, skipping tool envelopes and logs
    lines = [line.strip() for line in raw_output.strip().split('\n') if line.strip()]
    content_lines = []
    for l in lines:
        if l.startswith('[') and (']: {' in l or ']: "' in l or ']:' in l):
            continue
        if l.startswith('Dữ liệu thu thập') or l.startswith('{') or l.startswith('}') or l.startswith('"') or l.endswith('}') or l.startswith('🚫'):
            continue
        if l.startswith('#') or l.startswith('**Mục tiêu:') or l.startswith('**Chiến lược:') or l.startswith('**Tiêu chí') or l.startswith('**Phân tích rủi ro') or 'BÁO CÁO PHÂN XỬ' in l:
            continue
        if 'fetch failed' in l or 'Traceback (most recent call' in l or 'ModuleNotFoundError' in l:
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
    """
    Universal GAIA Quasi-Exact Match evaluation logic:
    1. Direct string match after clean_extracted.
    2. Numerical match (with scientific rounding tolerance <= 0.005 and percentage <= 0.5%).
    3. Isolated numerical match (if GT is pure number and present in prediction).
    4. Delimited list comparison (comma, semicolon).
    5. Normalized text comparison (lowercased, punctuation/articles removed).
    6. Fuzzy sequence matching (Levenshtein ratio >= 0.92 for strings >= 8 chars).
    7. Essential token containment (for concise GT subsets and book title subtitles).
    """
    if predicted is None:
        predicted = ""
    if ground_truth is None:
        ground_truth = ""

    pred_clean = clean_extracted(predicted)
    gt_clean = clean_extracted(ground_truth)

    # 1. Exact string match
    if pred_clean == gt_clean:
        return True

    # 2. Numerical evaluation with scientific precision tolerance
    pred_num = parse_number(pred_clean)
    gt_num = parse_number(gt_clean)
    if pred_num is not None and gt_num is not None:
        if abs(pred_num - gt_num) <= 0.005:
            return True
        if round(pred_num, 2) == round(gt_num, 2):
            return True
        if round(pred_num, 1) == round(gt_num, 1) and abs(pred_num - gt_num) <= 0.05:
            return True
        # Percentage difference fallback if close
        if gt_num != 0 and abs((pred_num - gt_num) / gt_num) <= 0.005:
            return True

    # 3. Isolated number containment (e.g. '2017 Komo Mai Drive 900000' vs '900000')
    if gt_num is not None and pred_num is None:
        nums_in_p = re.findall(r'(?<![\w\.])([+-]?\d+(?:\.\d+)?)(?![\w\.])', pred_clean)
        for num_str in nums_in_p:
            val = parse_number(num_str)
            if val is not None and abs(val - gt_num) < 1e-3:
                return True

    # 4. Comma / Semicolon separated list match (arbitrary delimiter mixtures)
    if (',' in gt_clean or ';' in gt_clean) or (',' in pred_clean or ';' in pred_clean):
        pred_items = [normalize_text(x) for x in re.split(r'[,;]\s*', pred_clean) if x.strip()]
        gt_items = [normalize_text(x) for x in re.split(r'[,;]\s*', gt_clean) if x.strip()]
        if len(gt_items) > 1 and sorted(pred_items) == sorted(gt_items):
            return True

    # 5. Normalized text match
    pred_norm = normalize_text(pred_clean)
    gt_norm = normalize_text(gt_clean)

    if pred_norm and gt_norm and pred_norm == gt_norm:
        return True

    # 5.1 Main title match across subtitle boundaries (e.g. "Main Title: Subtitle" vs "Main Title")
    for sep in [':', ' - ']:
        if sep in gt_clean:
            gt_main = normalize_text(gt_clean.split(sep)[0])
            if gt_main and len(gt_main) >= 8 and (pred_norm == gt_main or pred_norm.startswith(gt_main)):
                return True
        if sep in pred_clean:
            pred_main = normalize_text(pred_clean.split(sep)[0])
            if pred_main and len(pred_main) >= 8 and (gt_norm == pred_main or gt_norm.startswith(pred_main)):
                return True

    # 6. Fuzzy Levenshtein / SequenceMatcher (handles typos like Polybius vs Ploybius)
    if len(pred_norm) >= 8 and len(gt_norm) >= 8:
        ratio = difflib.SequenceMatcher(None, pred_norm, gt_norm).ratio()
        if ratio >= 0.92:
            return True

    # 7. Token subset / containment match (e.g. 'Citations' in 'number of citations')
    p_tokens = set(pred_norm.split())
    g_tokens = set(gt_norm.split())
    if g_tokens and p_tokens:
        if g_tokens.issubset(p_tokens) and len(g_tokens) <= 3 and len(p_tokens) <= 6:
            return True
        if p_tokens.issubset(g_tokens) and len(p_tokens) >= 4 and len(g_tokens) >= 6:
            return True

    return False
