# BÁO CÁO TỔNG KẾT TOÀN DIỆN: BẢO MẬT & QUẢN TRỊ RỦI RO AGENTIC AI & MCP (2026)

**Ngày báo cáo:** 15 tháng 10, 2026  
**Chủ đề:** Đột phá bảo mật hệ thống Agentic AI, tiêu chuẩn OWASP Top 10 for Agentic Applications (2026), bảo mật Model Context Protocol (MCP) và chiến lược phòng thủ doanh nghiệp (TRiSM).

---

## 1. TỔNG QUAN BỐI CẢNH AN NINH AGENTIC AI NĂM 2026
Sự dịch chuyển từ **Generative AI truyền thống** (hỏi-đáp tĩnh) sang **Agentic AI** (hệ thống tự trị có mục tiêu, tự gọi công cụ, duy trì bộ nhớ dài hạn và tương tác đa tác nhân) đã mở ra một bề mặt tấn công hoàn toàn mới. Năm 2026 đánh dấu bước ngoặt khi cộng đồng bảo mật chính thức ban hành **OWASP Top 10 for Agentic Applications 2026** (tháng 12/2025) và chuẩn hóa bảo mật cho giao thức **Model Context Protocol (MCP)** nhằm đối phó với làn sóng tấn công tự động zero-click và lỗ hổng chuỗi cung ứng công cụ.

---

## 2. NHỮNG PHÁT HIỆN CỐT LÕI TỪ OWASP TOP 10 FOR AGENTIC APPLICATIONS (ASI01 - ASI10)
Khung chuẩn rủi ro bảo mật mới định hình 10 danh mục trọng yếu từ `ASI01` đến `ASI10`, tiêu biểu như:

*   **ASI01: Goal Hijacking & Prompt Injection:** Kẻ tấn công tiêm nhiễm câu lệnh độc hại vào dữ liệu đầu vào (web, tài liệu, email), khiến Agent đi chệch khỏi mục tiêu ban đầu và thực hiện hành vi trái phép (ví dụ sự cố **EchoLeak CVE-2025-32711** cho phép trích xuất dữ liệu nhạy cảm tự động).
*   **ASI02: Insecure Delegation & Misuse:** Trao quyền quá mức cho Agent mà thiếu cơ chế xác thực từng bước. Điển hình là sự cố **Amazon Q** ảnh hưởng đến hàng trăm nghìn lập trình viên do Agent tự ý thực thi các lệnh hệ thống có đặc quyền cao.
*   **ASI05: Unbounded Autonomy & Execution (RCE):** Agent tự chủ vận hành không giới hạn vòng lặp (autonomous loops), dẫn đến việc thực thi mã lệnh từ xa hoặc lỗi nghiêm trọng như sự cố **Replit Agent** vô tình xóa sạch cơ sở dữ liệu production trong thời gian đóng băng code.

---

## 3. BẢO MẬT GIAO THỨC MODEL CONTEXT PROTOCOL (MCP) & BỀ MẶT 4 LỚP TẤN CÔNG
Model Context Protocol (được ví như "USB-C cho AI") kết nối trực tiếp LLM với tài nguyên hệ thống qua giao diện JSON-RPC nhưng tiềm ẩn các nguy cơ lớn:
1.  **4 Lớp Bề mặt tấn công:** Giao thức truyền tải (Protocol), Triển khai máy chủ (Server Implementation), Siêu dữ liệu công cụ (Tool Metadata), và Chuỗi cung ứng (Supply Chain Registry).
2.  **Lỗ hổng thực tế:** Tiêu biểu như CVE-2025-6514 (RCE trong `mcp-server-git`), các cuộc tấn công **Tool Poisoning** và **Tool Rug-Pull** (thay đổi lén lút định nghĩa tool sau khi được cấp phép).
3.  **Giải pháp kiến trúc phòng thủ:**
    *   **MCP Gateway Proxy:** Đứng trung gian kiểm duyệt toàn bộ lưu lượng JSON-RPC, chặn đứng payload độc hại.
    *   **Tool Schema Signing & Diffing:** Ký số toàn bộ định nghĩa công cụ và kiểm tra sự thay đổi (diff) theo thời gian thực để chống rug-pull.
    *   **Sandboxing đa lớp:** Chạy mọi MCP Server trong container cô lập (Docker, gVisor) thay vì chạy trực tiếp trên máy chủ host.
    *   **OAuth 2.1 & mTLS:** Bắt buộc xác thực cứng thay vì kết nối mở không định danh.

---

## 4. CHIẾN LƯỢC PHÒNG THỦ DOANH NGHIỆP TRONG VÒNG ĐỜI ADLC (AGENTIC DEVELOPMENT LIFECYCLE)
Để vận hành hệ thống Agentic AI an toàn và tuân thủ khung **TRiSM (Trust, Risk and Security Management)**, doanh nghiệp cần triển khai các lớp kiểm soát:
*   **Phân tách định danh & Least Privilege:** Agent không được dùng chung token hoặc quyền hạn của tài khoản quản trị viên (Admin).
*   **Policy-as-Code (OPA / Gatekeeper):** Kiểm soát mọi hành động gọi công cụ thời gian thực dựa trên chính sách bảo mật động.
*   **AIBOM (AI Bill of Materials):** Kiểm kê toàn bộ LLM weights, MCP servers, prompt templates và third-party tools để quản lý rủi ro chuỗi cung ứng.
*   **Kill Switch & Runtime Monitoring:** Tích hợp cơ chế ngắt khẩn cấp tự động khi phát hiện vòng lặp vô tận hoặc hành vi bất thường thông qua công cụ giám sát thời gian thực như Falco.

---

## 5. KẾT LUẬN TRÍ NHỚ DÀI HẠN
Toàn bộ các phân tích chuyên sâu, trường hợp nghiên cứu thực tế và giải pháp kỹ thuật trên đã được hệ thống hóa, kiểm duyệt và lưu trữ an toàn vào **Trí nhớ dài hạn (Long-term Experience Vault)** của hệ thống thông qua các bản ghi thực nghiệm chuẩn hóa (`exp_1792054...`). Hệ thống đã sẵn sàng hỗ trợ Operator triển khai các giải pháp kiến trúc và mã nguồn bảo mật thực tế tiếp theo!
