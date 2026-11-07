import urllib.request
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for url in [
    'https://www.base-search.net/Browse/DDC',
    'https://www.base-search.net/Search/Results?q=ddc:633',
    'https://www.base-search.net/Search/Results?type=all&lookfor=ddc%3A633&ling=0'
]:
    try:
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8', errors='ignore')
        print(f"URL: {url} -> Length: {len(html)}")
        if 'Guatemala' in html:
            print("  FOUND Guatemala in HTML!")
        # check flags or institutions
        inst = re.findall(r'class="institution"[^>]*>([^<]+)', html)
        if inst:
            print(f"  Institutions: {inst[:3]}")
    except Exception as e:
        print(f"URL: {url} -> Error: {e}")

