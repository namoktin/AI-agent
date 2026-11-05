# BÁO CÁO BENCHMARK GAIA - CYBER AGENT PRO

- **Ngày đánh giá:** 1793883239.1834478
- **Hệ thống kiểm thử:** Cyber Agent Pro (Multi-Agent v2.0-ultimate)
- **Bộ dữ liệu:** GAIA Validation Split (`gaia-benchmark/GAIA`, `2023_all`)

## 1. Kết quả tổng hợp

| Cấp độ | Tổng số task | PASS | FAIL | TIMEOUT | INFRA ERROR | Độ chính xác (Accuracy) | Hoàn thành < 5 phút | Thời gian TB (giây) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Level 1 | 45 | 17 | 19 | 0 | 9 | **47.22%** | 97.8% | 125.7s |
| Level 2 | 0 | 0 | 0 | 0 | 0 | **0.00%** | 0.0% | 0.0s |
| Level 3 | 0 | 0 | 0 | 0 | 0 | **0.00%** | 0.0% | 0.0s |
| **Tổng cộng (Overall)** | **45** | **17** | **19** | **0** | **9** | **47.22%** | **97.8%** | **125.7s** |

## 2. Chi tiết từng task

| Task ID | Level | Verdict | Extracted Answer | Ground Truth | Duration |
| :--- | :---: | :---: | :--- | :--- | :---: |
| `0383a3ee-47a` | L1 | FAIL | `Adélie penguin```` | `Rockhopper penguin` | 300.0s |
| `11af4e1a-5f4` | L1 | PASS | `6` | `6` | 98.5s |
| `1f975693-876` | L1 | PASS | `132, 133, 134, 197, 245` | `132, 133, 134, 197, 245` | 185.0s |
| `23dd907f-126` | L1 | PASS | `2` | `2` | 183.8s |
| `27d5d136-856` | L1 | PASS | `(¬A → B) ↔ (A ∨ ¬B)` | `(¬A → B) ↔ (A ∨ ¬B)` | 33.7s |
| `2d83110e-a09` | L1 | PASS | `right` | `Right` | 39.0s |
| `305ac316-eef` | L1 | PASS | `Wojciech` | `Wojciech` | 89.4s |
| `389793a7-ca1` | L1 | PASS | `3` | `3` | 73.9s |
| `3cef3a44-215` | L1 | PASS | `broccoli, celery, fresh basil,` | `broccoli, celery, fresh basil,` | 55.3s |
| `3f57289b-8c6` | L1 | FAIL | `535` | `519` | 240.6s |
| `42576abe-0de` | L1 | PASS | `Maktay Mato Apple```` | `Maktay mato apple` | 219.1s |
| `46719c30-f4c` | L1 | FAIL | `A study of the usability of pi` | `Mapping Human Oriented Informa` | 169.2s |
| `4b650a35-852` | L1 | PASS | `Guava` | `Guava` | 91.0s |
| `4b6bb5f7-f63` | L1 | FAIL | `{get_scene_heading()}\")",` | `THE CASTLE` | 144.2s |
| `4fc2f1ae-862` | L1 | PASS | `FunkMonk` | `FunkMonk` | 345.2s |
| `50ad0280-081` | L1 | FAIL | `THE SEA GULL GLIDED PEACEFULLY` | `The seagull glided peacefully ` | 91.3s |
| `50ec8903-b81` | L1 | PASS | `Green, White` | `green, white` | 241.5s |
| `5188369a-3bb` | L1 | PASS | `Annie Levin` | `Annie Levin` | 219.6s |
| `5a0c1adf-205` | L1 | FAIL | `Dima` | `Claus` | 104.7s |
| `5cfb274c-020` | L1 | PASS | `No` | `No` | 150.5s |
| `5d0080cb-90d` | L1 | FAIL | `0.0045` | `0.1777` | 72.0s |
| `65afbc8a-89c` | L1 | FAIL | `00ff00` | `F478A7` | 177.6s |
| `6f37996b-2ac` | L1 | PASS | `b,e` | `b, e` | 113.7s |
| `72e110e7-464` | L1 | FAIL | `Vatican City` | `Guatemala` | 116.4s |
| `7673d772-ef8` | L1 | FAIL | `except` | `inference` | 159.7s |
| `7bd855d8-463` | L1 | FAIL | `1425.50` | `89706.00` | 246.0s |
| `7d4a7d1d-cac` | L1 | FAIL | `26` | `22` | 229.6s |
| `840bfca7-4f7` | L1 | FAIL | `NNX17AG27G` | `80GSFC21M0002` | 99.1s |
| `8e867cd7-cff` | L1 | FAIL | `6` | `3` | 138.8s |
| `9318445f-fe6` | L1 | FAIL | `Tôi đã phân tích tình trạng xu` | `3/4,1/4,3/4,3/4,2/4,1/2,5/35,7` | 156.9s |
| `935e2cff-ae7` | L1 | PASS | `Research` | `research` | 180.0s |
| `99c9cc74-fdc` | L1 | FAIL | `cornstarch, lemon juice, salt,` | `cornstarch, freshly squeezed l` | 92.4s |
| `9d191bce-651` | L1 | FAIL | `` | `Extremely` | 37.1s |
| `a0068077-79f` | L1 | PASS | `90` | `90` | 76.9s |
| `a0c07678-e49` | L1 | FAIL | `Akiyoshi, Uwasawa` | `Yoshida, Uehara` | 48.2s |
| `a1e91b78-d3d` | L1 | FAIL | `` | `3` | 28.8s |
| `a3fbeb63-0e8` | L1 | INFRA_ERROR | `` | `4` | 75.4s |
| `b415aba4-4b6` | L1 | INFRA_ERROR | `` | `diamond` | 65.6s |
| `b816bfce-3d8` | L1 | INFRA_ERROR | `` | `fluffy` | 61.1s |
| `bda648d7-d61` | L1 | INFRA_ERROR | `` | `Saint Petersburg` | 67.1s |
| `c365c1c7-a3d` | L1 | INFRA_ERROR | `` | `Braintree, Honolulu` | 65.9s |
| `c714ab3a-da3` | L1 | INFRA_ERROR | `` | `100` | 65.9s |
| `cabe07ed-9ec` | L1 | INFRA_ERROR | `` | `Louvrier` | 68.1s |
| `cca530fc-405` | L1 | INFRA_ERROR | `` | `Rd5` | 72.0s |
| `cf106601-ab4` | L1 | INFRA_ERROR | `` | `CUB` | 67.3s |
