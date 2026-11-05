const fs = require('fs');

let html = fs.readFileSync('c:/Users/Nam/Desktop/AI agent/index.html', 'utf8');

// 1. Update specPrompt rule 8
const oldBlock1 = `8. CHUẨN MỰC CHẤT LƯỢNG KIỆT TÁC 9.0+ ĐẾN 9.5+ THEO CHUẨN QUỐC TẾ (MASTERPIECE ACADEMIC PROTOCOL):
   - Mật độ khoa học & Cơ chế sâu (Mechanism-First & Epistemic Honesty): Giải thích cơ chế thần kinh học trung thực (Myelination, LTP/NMDA/AMPA, BDNF, LTWM retrieval structures), không suy diễn sai lệch từ chuột/máu ngoại vi sang người khỏe.
   - Cân bằng 50/50: 50% Năng lực Đột phá & Phương pháp Khả thi đã được khoa học kiểm chứng và 50% Cơ sở Khoa học & Giới hạn Sinh học khách quan (Capacity vs Performance, Repair vs Augment, Bác bỏ ngụy khoa học, loại bỏ hoàn toàn chẩn đoán rởm adrenal fatigue).
   - Giao thức hành vi ứng dụng thực hành (Heuristics): Nhận thức, Thể chất, Cộng sinh AI (tuyệt đối không gắn mác chuẩn McKinsey, không bịa đặt số liệu ảo).
   - Tuyệt đối NGHIÊM CẤM bịa đặt kỷ lục thể thao, sự kiện tương lai hoặc nghiên cứu giả mạo.
   - Tiết kiệm token: Chỉ tạo DUY NHẤT 1 sản phẩm canonical hoàn thiện, không tạo file nháp/barem/SOP vụn vặt.`;

const newBlock1 = `8. CHUẨN MỰC CHẤT LƯỢNG NGHIÊN CỨU KHOA HỌC & ĐẠO ĐỨC HỌC THUẬT (ACADEMIC RIGOR & HONESTY PROTOCOL):
   - Mật độ khoa học & Cơ chế sâu (Mechanism-First & Epistemic Honesty): Giải thích cơ chế thần kinh học trung thực: Myelination (tinh chỉnh đồng bộ thời gian dẫn truyền qua eo Ranvier, không thần thánh hóa tăng tốc 100x), LTP qua NMDA/AMPA, BDNF, LTWM retrieval structures (Ericsson & Kintsch).
   - Tiếp xúc lạnh: Šrámek et al. (2000) ngâm nước 14°C trong 1h ở 10 nam giới: noradrenaline huyết tương tăng 530%, dopamine huyết tương tăng 250% (PMID 10751106, DOI 10.1007/s004210050065); catecholamine ngoại vi không qua BBB, không tự suy diễn dopamine não tăng, TUYỆT ĐỐI KHÔNG mô tả thành 'tăng nhẹ'.
   - Flow State: van der Linden et al. (2021) systematic review (25 nghiên cứu, N=471) chỉ ra bằng chứng thần kinh còn thưa thớt/thiếu nhất quán, Transient Hypofrontality chỉ là giả thuyết sơ bộ, DMN không tắt hoàn toàn.
   - Kỷ lục thể thao: Nêu chuẩn xác Kelvin Kiptum 2:00:35 (Chicago 2023 kỷ lục chính thức) vs Kipchoge 1:59:40 (INEOS biểu diễn), tuyệt đối cấm bịa 1:59:30.
   - Bác bỏ ngụy khoa học: Loại bỏ hoàn toàn chẩn đoán rởm adrenal fatigue (chỉ có suy tuyến thượng thận thực thể Adrenal Insufficiency).
   - Cân bằng 50/50: 50% Năng lực Đột phá & 50% Giới hạn Sinh học khách quan (Capacity vs Performance, Repair vs Augment).
   - Tuyệt đối KHÔNG tự tâng bốc bản thân ('kiệt tác 9.5+', 'hoàn thành xuất sắc', 'tuyệt đối không tì vết'). Mọi điểm số phải đến từ rubric kiểm toán độc lập.
   - Tiết kiệm token: Chỉ tạo DUY NHẤT 1 sản phẩm canonical hoàn thiện, không tạo file nháp/barem/SOP vụn vặt.`;

// 2. Update specSystem
const oldBlock2 = `QUY TẮC TRANH BIỆN & CHUẨN MỰC CHẤT LƯỢNG KIỆT TÁC 9.0+ ĐẾN 9.5+:
1. GỌI TÊN ĐỐI CHẤT CỤ THỂ: Khi chất vấn, phản biện hoặc trao đổi, hãy gọi đích danh thành viên bạn muốn trao đổi (ví dụ: @\${leadProposer.name}, @\${otherMembers[0]?.name || 'Đồng nghiệp'}).
2. NGUYÊN TẮC CƠ CHẾ SÂU & TRUNG THỰC HỌC THUẬT (MECHANISM-FIRST & EPISTEMIC HONESTY):
   - Mọi luận điểm phân tích KHÔNG ĐƯỢC dừng ở mức liệt kê tên gọi hay khẳng định bề nổi. BẮT BUỘC giải thích cơ chế trung thực, không suy diễn sai lệch:
     * Dẫn truyền qua sợi có myelin (tốc độ do giải phẫu bẩm sinh; Deliberate Practice tinh chỉnh đồng bộ thời gian chứ không tăng 100x), LTP qua NMDA/AMPA, BDNF củng cố synap.
     * Cowan 4 chunks vs Long-Term Working Memory (LTWM của Ericsson & Kintsch), Retrieval Structures theo chuyên ngành.
     * Tiếp xúc lạnh & Nhiệt sinh: Šrámek 2000 (catecholamine máu ngoại vi khi ngâm 1h, không qua BBB, không tự suy ra dopamine não tăng), Søberg 2021 (BAT & UCP-1 ở người bơi mùa đông), RBM3 (chuột thoái hóa não Mallucci 2015, chưa có RCT người khỏe).
     * Flow State: Trải nghiệm tâm lý có cơ sở, các giả thuyết thần kinh (Transient Hypofrontality) đang nghiên cứu, không khẳng định cocktail hóa học cố định và DMN không bị tắt hoàn toàn.
3. BẢO CHỨNG CÂN BẰNG ĐỘT PHÁ & GIỚI HẠN (50/50 DUAL-CORE BALANCE):
   - Tuyệt đối không sa vào tư duy tiêu cực một chiều ("chỉ chăm chăm vạch lá tìm sâu, phủ nhận mọi tiềm năng").
   - Bắt buộc phản ánh cân bằng 50/50: 50% Năng lực Đột phá & Phương pháp Khả thi + 50% Cơ sở Khoa học & Giới hạn Sinh học Khách quan (Capacity vs Performance, Repair vs Augment, Bác bỏ ngụy khoa học kể cả adrenal fatigue) + Bộ Giao thức Hành vi Thực hành (Nhận thức, Thể chất, Cộng sinh AI).
4. CHỐNG ẢO GIÁC & CẤM BỊA ĐẶT DỮ LIỆU (ZERO-HALLUCINATION GUARDRAILS):
   - TUYỆT ĐỐI NGHIÊM CẤM bịa đặt kỷ lục thể thao, sự kiện tương lai hoặc nghiên cứu giả mạo (ví dụ: cấm bịa kỷ lục marathon 1:59:30).
   - Nếu số liệu chưa có tài liệu gốc kiểm chứng, BẮT BUỘC ghi rõ "Đang nghiên cứu / Ước tính học thuật" thay vì tự sáng tác số liệu giả!
5. TIẾT KIỆM TOKEN & ZERO FILE SPAM (DUY NHẤT 1 BÁO CÁO CANONICAL):
   - Phản biện, đối chất và chất vấn trực tiếp trong nội dung văn bản.
   - TUYỆT ĐỐI KHÔNG tự tiện gọi 'SAVE_FILE' để lưu file nháp, biên bản họp vòng 1-6, barem hay SOP vụn vặt làm rác đĩa cứng và lãng phí token!
   - CHỈ Chủ trì đề xuất hoặc phiên chốt hạ cuối cùng mới gọi 'SAVE_FILE' để lưu DUY NHẤT 1 Báo cáo Canonical Đỉnh cao (và tối đa 1 bảng dữ liệu/nguồn .csv nếu có dữ liệu bảng).
6. TRÁNH TỰ TẠO VIỆC LẠC ĐỀ: Nếu bài toán không liên quan đến tìm việc Upwork/Freelancer, TUYỆT ĐỐI KHÔNG tự tiện đi quét Upwork tìm việc làm!
7. ĐIỀU KIỆN TIÊN QUYẾT KẾT THÚC TRANH BIỆN: TOÀN BỘ 100% thành viên Hội đồng phải đạt được tiếng nói chung thống nhất.
8. Ở CUỐI PHÁT BIỂU CỦA BẠN, BẮT BUỘC GHI RÕ 1 TRONG 3 THẺ ĐIỀU HƯỚNG & BIỂU QUYẾT:
   - '[ĐỒNG THUẬN 100%]': Bạn hoàn toàn bị thuyết phục bởi các lập luận, giải pháp đạt chuẩn 9.0+ đến 9.5+ cân bằng và dữ liệu chính xác. Nêu ngắn gọn điểm bạn công nhận.`;

const newBlock2 = `QUY TẮC TRANH BIỆN & CHUẨN MỰC CHẤT LƯỢNG KHOA HỌC (EPISTEMIC RIGOR & HONESTY):
1. GỌI TÊN ĐỐI CHẤT CỤ THỂ: Khi chất vấn, phản biện hoặc trao đổi, hãy gọi đích danh thành viên bạn muốn trao đổi (ví dụ: @\${leadProposer.name}, @\${otherMembers[0]?.name || 'Đồng nghiệp'}).
2. NGUYÊN TẮC CƠ CHẾ SÂU & TRUNG THỰC HỌC THUẬT (MECHANISM-FIRST & EPISTEMIC HONESTY):
   - Mọi luận điểm phân tích KHÔNG ĐƯỢC dừng ở mức liệt kê tên gọi hay khẳng định bề nổi. BẮT BUỘC giải thích cơ chế trung thực, không suy diễn sai lệch:
     * Dẫn truyền qua sợi có myelin: Tốc độ tối đa do giải phẫu bẩm sinh (đường kính sợi & độ dày myelin quy định); Deliberate Practice tinh chỉnh đồng bộ thời gian (temporal synchrony) giữa các mạch nơ-ron chứ không làm tăng tốc độ 100x; củng cố synap qua LTP (NMDA/AMPA) và BDNF.
     * Trí nhớ & Chuyên môn hóa: Cowan 4 chunks trong Working Memory ngắn hạn vs Long-Term Working Memory (LTWM của Ericsson & Kintsch) dựa trên Cấu trúc Truy xuất (Retrieval Structures) gắn liền tri thức chuyên ngành.
     * Tiếp xúc lạnh & Nhiệt sinh: Šrámek et al. (2000) ghi nhận ở 10 nam giới ngâm nước 14°C trong 1h: noradrenaline huyết tương tăng 530%, dopamine huyết tương tăng 250% (PMID 10751106, DOI 10.1007/s004210050065). TUYỆT ĐỐI KHÔNG mô tả giảm nhẹ thành 'tăng nhẹ'; catecholamine ngoại vi KHÔNG qua hàng rào máu não (BBB), TUYỆT ĐỐI KHÔNG tự suy diễn dopamine não tăng! Søberg 2021 (BAT & UCP-1 ở người bơi mùa đông); RBM3 (mô hình chuột thoái hóa não Mallucci 2015, chưa có RCT người khỏe, cấm ngoại suy bừa bãi).
     * Flow State: van der Linden et al. (2021) systematic review (25 nghiên cứu, N=471) chỉ ra bằng chứng thần kinh còn thưa thớt và thiếu nhất quán. Transient Hypofrontality (Dietrich) chỉ là giả thuyết khám phá sơ bộ, DMN không bị tắt hoàn toàn, TUYỆT ĐỐI KHÔNG khẳng định cocktail hóa học cố định.
     * Thể thao & Kỷ lục: BẮT BUỘC nêu đúng sự thật (Kelvin Kiptum giữ kỷ lục thế giới marathon chính thức 2:00:35 tại Chicago 2023; Eliud Kipchoge chạy 1:59:40 trong sự kiện biểu diễn INEOS 1:59 không hợp lệ để ghi nhận kỷ lục chính thức; TUYỆT ĐỐI KHÔNG bịa đặt 1:59:30).
     * Bác bỏ ngụy khoa học: 'Suy tuyến thượng thận chức năng / Adrenal Fatigue' là chẩn đoán giả mạo không được y khoa công nhận (chỉ có suy tuyến thượng thận thực thể Adrenal Insufficiency / bệnh Addison).
3. BẢO CHỨNG CÂN BẰNG ĐỘT PHÁ & GIỚI HẠN (50/50 DUAL-CORE BALANCE):
   - Tuyệt đối không sa vào tư duy tiêu cực một chiều ("chỉ chăm chăm vạch lá tìm sâu, phủ nhận mọi tiềm năng").
   - Bắt buộc phản ánh cân bằng 50/50: 50% Năng lực Đột phá & Phương pháp Khả thi + 50% Cơ sở Khoa học & Giới hạn Sinh học Khách quan (Capacity vs Performance, Repair vs Augment) + Bộ Giao thức Hành vi Thực hành (Nhận thức, Thể chất, Cộng sinh AI).
4. CHỐNG ẢO GIÁC & CẤM BỊA ĐẶT DỮ LIỆU (ZERO-HALLUCINATION GUARDRAILS):
   - TUYỆT ĐỐI NGHIÊM CẤM bịa đặt kỷ lục thể thao, sự kiện tương lai hoặc nghiên cứu giả mạo (ví dụ: cấm bịa kỷ lục marathon 1:59:30).
   - Nếu số liệu chưa có tài liệu gốc kiểm chứng, BẮT BUỘC ghi rõ "Đang nghiên cứu / Ước tính học thuật" thay vì tự sáng tác số liệu giả!
5. TIẾT KIỆM TOKEN & ZERO FILE SPAM (DUY NHẤT 1 BÁO CÁO CANONICAL):
   - Phản biện, đối chất và chất vấn trực tiếp trong nội dung văn bản.
   - TUYỆT ĐỐI KHÔNG tự tiện gọi 'SAVE_FILE' để lưu file nháp, biên bản họp vòng 1-6, barem hay SOP vụn vặt làm rác đĩa cứng và lãng phí token!
   - CHỈ Chủ trì đề xuất hoặc phiên chốt hạ cuối cùng mới gọi 'SAVE_FILE' để lưu DUY NHẤT 1 Báo cáo Canonical Đỉnh cao (và tối đa 1 bảng dữ liệu/nguồn .csv nếu có dữ liệu bảng).
6. TRÁNH TỰ TẠO VIỆC LẠC ĐỀ: Nếu bài toán không liên quan đến tìm việc Upwork/Freelancer, TUYỆT ĐỐI KHÔNG tự tiện đi quét Upwork tìm việc làm!
7. ĐIỀU KIỆN TIÊN QUYẾT KẾT THÚC TRANH BIỆN: TOÀN BỘ 100% thành viên Hội đồng phải đạt được tiếng nói chung thống nhất.
8. Ở CUỐI PHÁT BIỂU CỦA BẠN, BẮT BUỘC GHI RÕ 1 TRONG 3 THẺ ĐIỀU HƯỚNG & BIỂU QUYẾT:
   - '[ĐỒNG THUẬN 100%]': Bạn hoàn toàn bị thuyết phục bởi các lập luận, giải pháp đạt chuẩn nghiên cứu khoa học cân bằng và dữ liệu chính xác. Nêu ngắn gọn điểm bạn công nhận.`;

// 3. Update pPrompt
const oldBlock3 = `BÁO CÁO CỦA BẠN BẮT BUỘC ĐẠT CHUẨN KIỆT TÁC 9.0+ ĐẾN 9.5+ THEO TIÊU CHUẨN KHOA HỌC QUỐC TẾ:
1. Executive Summary: Luận đề trung tâm & Tuyên ngôn chiến lược điều hành.
2. 50% Năng lực Đột phá & Phương pháp Khả thi đã được khoa học kiểm chứng (Mechanism-First & Epistemic Rigor):
   - Neuroplasticity & Deliberate Practice: Dẫn truyền nhảy cóc qua eo Ranvier ở sợi có myelin (tinh chỉnh độ đồng bộ thời gian dẫn truyền, không thần thánh hóa tăng tốc 100x), LTP qua NMDA/AMPA, BDNF củng cố synap.
   - Memory & Chunking: Cowan 4 chunks vs Long-Term Working Memory (LTWM của Ericsson & Kintsch 1995), Cấu trúc truy xuất (Retrieval Structures) theo chuyên ngành.
   - Thích nghi Sinh lý: UCP-1 ở mỡ nâu BAT (nhiệt sinh Søberg 2021), catecholamine huyết tương ngoại vi (Šrámek 2000, không qua BBB, không tự suy ra dopamine não tăng), thể dục aerobic duy trì thể tích hồi hải mã và BDNF.
   - Flow State & Deep Work: Trải nghiệm tâm lý có thật, các giả thuyết thần kinh (Transient Hypofrontality) đang nghiên cứu, không khẳng định cocktail hóa học cố định.
   - Human-AI Cognitive Symbiosis: Ngoại sinh hóa lưu trữ thông tin, AI làm Cognitive Co-processor.
3. 50% Cơ sở Khoa học & Giới hạn Sinh học Khách quan: Phân định Capacity (trần phần cứng) vs Performance (tối ưu hóa kỹ năng); Repair (phục hồi) vs Augment (nâng cấp); Bác bỏ ngụy khoa học (fMRI chứng minh 100% não hoạt động, Nootropics Limitless là gian lận tiếp thị, Luật hấp dẫn siêu hình, loại bỏ hoàn toàn chẩn đoán rởm adrenal fatigue).
4. Ma trận đối chiếu bằng chứng thực nghiệm (Tier 1 - Tier 4 Epistemic Matrix, minh bạch thiết kế nghiên cứu, TUYỆT ĐỐI KHÔNG bịa đặt số liệu/kỷ lục tương lai).
5. Bộ Giao thức Hành vi Thực hành Cá nhân (Heuristics): Giao thức Nhận thức Deep Work linh hoạt, Giao thức Thể chất 150 phút aerobic/tuần và tiếp xúc lạnh an toàn theo dõi tim mạch, Giao thức Cộng sinh AI đo bằng KPI thực tế (tuyệt đối không gắn mác chuẩn McKinsey).`;

const newBlock3 = `BÁO CÁO CỦA BẠN BẮT BUỘC ĐẠT CHUẨN NGHIÊN CỨU KHOA HỌC CHÍNH XÁC & KHÁCH QUAN THEO CÁC TIÊU CHUẨN QUỐC TẾ:
1. Executive Summary: Luận đề trung tâm & Tuyên ngôn chiến lược điều hành.
2. 50% Năng lực Đột phá & Phương pháp Khả thi đã được khoa học kiểm chứng (Mechanism-First & Epistemic Rigor):
   - Neuroplasticity & Deliberate Practice: Dẫn truyền nhảy cóc qua eo Ranvier ở sợi có myelin (tinh chỉnh độ đồng bộ thời gian dẫn truyền temporal synchrony, không thần thánh hóa tăng tốc 100x), LTP qua NMDA/AMPA, BDNF củng cố synap.
   - Memory & Chunking: Cowan 4 chunks vs Long-Term Working Memory (LTWM của Ericsson & Kintsch 1995), Cấu trúc truy xuất (Retrieval Structures) theo chuyên ngành.
   - Thích nghi Sinh lý: UCP-1 ở mỡ nâu BAT (nhiệt sinh Søberg 2021); Tiếp xúc lạnh: Šrámek et al. (2000) ở 10 nam giới ngâm 14°C trong 1h: noradrenaline huyết tương tăng 530%, dopamine huyết tương tăng 250% (PMID 10751106, DOI 10.1007/s004210050065; catecholamine ngoại vi không qua BBB, không tự suy ra dopamine não tăng, TUYỆT ĐỐI KHÔNG mô tả là 'tăng nhẹ'); thể dục aerobic duy trì thể tích hồi hải mã và BDNF.
   - Flow State & Deep Work: Trải nghiệm tâm lý có thật, van der Linden et al. (2021) systematic review (25 nghiên cứu, N=471) chỉ ra bằng chứng thần kinh còn thưa thớt/thiếu nhất quán, Transient Hypofrontality chỉ là giả thuyết khám phá sơ bộ, DMN không bị tắt hoàn toàn, TUYỆT ĐỐI KHÔNG khẳng định cocktail hóa học cố định.
   - Human-AI Cognitive Symbiosis: Ngoại sinh hóa lưu trữ thông tin, AI làm Cognitive Co-processor.
3. 50% Cơ sở Khoa học & Giới hạn Sinh học Khách quan: Phân định Capacity (trần phần cứng) vs Performance (tối ưu hóa kỹ năng); Repair (phục hồi) vs Augment (nâng cấp); Kỷ lục marathon thế giới chính thức của Kelvin Kiptum 2:00:35 vs Kipchoge INEOS 1:59:40; Bác bỏ ngụy khoa học (fMRI chứng minh 100% não hoạt động, Nootropics Limitless là gian lận tiếp thị, loại bỏ hoàn toàn chẩn đoán rởm adrenal fatigue).
4. Ma trận Claim Ledger & Đối chiếu bằng chứng thực nghiệm (Tier 1 - Tier 4 Epistemic Matrix, minh bạch DOI/PMID, TUYỆT ĐỐI KHÔNG bịa đặt số liệu/kỷ lục tương lai).
5. Bảng Rubric 9 Tiêu chí Quality Gate V2 minh chứng tính trung thực và phương pháp kiểm chứng độc lập.
6. Bộ Giao thức Hành vi Thực hành Cá nhân (Heuristics): Giao thức Nhận thức Deep Work linh hoạt, Giao thức Thể chất 150 phút aerobic/tuần và tiếp xúc lạnh an toàn theo dõi tim mạch, Giao thức Cộng sinh AI đo bằng KPI thực tế (tuyệt đối không gắn mác chuẩn McKinsey, không tự tâng bốc).`;

// 4. Update pRevPrompt
const oldBlock4 = `NHIỆM VỤ ĐỐI THOẠI, TIẾP THU & HOÀN THIỆN KIỆT TÁC 9.0+ ĐẾN 9.5+:
1. Đối thoại biện chứng súc tích: Trực tiếp trả lời, giải trình hoặc tiếp thu ý kiến của từng chuyên gia (@Tên Chuyên gia). Dung hòa học thuật, không bao biện, không né tránh.
2. Nâng cấp Toàn diện Báo cáo Đạt chuẩn 9.0+ đến 9.5+ Quốc tế:
   - Cân bằng chuẩn 50% Tiềm năng đột phá & 50% Giới hạn sinh học khách quan.
   - Luôn giải thích bằng Cơ chế Tầng sâu & Trung thực Học thuật (Mechanism-First & Epistemic Honesty): Dẫn truyền sợi có myelin (tinh chỉnh đồng bộ, không tăng 100x), LTP (NMDA/AMPA), LTWM retrieval structures, UCP-1 mỡ nâu BAT (nhiệt sinh), Šrámek 2000 (catecholamine ngoại vi, không qua BBB).
   - Thẩm định Epistemology Tier 1 - Tier 4 (Tier 1 Khoa học đã xác lập, Tier 2 Thử nghiệm RCT sinh lý, Tier 3 Giả thuyết/Mô hình động vật RBM3/Glymphatic, Tier 4 Bác bỏ ngụy khoa học kể cả adrenal fatigue; TUYỆT ĐỐI KHÔNG bịa đặt số liệu/kỷ lục tương lai).
   - Bộ 3 Giao thức Hành vi Thực hành (Heuristics): Nhận thức, Thể chất, Cộng sinh AI (tuyệt đối không gắn mác chuẩn McKinsey, không bịa KPI ảo).
3. BẮT BUỘC GỌI 'SAVE_FILE' ĐỂ GHI ĐÈ / HOÀN THIỆN DUY NHẤT BẢN BÁO CÁO CANONICAL CHÍNH TRÊN ĐĨA CỨNG (ví dụ 'bao_cao_canonical_tong_hop.md')! TUYỆT ĐỐI KHÔNG TẠO FILE NHÁP/SOP VỤN VẶT!
4. KẾT LUẬN & BIỂU QUYẾT TRUNG THỰC:
   - Nếu phương án đã được cập nhật toàn diện, giải quyết triệt để mọi phản biện và đạt chuẩn 9.0+: Kết thúc bằng '[ĐỒNG THUẬN 100%]'.`;

const newBlock4 = `NHIỆM VỤ ĐỐI THOẠI, TIẾP THU & HOÀN THIỆN BÁO CÁO NGHIÊN CỨU KHOA HỌC CHUẨN MỰC:
1. Đối thoại biện chứng súc tích: Trực tiếp trả lời, giải trình hoặc tiếp thu ý kiến của từng chuyên gia (@Tên Chuyên gia). Dung hòa học thuật, không bao biện, không né tránh.
2. Hoàn thiện Toàn diện Báo cáo Đạt chuẩn Độc lập & Khoa học Khách quan:
   - Cân bằng chuẩn 50% Tiềm năng đột phá & 50% Giới hạn sinh học khách quan.
   - Luôn giải thích bằng Cơ chế Tầng sâu & Trung thực Học thuật (Mechanism-First & Epistemic Honesty): Dẫn truyền sợi có myelin (tinh chỉnh đồng bộ thời gian temporal synchrony, không tăng 100x), LTP (NMDA/AMPA), LTWM retrieval structures (Ericsson & Kintsch), UCP-1 mỡ nâu BAT (nhiệt sinh), Šrámek 2000 (huyết tương noradrenaline +530%, dopamine +250%, N=10, không qua BBB, không suy diễn dopamine não tăng, không mô tả thành 'tăng nhẹ'), van der Linden 2021 (Flow State: 25 nghiên cứu, N=471, bằng chứng thưa thớt, Transient Hypofrontality chỉ là giả thuyết sơ bộ).
   - Thẩm định Epistemology Tier 1 - Tier 4 (Tier 1 Khoa học đã xác lập, Tier 2 Thử nghiệm RCT sinh lý, Tier 3 Giả thuyết/Mô hình động vật RBM3/Glymphatic, Tier 4 Bác bỏ ngụy khoa học kể cả adrenal fatigue; TUYỆT ĐỐI KHÔNG bịa đặt số liệu/kỷ lục marathon Kelvin Kiptum 2:00:35 vs Kipchoge INEOS 1:59:40).
   - Kèm bảng Claim Ledger chi tiết (Mã CLM, tuyên bố, trạng thái bằng chứng, nguồn DOI/PMID, trích dẫn) và Rubric 9 tiêu chí Quality Gate V2.
   - Bộ 3 Giao thức Hành vi Thực hành (Heuristics): Nhận thức, Thể chất, Cộng sinh AI (không gắn mác sai lệch, không bịa KPI ảo, không tự tâng bốc).
3. BẮT BUỘC GỌI 'SAVE_FILE' ĐỂ GHI ĐÈ / HOÀN THIỆN DUY NHẤT BẢN BÁO CÁO CANONICAL CHÍNH TRÊN ĐĨA CỨNG (ví dụ 'bao_cao_canonical_tong_hop.md')! TUYỆT ĐỐI KHÔNG TẠO FILE NHÁP/SOP VỤN VẶT!
4. KẾT LUẬN & BIỂU QUYẾT TRUNG THỰC:
   - Nếu phương án đã được cập nhật toàn diện, giải quyết triệt để mọi phản biện và vượt qua Quality Gate: Kết thúc bằng '[ĐỒNG THUẬN 100%]'.`;

// 5. Update Quality Gate Passed block
const oldBlock5 = `} else if (qgData && qgData.qualityGate && qgData.qualityGate.passed) {
                    appendCorporateMessage('war_room', { name: "🛡️ QUALITY GATE 9.0+", avatar: "🛡️", color: "#10b981" }, \`
                        <div style="background:rgba(16, 185, 129, 0.1); border:1px solid #10b981; border-radius:6px; padding:10px 14px; margin:8px 0;">
                            <div style="color:#34d399; font-weight:800; font-size:0.9rem; margin-bottom:4px;">
                                🏅 QUALITY GATE PASSED: BÁO CÁO ĐẠT CHUẨN KHOA HỌC \${qgData.qualityGate.score}/10
                            </div>
                            <div style="font-size:0.78rem; color:#a7f3d0; line-height:1.4;">
                                100% Tuyên bố khoa học, mã DOI/PMID và phân tầng Epistemic Matrix đã vượt qua bộ kiểm thử tự động không tì vết!
                            </div>
                        </div>
                    \`, "bot-message");
                }`;

const newBlock5 = `} else if (qgData && qgData.qualityGate && qgData.qualityGate.passed) {
                    const rubricRows = (qgData.qualityGate.rubric || []).map(r => \`
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <td style="padding: 4px 6px; font-weight: 600; color: #34d399;">✓ \${escapeHtml(r.id)}</td>
                            <td style="padding: 4px 6px; color: #cbd5e1;">\${escapeHtml(r.label)}</td>
                            <td style="padding: 4px 6px; color: #94a3b8; font-size: 0.72rem;">\${escapeHtml(r.notes || 'Đã xác minh')}</td>
                        </tr>
                    \`).join('');

                    appendCorporateMessage('war_room', { name: "🛡️ QUALITY GATE V2", avatar: "🛡️", color: "#10b981" }, \`
                        <div style="background:rgba(16, 185, 129, 0.1); border:1px solid #10b981; border-radius:6px; padding:12px 14px; margin:8px 0;">
                            <div style="color:#34d399; font-weight:800; font-size:0.9rem; margin-bottom:4px;">
                                🛡️ QUALITY GATE PASSED: BÁO CÁO ĐẠT CHUẨN KHOA HỌC (\${qgData.qualityGate.score}/10)
                            </div>
                            <div style="font-size:0.78rem; color:#a7f3d0; line-height:1.4; margin-bottom:8px;">
                                Báo cáo đã vượt qua toàn bộ 9 tiêu chí trong Rubric Kiểm định Khoa học Độc lập (Không lỗi phương pháp, không ngụy tạo số liệu):
                            </div>
                            <table style="width: 100%; font-size: 0.72rem; border-collapse: collapse; background: rgba(0,0,0,0.25); border-radius: 4px;">
                                <thead>
                                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: #94a3b8; text-align: left;">
                                        <th style="padding: 4px 6px;">Tiêu chí Rubric</th>
                                        <th style="padding: 4px 6px;">Nội dung Thẩm định</th>
                                        <th style="padding: 4px 6px;">Kết quả Kiểm tra</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${rubricRows}
                                </tbody>
                            </table>
                        </div>
                    \`, "bot-message");
                }`;

function applyRep(src, oldS, newS, name) {
    // Normalize line endings for replacement match
    const normSrc = src.replace(/\r\n/g, '\n');
    const normOld = oldS.replace(/\r\n/g, '\n');
    const normNew = newS.replace(/\r\n/g, '\n');

    if (!normSrc.includes(normOld)) {
        console.error('FAILED TO MATCH: ' + name);
        process.exit(1);
    }
    const parts = normSrc.split(normOld);
    if (parts.length !== 2) {
        console.error('MULTIPLE MATCHES FOR: ' + name);
        process.exit(1);
    }
    console.log('Successfully matched and replaced: ' + name);
    return parts[0] + normNew + parts[1];
}

html = applyRep(html, oldBlock1, newBlock1, 'Block 1 (specPrompt)');
html = applyRep(html, oldBlock2, newBlock2, 'Block 2 (specSystem)');
html = applyRep(html, oldBlock3, newBlock3, 'Block 3 (pPrompt)');
html = applyRep(html, oldBlock4, newBlock4, 'Block 4 (pRevPrompt)');
html = applyRep(html, oldBlock5, newBlock5, 'Block 5 (Quality Gate Card)');

// Restore Windows CRLF
html = html.replace(/\r?\n/g, '\r\n');

fs.writeFileSync('c:/Users/Nam/Desktop/AI agent/index.html', html, 'utf8');
console.log('ALL 5 FRONTEND UPGRADES APPLIED SUCCESSFULLY TO index.html');

