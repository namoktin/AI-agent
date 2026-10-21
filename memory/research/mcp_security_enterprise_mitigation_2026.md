# BÁO CÁO NGHIÊN CỨU CHUYÊN SÂU: BẢO MẬT MCP & KIẾN TRÚC PHÒNG THỦ ENTERPRISE (2026)

## 1. Tổng quan tình hình an ninh Model Context Protocol (MCP) năm 2026
Được Anthropic ra mắt cuối năm 2024 như tiêu chuẩn kết nối universal ("USB-C cho AI"), MCP đã bùng nổ với hàng chục nghìn server được triển khai trong các tập đoàn lớn. Tuy nhiên, kiến trúc ban đầu tập trung vào tính năng đã tạo ra bề mặt tấn công cực lớn:
- **Hơn 14 CVE nghiêm trọng** được công bố (điển hình là CVE-2025-6514 mcp-remote RCE).
- **Hơn 200,000 MCP Server** bị cấu hình sai hoặc public trực tiếp trên Internet mà không có cơ chế xác thực.
- **28% doanh nghiệp thuộc danh sách Fortune 500** đã tích hợp MCP vào production nhưng đối mặt với rủi ro Shadow AI Tooling.

---

## 2. Bề mặt tấn công 4 lớp của MCP (The 4 Threat Layers)

### 🔴 Lớp 1: Protocol-Level Weaknesses (Điểm yếu cấp độ giao thức)
- **Session IDs trong URLs:** Giao thức chuẩn hóa việc truyền session ID qua URL (`GET /messages/?sessionId=UUID`), dẫn đến nguy cơ lộ log hệ thống và tấn công Session Hijacking.
- **Thiếu tiêu chuẩn xác thực chuẩn hóa:** Không có quy định bắt buộc về Authentication, tạo ra các giao diện kết nối lỏng lẻo.
- **Thiếu tính vẹn toàn thông điệp (Message Integrity):** Không có chữ ký số (Tool Signing) cho các gói tin JSON-RPC, cho phép kẻ tấn công thực hiện MitM (Man-in-the-Middle) để giả mạo tool definition.

### 🔴 Lớp 2: Server Implementation Vulnerabilities (Lỗ hổng cài đặt Server)
- Các server do cộng đồng hoặc nhà phát triển bên thứ ba xây dựng thường dính các lỗi kinh điển: **Command Injection**, **Path Traversal** (như chuỗi CVE trong `mcp-server-git`), và **SSRF**. Do MCP Server chạy trực tiếp với quyền của user hoặc service account, lỗ hổng RCE tại server đồng nghĩa với việc toàn bộ hệ thống máy chủ bị chiếm quyền.

### 🔴 Lớp 3: Client & LLM Context Poisoning (Đầu độc ngữ cảnh & Tool Metadata)
- MCP Client thông thường (như Claude Desktop, Cursor, Custom Agents) không thực hiện kiểm tra tĩnh (static validation) mô tả công cụ do server cung cấp. Kẻ tấn công có thể chèn các đoạn prompt ẩn bên trong metadata của tool (`description`, `parameters`) để đánh lừa LLM thực hiện các hành vi vượt quyền (Excessive Agency).

### 🔴 Lớp 4: Supply Chain & Registry Vulnerabilities (Chuỗi cung ứng & Kho lưu trữ tool)
- Các kho public registry cho MCP servers (như AgentSeal hoặc các GitHub repositories công cộng) đối mặt với rủi ro typosquatting, mã độc ngầm (Malicious Tool Packaging), hoặc các bản cập nhật bị chiếm quyền (Dependency Hijacking).

---

## 3. Giải pháp phòng thủ doanh nghiệp (Enterprise Mitigation Stack 2026)

Để triển khai MCP an toàn trong môi trường sản xuất (Production), các tổ chức áp dụng mô hình phòng thủ 4 lớp sau:

1. **MCP Gateway / Proxy Trung Gian:**
   - Đứng giữa MCP Client và các MCP Servers.
   - Chịu trách nhiệm xác thực token (OAuth2 / mTLS), kiểm tra tính vẹn toàn thông điệp và ghi nhật ký toàn bộ tool-call payload.

2. **Policy-as-Code (OPA & Gatekeeper):**
   - Viết các quy tắc kiểm duyệt JSON-RPC theo thời gian thực. Từ chối các lệnh gọi tool có tham số nhạy cảm (ví dụ: `rm -rf`, truy cập file hệ thống ngoài thư mục cho phép).

3. **Runtime Sandboxing (Docker / Firecracker / Falco):**
   - Mọi MCP Server bên thứ ba phải chạy trong container cách ly hoàn toàn (sandboxed) hoặc MicroVM với giới hạn quyền tài nguyên tối thiểu (Least Privilege).
   - Sử dụng Falco để giám sát các hành vi sinh tiến trình con (execve) hoặc mở kết nối mạng bất thường từ process của MCP Server.

4. **Tool Signing & Cryptographic Verification:**
   - Yêu cầu mọi MCP Server đăng ký doanh nghiệp phải ký số (Digital Signature) cho bộ công cụ của mình, loại bỏ tuyệt đối các server không rõ nguồn gốc.
