# Báo cáo Nghiên cứu Chuyên sâu: Bảo mật Agentic AI & OWASP Top 10 cho Agentic Applications (Cập nhật 2026)

## 1. Tổng quan bối cảnh bảo mật 2026
Đến năm 2026, các hệ thống Trí tuệ Nhân tạo đã dịch chuyển từ các mô hình ngôn ngữ lớn (LLM) đơn lẻ sang **Agentic AI** và **Multi-Agent Systems (MAS)** — nơi các tác nhân AI tự trị (autonomous agents) tự phối hợp, lập kế hoạch, gọi công cụ (tool-calling) và thực thi quy trình phức tạp mà không cần can thiệp liên tục từ con người. 

Sự chuyển dịch này mở ra các bề mặt tấn công mới vượt ra ngoài phạm vi bảo mật LLM truyền thống, đòi hỏi các tiêu chuẩn quản trị rủi ro toàn diện như **OWASP Top 10 for Agentic Applications (phiên bản 2026 với tiền tố chuẩn ASI - Agentic Security Issue)** và khung quản trị **TRiSM (Trust, Risk, and Security Management)**.

---

## 2. Các rủi ro cốt lõi theo OWASP Agentic Top 10 (2026)
Hệ thống tiêu chuẩn bảo mật 2026 nhận diện các nhóm nguy cơ trọng yếu trong hệ thống agent tự trị:

1. **Excessive Agency (Quyền tự trị quá mức):**
   - *Nguy cơ:* Agent được cấp quyền thực hiện các thao tác nhạy cảm (ghi file, gửi email, thực thi lệnh hệ thống, chuyển tiền) mà thiếu cơ chế kiểm duyệt (human-in-the-loop) hoặc giới hạn phạm vi (sandboxing).
   - *Giải pháp:* Áp dụng nguyên tắc đặc quyền tối thiểu (Principle of Least Privilege), bắt buộc xác nhận thủ công đối với các tác vụ cấp cao.

2. **System Prompt Leakage & Extraction:**
   - *Nguy cơ:* Kẻ tấn công sử dụng các kỹ thuật jailbreak và prompt injection tinh vi để trích xuất cấu hình hệ thống, logic điều phối agent hoặc thông tin nhạy cảm trong system prompt.
   - *Giải pháp:* Tách biệt rõ ràng dữ liệu người dùng và system prompt, áp dụng cơ chế LLM Firewall (như Llama Guard 4, LlamaFirewall).

3. **Vector and Embedding Weaknesses:**
   - *Nguy cơ:* Lỗ hổng trong kho RAG và cơ sở dữ liệu vector cho phép tiêm nhiễm dữ liệu độc hại (data poisoning), dẫn đến việc agent đưa ra các quyết định sai lệch dựa trên tri thức giả mạo.
   - *Giải pháp:* Kiểm tra toàn vẹn nguồn dữ liệu đầu vào, xác thực metadata của vector embeddings.

4. **Insecure Multi-Agent Communication & MCP Vulnerabilities:**
   - *Nguy cơ:* Các agent giao tiếp qua lại hoặc qua các Model Context Protocol (MCP) servers bên thứ ba có thể bị chặn, giả mạo thông điệp (spoofing) hoặc lây lan lệnh độc hại giữa các agent trong mạng lưới.
   - *Giải pháp:* Mã hóa toàn bộ kênh giao tiếp giữa các agent, xác thực danh tính cryptographic cho từng agent node.

---

## 3. Công cụ Red-Teaming và Phòng thủ tiêu biểu (2026)
- **Công cụ Đánh giá & Red-Teaming:** 
  - *DeepTeam*, *Promptfoo*, và *ARTKIT* giúp tự động hóa việc kiểm thử tấn công giả lập (adversarial simulation) trên các hệ thống Multi-Agent của CrewAI, AutoGen.
- **Công cụ Giám sát & Guardrails:**
  - *Meta Llama Guard 4*, *LlamaFirewall* cung cấp lớp lọc thời gian thực cho đầu vào và đầu ra của agent.

---
*Báo cáo được tổng hợp và lưu trữ tự động vào Trí nhớ dài hạn của Trợ lý AI (Tháng 02/2026).*
