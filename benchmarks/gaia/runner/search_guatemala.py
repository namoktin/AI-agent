import urllib.request
import json

queries = [
    'site:base-search.net "633" Guatemala',
    'Bielefeld BASE Guatemala 633',
    'DDC 633 Guatemala Bielefeld',
    '"base-search.net" Guatemala unknown language'
]

for q in queries:
    req = urllib.request.Request('http://127.0.0.1:3000/api/search', data=json.dumps({'query': q}).encode(), headers={'Content-Type': 'application/json'})
    try:
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read().decode())
        print(f"=== {q} ===")
        print(data.get('result', '')[:400])
    except Exception as e:
        print(f"Error for {q}: {e}")

