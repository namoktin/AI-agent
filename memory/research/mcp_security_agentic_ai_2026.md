# Nghiên cứu chuyên sâu: Bảo mật Model Context Protocol (MCP) trong Agentic AI (2026)

## 1. Tổng quan về Model Context Protocol (MCP)
Được Anthropic ra mắt vào cuối năm 2024 và bùng nổ rộng khắp trên các hệ thống Claude, ChatGPT, Gemini, Cursor, VS Code, JetBrains vào năm 2026, **Model Context Protocol (MCP)** được ví như chuẩn **"USB-C cho AI"**. Nó cho phép các LLM kết nối tiêu chuẩn hóa với cơ sở dữ liệu, file systems, API và công cụ lập trình thông qua 3 thành phần chính:
- **Tools**: Các hàm thực thi mà LLM có thể gọi (truy vấn DB, lệnh shell, gọi API).
- **Resources**: Nguồn dữ liệu tĩnh hoặc động (tài liệu, database, web content).
- **Prompts**: Mẫu hướng dẫn tái sử dụng định hình hành vi LLM.

---

## 2. Bề mặt tấn công MCP: 4 Lớp Rủi ro (Four Threat Layers)

Theo phân tích từ các tiêu chuẩn bảo mật doanh nghiệp (như OWASP ASI và hướng dẫn CSI của CISA/Coalition for Secure AI năm 2026), rủi ro MCP được phân chia thành 4 lớp:

### 🛠️ Layer 1: Lỗi ở cấp độ Giao thức (Protocol-Level Weaknesses)
- **Session IDs trong URL**: Quy chuẩn cũ lưu session ID trực tiếp trên URL (`/messages/?sessionId=UUID`), dễ dẫn đến rò rỉ log và chiếm phiên làm việc (session hijacking).
- **Thiếu chuẩn Xác thực & Toàn vẹn (Authentication & Message Integrity)**: Giao thức không bắt buộc mã hóa tin nhắn (message signing) hoặc cơ chế xác thực chuẩn, tạo kẽ hở cho tấn công Man-in-the-Middle (MitM).
- **Confused Deputy qua Proxy**: Các MCP proxy sử dụng static OAuth client IDs có thể bị lợi dụng để lấy mã ủy quyền mà không có sự đồng ý của người dùng.

### 💻 Layer 2: Lỗ hổng Triển khai Server (Server Implementation Vulnerabilities)
- Các lỗi kinh điển như Command Injection, Path Traversal, SSRF xuất hiện tràn lan do tốc độ phát triển mã nguồn MCP server quá nhanh vượt qua các quy trình kiểm tra bảo mật truyền thống.
- **Điển hình thực tế (CVE-2025-6514 & Chuỗi RCE trong `mcp-server-git`)**: Cho phép kẻ tấn công thực thi mã từ xa thông qua việc xử lý sai đường dẫn repository git hoặc tham số đầu vào không được làm sạch (sanitization).

### ☠️ Layer 3: Ngộ độc Metadata công cụ (Tool Metadata Poisoning / Prompt Injection)
- Phần lớn các MCP client hiện tại không kiểm tra tính tĩnh (static validation) của mô tả công cụ (tool descriptions) do server cung cấp.
- Khi một MCP server độc hại (hoặc bị chiếm quyền) cung cấp metadata chứa prompt injection ngầm, LLM sẽ tự động tiếp nhận và chuyển tiếp các lệnh nguy hiểm này mà người dùng không hề hay biết.

### ⛓️ Layer 4: Chuỗi cung ứng phần mềm MCP (Supply Chain Incidents)
- Với hơn 13.000+ MCP servers được lập chỉ mục công khai trên các registry vào đầu năm 2026, các nguy cơ chèn mã độc vào các thư viện bên thứ ba (malicious packages, typosquatting) đe dọa trực tiếp đến môi trường doanh nghiệp.

---

## 3. Giải pháp Phòng thủ & Giảm thiểu Rủi ro (Defensive Engineering)

Để vận hành MCP an toàn trong môi trường doanh nghiệp năm 2026, cần triển khai các lớp phòng thủ đồng bộ:

1. **Policy-as-Code (OPA / Gatekeeper)**:
   - Sử dụng Open Policy Agent (OPA) để kiểm soát các chính sách truy cập MCP server, từ chối tự động các kết nối không có chữ ký số hợp lệ hoặc sử dụng phiên bản chưa được kiểm duyệt.
2. **Runtime Security với Falco**:
   - Thiết lập các quy tắc Falco để giám sát hành vi thời gian thực của các tiến trình MCP server (phát hiện hành vi ghi file trái phép, mở socket mạng bất thường hoặc sinh tiến trình con `sh`/`bash`).
3. **Sandboxing nghiêm ngặt (Isolation)**:
   - Không chạy MCP server trực tiếp trên máy host hoặc tài khoản có quyền cao (`root`/`administrator`). Bắt buộc đóng gói MCP server trong container cô lập (Docker/gVisor) với quyền hạn tối thiểu (Principle of Least Privilege).
4. **Xác thực và Kiểm tra Metadata (Client-side Sanitization)**:
   - Triển khai lớp kiểm tra tĩnh (Static Validation) ở phía MCP Client đối với tất cả các tool descriptions nhận từ server trước khi đưa vào context của LLM.
