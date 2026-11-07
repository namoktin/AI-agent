import json
import urllib.request

orcids = [
    'https://orcid.org/0000-0003-0396-0333',
    'https://orcid.org/0000-0002-2605-6569',
    'https://orcid.org/0000-0001-6102-7846',
    'https://orcid.org/0000-0002-0209-2784',
    'https://orcid.org/0000-0002-1053-2030'
]

counts = []
for orcid in orcids:
    orcid_id = orcid.split('/')[-1]
    url = f"https://pub.orcid.org/v3.0/{orcid_id}/works"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        groups = data.get('group', [])
        pre_2020_count = 0
        for g in groups:
            summaries = g.get('work-summary', [])
            has_pre_2020 = False
            for s in summaries:
                pub_date = s.get('publication-date')
                if pub_date and pub_date.get('year'):
                    year_val = pub_date.get('year').get('value')
                    if year_val and int(year_val) < 2020:
                        has_pre_2020 = True
            if has_pre_2020:
                pre_2020_count += 1
        counts.append(pre_2020_count)

avg = sum(counts) / len(counts)
print("Average:", avg)
