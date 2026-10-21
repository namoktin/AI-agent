# 🚀 CYBER AGENT PRO // MULTI-AGENT AUTONOMOUS SYSTEM

> **Hệ thống AI Đa Tác Nhân (Hierarchical Multi-Agent Framework) tự học, phân tích chuyên sâu, phản biện đa chiều và tích lũy trí nhớ dài hạn.**

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.x-blue.svg)](https://expressjs.com/)
[![Puppeteer](https://img.shields.io/badge/Puppeteer-Stealth-orange.svg)](https://pptr.dev/)
[![Gemini](https://img.shields.io/badge/AI-Google%20Gemini-8E75C2.svg)](https://ai.google.dev/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

---

## 📖 1. Giới thiệu tổng quan

**Cyber Agent Pro** là một nền tảng AI Agent tự hành được thiết kế theo mô hình tổ chức doanh nghiệp hiện đại. Thay vì để một mô hình ngôn ngữ lớn (LLM) đơn lẻ xử lý mọi yêu cầu, hệ thống phân rã tác vụ phức tạp thành một quy trình làm việc chuyên nghiệp giữa các cấp quản lý và các nhân viên chuyên trách, đảm bảo tính chính xác, tính phản biện học thuật và độ tin cậy cao nhất.

### 🌟 Điểm nổi bật:
- 🏛️ **Cấu trúc phân cấp lãnh đạo:** Mô phỏng tổ chức thực tế với Giám đốc (CEO/Director), Phó giám đốc (COO/Coordinator) và các Agent chuyên trách.
- ⚖️ **Cơ chế phản biện & Đồng thuận (Consensus & Debate Protocol):** Các Agent nhân viên độc lập đánh giá, thảo luận và phản biện đa chiều; Phó giám đốc điều phối và đưa ra quyết định xử lý khi có bất đồng.
- 🧠 **Trí nhớ dài hạn & Tự tiến hóa (Self-Learning Long-Term Memory):** Tự động đúc kết kinh nghiệm sau mỗi lần thực thi (`experiences.json` & `EXPERIENCES.md`), tránh lặp lại sai lầm trong quá khứ.
- 🌐 **Thu thập dữ liệu web tự động (Stealth Automation):** Trình duyệt không đầu (Headless Browser) qua Puppeteer Stealth giúp tra cứu tài liệu thực tế theo thời gian thực mà không bị chặn bot.
- 🛡️ **Bảo mật nâng cao:** Xác thực Bearer Token, whitelist lệnh, SSRF protection, sandbox cô lập, tách biệt file tĩnh.

---

## 🏛️ 2. Kiến trúc Đa Tác Nhân (Multi-Agent Architecture)

```mermaid
flowchart TD
    User([👤 Người dùng / Giao diện Dashboard]) -->|Yêu cầu / Bài toán| CEO[👔 Giám đốc điều hành - CEO / Director]
    CEO -->|Chiến lược & Định hướng cấp cao| COO[📋 Phó giám đốc - COO / Coordinator]
    
    subgraph Specialists [👥 Đội ngũ Nhân viên Chuyên trách]
        A1[🔍 Nghiên cứu & Dữ liệu - Researcher]
        A2[💻 Kỹ thuật & Phát triển - Developer]
        A3[🛡️ Thẩm định & An toàn - Security Auditor]
        A4[📊 Thẩm định Khoa học - Academic Critic]
    end

    COO -->|Phân rã & Giao việc| Specialists
    Specialists -->|Báo cáo & Phản biện độc lập| Consensus{⚖️ Cơ chế Đồng thuận / Tranh biện}
    
    Consensus -->|Đồng thuận 100%| FinalReport[📄 Báo cáo Canonical Hoàn thiện]
    Consensus -->|Có ý kiến bất đồng| Decision[⚡ Phó giám đốc chủ động chọn phương án / Tham vấn Giám đốc]
    Decision --> FinalReport
    
    FinalReport -->|Lưu bài học & Đúc kết| Memory[(🧠 Long-term Memory)]
    FinalReport -->|Phản hồi hoàn chỉnh| User
```

### Chi tiết các vai trò:
1. **Giám đốc điều hành (CEO):** Nhận đề bài từ người dùng, thẩm định yêu cầu, xác định chiến lược tổng quát và giám sát chất lượng sản phẩm đầu ra.
2. **Phó giám đốc (COO):** Cánh tay phải điều hành tác nghiệp, phân rã mục tiêu lớn thành các tác vụ con, phân bổ việc cho đúng nhân viên chuyên trách, điều phối tranh luận và đưa ra quyết định khi các nhân viên có góc nhìn trái ngược.
3. **Các Agent chuyên môn:** Scientific Researcher, Code Specialist, Quality & Security Critic.
4. **Hệ thống Trí nhớ (Long-Term Memory):** Ghi nhớ các giải pháp đã thành công và các bài học thất bại để hệ thống ngày càng thông minh hơn qua từng phiên làm việc.

---

## 📁 3. Cấu trúc thư mục dự án

```text
AI agent/
├── public/                          # 🌐 Thư mục file tĩnh (giao diện web)
│   └── index.html                   # Dashboard điều khiển hiện đại
│
├── server.js                        # Máy chủ điều phối trung tâm (Express 5.x)
├── start.bat                        # File khởi động nhanh một chạm trên Windows
├── package.json                     # Thông tin gói và thư viện phụ thuộc
├── .gitignore                       # Danh sách loại trừ tệp nhạy cảm & cache
├── .env.example                     # File mẫu cấu hình biến môi trường
│
├── memory/                          # 🧠 Bộ não trí nhớ dài hạn của AI
│   ├── experiences.json             # Cơ sở dữ liệu tri thức tích lũy (JSON)
│   ├── EXPERIENCES.md               # Nhật ký bài học kinh nghiệm chi tiết
│   ├── claim_ledger.json            # Sổ cái kiểm chứng các tuyên bố khoa học
│   └── research/                    # Tài liệu chuyên sâu do AI tự nghiên cứu
│
├── middleware/                      # Các tầng lọc bảo mật trung gian
│   └── auth.js                      # Xác thực Bearer Token + Localhost Guard
│
├── utils/                           # Các mô-đun tiện ích hỗ trợ
│   ├── mutex.js                     # Khóa đồng bộ truy xuất bộ nhớ chống race-condition
│   ├── pathSafety.js                # Chống Path Traversal Attack
│   └── rateLimiter.js               # Giới hạn tần suất request
│
├── workers/                         # Tiến trình con cô lập
│   └── sandbox.js                   # Sandbox chạy code JS trong tiến trình riêng biệt
│
├── comprehensive_test_suite.js      # Bộ kịch bản kiểm thử tích hợp toàn diện
└── scientific_benchmark_harness.js  # Bộ kiểm thử chuẩn mực học thuật & phản biện
```

---

## ⚡ 4. Hướng dẫn cài đặt & Khởi chạy

### Điều kiện tiên quyết:
- **Node.js**: Phiên bản 18.0 trở lên ([Tải tại đây](https://nodejs.org/)).
- **Trình duyệt Google Chrome** (để hỗ trợ tính năng Web Automation qua Puppeteer).
- Khóa bí mật **Gemini API Key** ([Đăng ký miễn phí tại Google AI Studio](https://aistudio.google.com/)).

### Bước 1: Clone kho mã nguồn
```bash
git clone https://github.com/namoktin/AI-agent.git
cd "AI-agent"
```

### Bước 2: Cài đặt các gói phụ thuộc
```bash
npm install
```

### Bước 3: Cấu hình biến môi trường
Sao chép file mẫu `.env.example` thành `.env` và điền các khóa bí mật:
```bash
cp .env.example .env
```
Sau đó mở file `.env` và cập nhật:
```ini
# Cổng máy chủ (mặc định: 3000)
PORT=3000

# Khóa API Google Gemini (Bắt buộc)
GEMINI_API_KEY=your_actual_gemini_api_key_here

# Khóa bảo mật xác thực API (Khuyến nghị bật khi triển khai)
AGENT_SECRET_KEY=your_secret_key_here

# Thư mục xuất sản phẩm (tùy chọn)
OUTPUT_DIR=C:\Users\YourUser\Desktop\gemini

# Cấu hình AI tùy chỉnh (tùy chọn)
# CUSTOM_AI_BASE_URL=https://api.example.com/v1
# CUSTOM_AI_MODEL=model-name
# CUSTOM_AI_KEY=your_custom_key_here
```

### Bước 4: Khởi động hệ thống
- **Cách 1 (Windows):** Click đúp `start.bat` — tự động bật server và mở trình duyệt tại `http://localhost:3000`.
- **Cách 2 (Terminal/PowerShell):**
  ```bash
  npm start
  ```

---

## 🧪 5. Kiểm thử hệ thống (Automated Testing)

```bash
# Chạy bộ kiểm thử tích hợp hồi quy toàn diện:
npm test

# Chạy bộ đo lường chuẩn mực khoa học & phản biện:
npm run benchmark
```

---

## 🛡️ 6. An toàn & Bảo mật

| Cơ chế | Mô tả |
|---|---|
| **Bearer Token Auth** | Xác thực API bằng `AGENT_SECRET_KEY`. Khi chưa cấu hình, chỉ cho phép kết nối từ `127.0.0.1`. |
| **Server Binding** | Server mặc định bind vào `127.0.0.1` (chỉ localhost), không mở toàn mạng. |
| **API Key Protection** | File `.env` không bao giờ được đưa lên Git. Endpoint `/api/config` chỉ trả trạng thái có/không, KHÔNG trả giá trị key. |
| **Command Whitelist** | Endpoint thực thi lệnh chỉ cho phép các lệnh an toàn (npm, node, git status, dir). Từ chối mọi lệnh khác. |
| **Sandbox Isolation** | Code JS được thực thi trong tiến trình con cô lập (RAM giới hạn 64MB), không có quyền truy cập filesystem hay network. |
| **SSRF Protection** | Gateway Custom AI chặn mọi URL trỏ tới localhost, private IP, link-local và cloud metadata. |
| **Path Traversal Guard** | Mọi thao tác đọc/ghi file đều qua bộ lọc kiểm tra an toàn. |
| **Static File Isolation** | Chỉ phục vụ file tĩnh từ thư mục `public/`, không phục vụ toàn bộ mã nguồn. |
| **Config Injection Guard** | Giá trị cấu hình được sanitize (loại bỏ newline, null byte) trước khi ghi vào `.env`. |

---

## 📄 7. Giấy phép (License)

Dự án được phân phối dưới giấy phép [ISC License](LICENSE).
Mọi đóng góp, báo lỗi (Issues) hoặc yêu cầu tính năng (Pull Requests) đều được hoan nghênh!
