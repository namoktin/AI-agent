import re
import string

def normalize_text(text: str) -> str:
    """Standard text normalization: lower, remove punctuation and extra whitespaces."""
    if text is None:
        return ""
    text = str(text).strip().lower()
    # Remove articles
    text = re.sub(r'\b(a|an|the)\b', ' ', text)
    # Remove punctuation
    text = text.translate(str.maketrans('', '', string.punctuation))
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def parse_number(text: str):
    """Attempt to parse text as a float or int."""
    text = str(text).strip().replace(',', '').replace('$', '').replace('%', '')
    try:
        val = float(text)
        return val
    except ValueError:
        return None

def extract_final_answer(raw_output: str) -> str:
    """Extract answer from FINAL ANSWER: ... pattern or fallback to last line."""
    if not raw_output:
        return ""
    
    # Check for FINAL ANSWER: pattern
    match = re.search(r'FINAL ANSWER:\s*(.*)', raw_output, re.IGNORECASE)
    if match:
        answer = match.group(1).strip()
        # In case there are trailing lines
        first_line = answer.split('\n')[0].strip()
        return first_line

    # Fallback to lines searching backwards
    lines = [line.strip() for line in raw_output.strip().split('\n') if line.strip()]
    if lines:
        for line in reversed(lines):
            m = re.search(r'FINAL ANSWER:\s*(.*)', line, re.IGNORECASE)
            if m:
                return m.group(1).strip()
        return lines[-1]
    
    return raw_output.strip()

def compare_answers(predicted: str, ground_truth: str) -> bool:
    """
    Official GAIA Quasi-Exact Match evaluation logic:
    1. Direct string match after basic strip.
    2. Numerical match (if both can be converted to numbers, float tolerance 1e-3).
    3. Comma-separated list comparison.
    4. Normalized text comparison (lowercased, punctuation/articles removed).
    """
    if predicted is None:
        predicted = ""
    if ground_truth is None:
        ground_truth = ""

    pred_clean = predicted.strip()
    gt_clean = ground_truth.strip()

    # Exact string match
    if pred_clean == gt_clean:
        return True

    # Numerical evaluation
    pred_num = parse_number(pred_clean)
    gt_num = parse_number(gt_clean)
    if pred_num is not None and gt_num is not None:
        if abs(pred_num - gt_num) < 1e-3:
            return True
        # Percentage difference fallback if close
        if gt_num != 0 and abs((pred_num - gt_num) / gt_num) < 1e-3:
            return True

    # Comma-separated list match
    if ',' in gt_clean or ',' in pred_clean:
        pred_items = [normalize_text(x) for x in pred_clean.split(',') if x.strip()]
        gt_items = [normalize_text(x) for x in gt_clean.split(',') if x.strip()]
        if sorted(pred_items) == sorted(gt_items):
            return True

    # Normalized text match
    pred_norm = normalize_text(pred_clean)
    gt_norm = normalize_text(gt_clean)

    if pred_norm and gt_norm and pred_norm == gt_norm:
        return True

    return False
