import urllib.request
import json

queries = [
    'Bielefeld BASE DDC 633',
    'Bielefeld BASE unknown language unique flag',
    'DDC 633 Field and plantation crops unknown language'
]

for q in queries:
    req = urllib.request.Request('http://127.0.0.1:3000/api/search', data=json.dumps({'query': q}).encode(), headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode())
    print(f"=== Query: {q} ===")
    print(data.get('result', '')[:400])

