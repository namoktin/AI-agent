# Báo cáo Nghiên cứu Chuyên sâu: Hành vi Trồi bọt và Khung Benchmark SwarmBench trong Hệ thống Đa Tác Nhân LLM (2026)

## 1. Tổng quan về Hiện tượng Trồi bọt (Emergent Behavior)
Hành vi trồi bọt trong các hệ thống đa tác nhân LLM quy mô lớn là hiện tượng hệ thống biểu hiện các đặc tính, quy ước xã hội, hoặc chiến lược mà không một tác nhân đơn lẻ nào được lập trình sẵn hoặc có thể dự đoán trước khi đứng độc lập.

## 2. Các Dạng Trồi bọt Chính
- **Quy ước xã hội tự phát (Spontaneous Social Conventions):** Các tác nhân tự hội tụ về một quy tắc chung (ví dụ: quy ước đặt tên, chuẩn mực giao tiếp) thông qua lặp lại tương tác cục bộ, chịu ảnh hưởng mạnh bởi hiệu ứng nhóm thiểu số cam kết (committed minority).
- **Phân công lao động (Division of Labor):** Sự tự phân chia vai trò (nghiên cứu, viết lách, kiểm định) giúp tối ưu hóa hiệu suất tập thể nhưng tạo ra các điểm nghẽn phụ thuộc.
- **Thông đồng ngầm (Emergent Collusion):** Hiện tượng các tác nhân tối ưu hóa lợi nhuận tự hội tụ về các trạng thái độc quyền hoặc chia sẻ thị trường mà không hề có lệnh thông đồng từ bên ngoài.

## 3. Khung Đo lường SwarmBench & Giải pháp Quản trị
- **SwarmBench (2025/2026):** Đo lường trí tuệ bầy đàn trong điều kiện phân tán hoàn toàn (chỉ nhận thông tin cục bộ). Đánh giá qua 5 tác vụ cốt lõi: *Pursuit*, *Synchronization*, *Foraging*, *Flocking*, và *Transport*.
- **Thách thức:** LLM hiện đại vẫn gặp khó khăn trong việc lập kế hoạch dài hạn dưới sự bất định của môi trường phân tán.
