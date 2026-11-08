# BÁO CÁO BENCHMARK GAIA - CYBER AGENT PRO

- **Ngày đánh giá:** 1793883415.267223
- **Hệ thống kiểm thử:** Cyber Agent Pro (Multi-Agent v2.0-ultimate)
- **Bộ dữ liệu:** GAIA Validation Split (`gaia-benchmark/GAIA`, `2023_all`)

## 1. Kết quả tổng hợp

| Cấp độ | Tổng số task | PASS | FAIL | TIMEOUT | INFRA ERROR | Độ chính xác (Accuracy) | Hoàn thành < 5 phút | Thời gian TB (giây) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Level 1 | 53 | 45 | 7 | 0 | 1 | **86.54%** | 90.6% | 113.2s |
| Level 2 | 50 | 23 | 17 | 5 | 5 | **51.11%** | 54.0% | 298.8s |
| Level 3 | 0 | 0 | 0 | 0 | 0 | **0.00%** | 0.0% | 0.0s |
| **Tổng cộng (Overall)** | **103** | **68** | **24** | **5** | **6** | **70.10%** | **72.8%** | **203.3s** |

## 2. Chi tiết từng task

| Task ID | Level | Verdict | Extracted Answer | Ground Truth | Duration |
| :--- | :---: | :---: | :--- | :--- | :---: |
| `0383a3ee-47a` | L1 | PASS | `Rockhopper penguin` | `Rockhopper penguin` | 90.4s |
| `11af4e1a-5f4` | L1 | PASS | `6` | `6` | 23.8s |
| `1f975693-876` | L1 | PASS | `132, 133, 134, 197, 245` | `132, 133, 134, 197, 245` | 258.3s |
| `23dd907f-126` | L1 | PASS | `2` | `2` | 30.1s |
| `27d5d136-856` | L1 | PASS | `(¬A → B) ↔ (A ∨ ¬B` | `(¬A → B) ↔ (A ∨ ¬B)` | 36.9s |
| `2d83110e-a09` | L1 | PASS | `right` | `Right` | 32.3s |
| `305ac316-eef` | L1 | PASS | `Wojciech` | `Wojciech` | 35.5s |
| `389793a7-ca1` | L1 | PASS | `3` | `3` | 23.2s |
| `3cef3a44-215` | L1 | PASS | `broccoli, celery, fresh basil,` | `broccoli, celery, fresh basil,` | 59.2s |
| `3f57289b-8c6` | L1 | PASS | `519` | `519` | 309.7s |
| `42576abe-0de` | L1 | PASS | `Maktay Mato Apple` | `Maktay mato apple` | 23.9s |
| `46719c30-f4c` | L1 | FAIL | `Anthropomorphic Vs Non-Anthrop` | `Mapping Human Oriented Informa` | 78.5s |
| `4b650a35-852` | L1 | PASS | `Guava` | `Guava` | 62.6s |
| `4b6bb5f7-f63` | L1 | PASS | `castle` | `THE CASTLE` | 112.8s |
| `4fc2f1ae-862` | L1 | PASS | `FunkMonk` | `FunkMonk` | 52.1s |
| `50ad0280-081` | L1 | PASS | `the seagull glided peacefully ` | `The seagull glided peacefully ` | 84.4s |
| `50ec8903-b81` | L1 | PASS | `green, white` | `green, white` | 41.5s |
| `5188369a-3bb` | L1 | PASS | `Annie Levin` | `Annie Levin` | 314.6s |
| `5a0c1adf-205` | L1 | PASS | `Claus` | `Claus` | 130.2s |
| `5cfb274c-020` | L1 | PASS | `No` | `No` | 119.7s |
| `5d0080cb-90d` | L1 | PASS | `0.1777` | `0.1777` | 141.7s |
| `65afbc8a-89c` | L1 | PASS | `F478A7` | `F478A7` | 125.5s |
| `6f37996b-2ac` | L1 | PASS | `b, e` | `b, e` | 178.6s |
| `72e110e7-464` | L1 | PASS | `Guatemala` | `Guatemala` | 64.1s |
| `7673d772-ef8` | L1 | FAIL | `except` | `inference` | 131.1s |
| `7bd855d8-463` | L1 | PASS | `89706.00` | `89706.00` | 61.0s |
| `7d4a7d1d-cac` | L1 | FAIL | `26` | `22` | 117.5s |
| `840bfca7-4f7` | L1 | PASS | `80GSFC21M0002` | `80GSFC21M0002` | 65.6s |
| `8e867cd7-cff` | L1 | PASS | `3` | `3` | 50.7s |
| `9318445f-fe6` | L1 | PASS | `3/4,1/4,3/4,3/4,3/4,1/2,2/4,1/` | `3/4,1/4,3/4,3/4,2/4,1/2,5/35,7` | 61.1s |
| `935e2cff-ae7` | L1 | PASS | `Research` | `research` | 57.1s |
| `99c9cc74-fdc` | L1 | PASS | `cornstarch, freshly squeezed l` | `cornstarch, freshly squeezed l` | 63.9s |
| `9d191bce-651` | L1 | PASS | `Extremely` | `Extremely` | 33.5s |
| `a0068077-79f` | L1 | PASS | `90` | `90` | 161.7s |
| `a0c07678-e49` | L1 | PASS | `Yoshida, Uehara` | `Yoshida, Uehara` | 233.5s |
| `a1e91b78-d3d` | L1 | PASS | `3` | `3` | 358.4s |
| `a3fbeb63-0e8` | L1 | PASS | `4` | `4` | 162.8s |
| `b415aba4-4b6` | L1 | FAIL | `metallic nanotip arrays` | `diamond` | 135.3s |
| `b816bfce-3d8` | L1 | PASS | `fluffy` | `fluffy` | 70.7s |
| `bda648d7-d61` | L1 | PASS | `Saint Petersburg` | `Saint Petersburg` | 26.6s |
| `c365c1c7-a3d` | L1 | PASS | `Braintree, Honolulu` | `Braintree, Honolulu` | 189.9s |
| `c714ab3a-da3` | L1 | PASS | `100` | `100` | 41.8s |
| `cabe07ed-9ec` | L1 | FAIL | `Smith` | `Louvrier` | 186.6s |
| `cca530fc-405` | L1 | FAIL | `Nxf2+` | `Rd5` | 192.5s |
| `cf106601-ab4` | L1 | PASS | `CUB` | `CUB` | 62.5s |
| `cffe0e32-c9a` | L1 | PASS | `Fred` | `Fred` | 51.6s |
| `d0633230-706` | L1 | PASS | `BaseLabelPropagation` | `BaseLabelPropagation` | 44.3s |
| `dc22a632-937` | L1 | INFRA_ERROR | `` | `Five Hundred Things To Eat Bef` | 326.7s |
| `dc28cf18-643` | L1 | PASS | `2` | `2` | 38.5s |
| `e142056d-56a` | L1 | PASS | `16000` | `16000` | 143.0s |
| `e1fc63a2-da7` | L1 | PASS | `17` | `17` | 98.0s |
| `ec09fa32-d03` | L1 | FAIL | `0` | `3` | 382.0s |
| `f918266a-b3e` | L1 | PASS | `0` | `0` | 23.3s |
| `023e9d44-96a` | L2 | INFRA_ERROR | `` | `8` | 254.7s |
| `04a04a9b-226` | L2 | INFRA_ERROR | `` | `41` | 256.3s |
| `05407167-39e` | L2 | PASS | `Format Document` | `Format Document` | 113.4s |
| `076c8171-9b3` | L2 | PASS | `Finance` | `Finance` | 112.8s |
| `08c0b6e9-1b4` | L2 | PASS | `orange, white` | `orange, white` | 29.3s |
| `08cae58d-408` | L2 | PASS | `2018` | `2018` | 30.3s |
| `08f3a05f-594` | L2 | FAIL | `3` | `2` | 92.1s |
| `0a3cd321-3e7` | L2 | INFRA_ERROR | `` | `Brunei, China, Morocco, Singap` | 350.3s |
| `0a65cb96-cb6` | L2 | PASS | `Holabird` | `Holabird` | 75.3s |
| `0b260a57-3f3` | L2 | INFRA_ERROR | `` | `0.269` | 600.0s |
| `0bb3b44a-ede` | L2 | FAIL | `50` | `536` | 122.0s |
| `0e9e85b8-52b` | L2 | FAIL | `0` | `1927` | 460.6s |
| `0ff53813-336` | L2 | PASS | `beta geometric` | `beta geometric` | 207.8s |
| `114d5fd0-e2a` | L2 | FAIL | `0` | `4` | 379.2s |
| `14569e28-c88` | L2 | PASS | `backtick` | `backtick` | 212.5s |
| `16d825ff-162` | L2 | FAIL | `0` | `6:41 PM` | 480.4s |
| `17b5a6a3-bc8` | L2 | PASS | `34689` | `34689` | 79.8s |
| `1dcc160f-c18` | L2 | FAIL | `0` | `3` | 448.5s |
| `20194330-997` | L2 | FAIL | `0` | `4` | 599.7s |
| `2a649bb1-795` | L2 | INFRA_ERROR | `` | `3.1.3.1; 1.11.1.7` | 600.0s |
| `2b3ef98c-cc0` | L2 | FAIL | `0` | `To be or not to be that is the` | 538.1s |
| `2dfc4c37-fec` | L2 | FAIL | `3` | `6` | 144.2s |
| `32102e3e-d12` | L2 | PASS | `Time-Parking 2: Parallel Unive` | `Time-Parking 2: Parallel Unive` | 69.6s |
| `33d8ea3b-6c6` | L2 | FAIL | `` | `2` | 94.3s |
| `3627a8be-a77` | L2 | PASS | `142` | `142` | 144.3s |
| `366e2f2b-863` | L2 | PASS | `Shelley's Place` | `Shelley's place` | 22.9s |
| `3ff6b7a9-a5b` | L2 | PASS | `56000` | `56000` | 40.5s |
| `4d51c4bf-4b0` | L2 | PASS | `8` | `8` | 111.4s |
| `4d0aa727-86b` | L2 | PASS | `1 in 3` | `1 in 3` | 169.4s |
| `42d4198c-589` | L2 | FAIL | `` | `60` | 171.4s |
| `544b7f0c-173` | L2 | PASS | `A Nightmare on Elm Street` | `A Nightmare on Elm Street` | 440.5s |
| `54612da3-fd5` | L2 | FAIL | `120` | `60` | 252.4s |
| `56137764-b4e` | L2 | PASS | `Li Peng` | `Li Peng` | 494.7s |
| `48eb8242-109` | L2 | TIMEOUT | `` | `6` | 600.4s |
| `6359a0b1-8f7` | L2 | FAIL | `C:\Users\Nam\Desktop\AI agent\` | `39` | 315.8s |
| `624cbf11-6a4` | L2 | TIMEOUT | `` | `So we had to let it die.` | 600.0s |
| `65da0822-a48` | L2 | FAIL | `Santa Clara, Cambridge` | `Santa Clara, Boston` | 155.8s |
| `65638e28-7f3` | L2 | FAIL | `dl4.py` | `Kleinpaul` | 395.4s |
| `67e8878b-5ce` | L2 | PASS | `Hotels` | `Hotels` | 142.7s |
| `71345b0a-9c7` | L2 | PASS | `Here be dragons` | `Here be dragons` | 270.1s |
| `708b99c5-e4a` | L2 | FAIL | `Let me fetch the graph data di` | `Citations` | 348.3s |
| `6b078778-0b9` | L2 | PASS | `Alfonso Visconti` | `Alfonso Visconti` | 503.7s |
| `73c1b9fe-ee1` | L2 | PASS | `1954` | `1954` | 452.5s |
| `7619a514-5fa` | L2 | FAIL | `python gh_query5.py` | `04/15/18` | 465.3s |
| `7b5377b0-3f3` | L2 | PASS | `563.9` | `563.9` | 173.2s |
| `7cc4acfa-63f` | L2 | PASS | `Wharvton` | `Wharvton` | 98.8s |
| `7a4a336d-dcf` | L2 | TIMEOUT | `` | `1:41.614` | 600.0s |
| `87c610df-bef` | L2 | PASS | `Morarji Desai` | `Morarji Desai` | 419.7s |
| `7dd30055-019` | L2 | TIMEOUT | `` | `1.456` | 600.0s |
| `853c8244-429` | L2 | TIMEOUT | `` | `11` | 600.0s |
