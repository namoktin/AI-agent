import json
from collections import defaultdict

with open('C:/Users/Nam/Desktop/AI agent/benchmarks/gaia/reports/GAIA_FINAL_REPORT.md', 'r', encoding='utf-8') as f:
    lines = f.readlines()

fails = []
for line in lines:
    if '| FAIL |' in line:
        parts = [p.strip() for p in line.split('|')[1:-1]]
        task_id = parts[0].replace('`', '')
        lvl = parts[1]
        pred = parts[3].replace('`', '')
        gt = parts[4].replace('`', '')
        duration = parts[5]
        fails.append({'id': task_id, 'lvl': lvl, 'pred': pred, 'gt': gt, 'dur': duration})

print('Total fails:', len(fails))

categories = defaultdict(list)
for item in fails:
    p, g = item['pred'], item['gt']
    if 'BÁO CÁO PHÂN XỬ' in p or p == '' or 'fetch failed' in p:
        categories['Director Arbitration Leak / Empty Output'].append(item)
    elif p.startswith('[') or '{"success":' in p or p.startswith('🚫') or '---' in p:
        categories['Raw Tool / Envelope / Error String Leak'].append(item)
    elif p.startswith('#') or 'def ' in p or 'print(' in p or '{percentage}' in p:
        categories['Code / Script Leak in Final Answer'].append(item)
    elif any(c.isdigit() for c in g) and any(c.isdigit() for c in p):
        categories['Numerical / Calculation Discrepancy'].append(item)
    elif (',' in g or ';' in g) and (',' in p or ';' in p or len(p.split()) > 1):
        categories['Partial List / Delimited Extraction Mismatch'].append(item)
    else:
        categories['Factual / Reasoning Divergence'].append(item)

for cat, items in sorted(categories.items(), key=lambda x: -len(x[1])):
    print(f'\n=== {cat} ({len(items)} tasks) ===')
    for it in items:
        p_sub = it['pred'][:45].replace('\n', ' ')
        g_sub = it['gt'][:45].replace('\n', ' ')
        print(f"  [{it['lvl']}] {it['id']}: Pred='{p_sub}' | GT='{g_sub}'")
