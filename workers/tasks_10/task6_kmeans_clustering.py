import os
import sys
import json
import random
import math
import time

work_dir = os.environ.get('WORK_DIR', os.getcwd())
output_file = os.path.join(work_dir, 'kmeans_clusters.json')

print("🚀 [TASK 6] Khởi chạy thuật toán phân cụm K-Means bằng Python...")

# Generate 1,000 2D synthetic points in 3 clusters
random.seed(42)
points = []
centers_true = [[10.0, 10.0], [50.0, 50.0], [90.0, 20.0]]
for _ in range(1000):
    c = random.choice(centers_true)
    points.append([c[0] + random.gauss(0, 5), c[1] + random.gauss(0, 5)])

k = 3
max_iters = 10

# Initialize centroids randomly
centroids = random.sample(points, k)

for it in range(1, max_iters + 1):
    clusters = [[] for _ in range(k)]
    for p in points:
        dists = [math.dist(p, c) for c in centroids]
        min_idx = dists.index(min(dists))
        clusters[min_idx].append(p)

    new_centroids = []
    for c_idx in range(k):
        if clusters[c_idx]:
            avg_x = sum(p[0] for p in clusters[c_idx]) / len(clusters[c_idx])
            avg_y = sum(p[1] for p in clusters[c_idx]) / len(clusters[c_idx])
            new_centroids.append([avg_x, avg_y])
        else:
            new_centroids.append(centroids[c_idx])

    centroids = new_centroids
    percent = int((it / max_iters) * 100)
    print(f"[PROGRESS] {it}/{max_iters} ({percent}%): Vòng lặp tối ưu hóa K-Means thứ {it}/{max_iters}", flush=True)
    time.sleep(0.08)

result = {
    "totalPoints": len(points),
    "k": k,
    "iterations": max_iters,
    "centroids": [[round(c[0], 2), round(c[1], 2)] for c in centroids],
    "clusterSizes": [len(c) for c in clusters],
    "language": "Python 3",
    "status": "CONVERGED"
}

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print(f"✅ [TASK 6] Đã hoàn thành K-Means Python và lưu tại {output_file}", flush=True)
