# BÁO CÁO NGHIÊN CỨU CHUYÊN SÂU: ĐÁNH GIÁ VÀ TỐI ƯU HÓA ĐỘ TIN CẬY MÔ PHỎNG XÃ HỘI AI (2026)

## 1. Vấn đề cốt lõi: Sai lầm của phương pháp đánh giá "Hard-Label" truyền thống
Trong các nghiên cứu mô phỏng xã hội trước đây (như Generative Agents), các nhà nghiên cứu thường đánh giá độ trung thực của LLM (fidelity) bằng cách so sánh xem agent có đưa ra câu trả lời **trùng khớp tuyệt đối (accuracy)** với một câu trả lời đơn lẻ của con người trong khảo sát hay không. Tuy nhiên, hành vi xã hội và tâm lý con người có tính chủ quan cao (*subjectivity*): cùng một tình huống, một người vào những thời điểm khác nhau hoặc những người khác nhau có thể đưa ra các quyết định hợp lý khác nhau. 
Do đó, một quan sát đơn lẻ từ dữ liệu thực tế chỉ là **một mẫu rút ra từ phân phối phản hồi tiềm ẩn (response distribution)**, chứ không phải là chân lý duy nhất. Việc ép mô hình tối ưu theo hard-label dẫn đến hiện tượng overfitting vào một câu trả lời duy nhất và làm mất đi tính đa dạng hành vi xã hội vốn có.

## 2. Chỉ số Hệ số Chủ quan (Subjectivity Coefficient)
Để giải quyết bài toán định lượng mức độ chủ quan của tác vụ, các nhà nghiên cứu đã đề xuất **Subjectivity Coefficient ($s(x)$)** dựa trên Entropy Shannon:
$$s(x) = \frac{H(p_x)}{\log K}$$
Trong đó:
- $p_x$ là phân phối phản hồi mục tiêu qua $K$ lựa chọn khác nhau.
- $H(p_x)$ là độ entropy Shannon của phân phối đó.
- $s(x)$ chạy từ 0 (tác vụ khách quan, hoàn toàn tất định như mã nguồn lập trình) đến 1 (tác vụ hoàn toàn chủ quan, phân phối đều).

## 3. Khung Huấn luyện thích ứng SALT (Subjectivity-Adaptive Soft-Label Training)
Phương pháp **SALT** khắc phục nhược điểm hard-label bằng cách:
1. **Xây dựng phân phối mềm (Soft Distributional Labels):** Nhóm các ngữ cảnh có ngữ nghĩa gần nhau từ dữ liệu thực tế để tạo thành phân phối xác suất thay vì một nhãn đơn lẻ.
2. **Bán kính thích ứng theo độ chủ quan:** Đối với các tác vụ ít chủ quan ($s(x)$ nhỏ), bán kính lân cận thu hẹp (về lại dạng single-label). Đối với các tác vụ có tính chủ quan cao ($s(x)$ lớn), thuật toán gom nhóm rộng hơn để nắm bắt toàn bộ phổ phản hồi của con người.
3. **SUBJSIM Benchmark:** Bộ dữ liệu chuẩn mực mới gồm 19,300 ngữ cảnh từ 193 annotator và 100 câu hỏi chủ quan, cho phép đánh giá phân phối KL divergence, JSD, TVD và MMD thay vì chỉ dùng độ chính xác thô.

## 4. Bài học cốt lõi cho Kỹ sư AI Agent (2026)
- Khi thiết kế hệ thống multi-agent mô phỏng hành vi con người (khảo sát thị trường, chính sách công, bầu cử), **không nên** kỳ vọng agent luôn đưa ra một đáp án duy nhất đúng.
- Cần tối ưu hóa mô hình LLM dựa trên **phân phối xác suất hành vi** thay vì câu trả lời cứng nhắc để đảm bảo Agent phản ánh chính xác sự đa dạng sắc thái tâm lý xã hội (diversity & nuance).
