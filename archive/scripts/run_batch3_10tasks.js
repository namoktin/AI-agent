const http = require('http');
const fs = require('fs');
const path = require('path');

const tasks = [
    {
        id: 1,
        title: "Kịch bản Video Viral ngắn (TikTok/Reels) & Prompt hình ảnh",
        prompt: "Đóng vai Giám đốc Sáng tạo nội dung (Creative Director). Hãy lên kịch bản chi tiết cho 3 video ngắn 30-45 giây về chủ đề 'Ứng dụng AI tiết kiệm 3 tiếng làm việc mỗi ngày' theo công thức Hook - Value - Call to Action. Kèm theo prompt chi tiết bằng tiếng Anh để nạp vào AI vẽ ảnh (Midjourney/Flux) làm ảnh bìa thumbnail cho từng video. Lưu toàn bộ vào file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\kich_ban_video_viral.md."
    },
    {
        id: 2,
        title: "Email B2B chào hàng cá nhân hóa & Danh sách đối tác",
        prompt: "Đóng vai Chuyên viên Sales B2B. Hãy soạn một chuỗi Email chào hàng lạnh (Cold Email Outreach) 3 bước (Email 1: Giới thiệu giải pháp -> Email 2: Bằng chứng thành công -> Email 3: Lời mời hợp tác cuối cùng) để chào bán dịch vụ thiết lập Chatbot AI tự động cho các chuỗi thời trang tại Việt Nam. Đồng thời tạo tệp C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\danh_sach_doi_tac_tiem_nang.csv chứa thông tin giả định chuẩn (Tên shop, Người liên hệ, Email, Vấn đề gặp phải). Toàn bộ nội dung email lưu vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\chuoi_email_chao_hang.md."
    },
    {
        id: 3,
        title: "Phân tích biến động Tỷ giá & Vàng, kịch bản phòng hộ tài sản",
        prompt: "Đóng vai Chuyên viên Phân tích vĩ mô. Hãy thu thập thông tin và phân tích biến động thị trường tài chính hiện tại (Tỷ giá USD/VND, giá vàng SJC/nhẫn trơn, lãi suất ngân hàng). Đưa ra 3 kịch bản thị trường và khuyến nghị phân bổ tài sản cho nhà đầu tư cá nhân có vốn dưới 500 triệu đồng. Lưu báo cáo vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\phan_tich_thi_truong_tai_chinh.md."
    },
    {
        id: 4,
        title: "Giả lập khảo sát 100 khách hàng & Vẽ biểu đồ NPS",
        prompt: "Đóng vai Kỹ sư Dữ liệu (Data Scientist). Hãy viết script Python C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\khao_sat_khach_hang.py để sinh dữ liệu khảo sát độ hài lòng của 100 khách hàng (Điểm chấm 1-10, Độ tuổi, Lý do đánh giá). Cho script tự thực thi để xuất ra C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\ket_qua_khao_sat.csv, tính toán chỉ số Net Promoter Score (NPS) và vẽ biểu đồ hình tròn (Pie Chart) 300 DPI lưu tại C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bieu_do_nps.png. Tóm tắt phân tích vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bao_cao_khao_sat_nps.md."
    },
    {
        id: 5,
        title: "Viết Tool kiểm tra Link Chết (Broken Link Checker)",
        prompt: "Đóng vai Kỹ sư Tự động hóa. Hãy viết một script Python C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\kiem_tra_link.py. Cho script kiểm tra danh sách 5 trang báo lớn tại Việt Nam (VnExpress, TuoiTre, ThanhNien, CafeF, VietnamNet), đo mã trạng thái HTTP (Status code 200/404/500) và tốc độ phản hồi (ms). Cho script tự chạy, xuất kết quả ra C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\ket_qua_kiem_tra_web.csv và tóm tắt vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bao_cao_ha_tang_web.md."
    },
    {
        id: 6,
        title: "Viết Tool theo dõi & Cảnh báo giá sản phẩm (Price Monitor)",
        prompt: "Hãy xây dựng một công cụ Python C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\price_tracker.py mô phỏng việc theo dõi giá một sản phẩm công nghệ (ví dụ MacBook Air M3) qua 5 mốc thời gian. Nếu phát hiện giá giảm quá 10%, tự động tạo thông báo alert trong file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\canh_bao_giam_gia.txt. Cho chạy script để chứng minh hệ thống hoạt động chính xác và xuất báo cáo vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bao_cao_theo_doi_gia.md."
    },
    {
        id: 7,
        title: "Nghiên cứu Y học chứng cứ: Tối ưu Giấc ngủ sâu (Deep Sleep)",
        prompt: "Đóng vai Chuyên gia Y sinh học. Hãy tra cứu trên y văn chính thống (PubMed/Europe PMC) và tổng hợp 3 nghiên cứu lâm sàng mới nhất về các phương pháp cải thiện giai đoạn ngủ sâu (Slow-wave sleep) và giảm mệt mỏi cho người làm việc ca đêm. Mỗi nghiên cứu phải có PMID, số lượng mẫu thử nghiệm, kết luận số liệu định lượng (p-value). Lưu vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\nghien_cuu_giac_ngu_sau.md."
    },
    {
        id: 8,
        title: "Lập Lộ trình 30 ngày tự học AI Automation từ con số 0",
        prompt: "Đóng vai Cố vấn Đào tạo Công nghệ. Hãy xây dựng một lộ trình chi tiết từng ngày (30 ngày) cho người không biết lập trình để làm chủ các công cụ AI tự động hóa (Make.com, n8n, ChatGPT API, Python tự động). Mỗi ngày cần nêu rõ: Mục tiêu học trong 1 tiếng, Dự án nhỏ cần thực hành và Tài liệu tham khảo miễn phí. Lưu vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\lo_trinh_hoc_ai_automation.md."
    },
    {
        id: 9,
        title: "Bản Checklist Kiểm soát Gian hàng Shopee / TikTok Shop",
        prompt: "Đóng vai Chuyên gia Vận hành E-commerce. Hãy thiết kế một bảng Checklist toàn diện gồm 20 tiêu chí kiểm toán một gian hàng TikTok Shop/Shopee trước khi đổ tiền chạy quảng cáo (Bao gồm: Tối ưu SEO tiêu đề, Hình ảnh chuẩn sàn, Video review, Chính sách đổi trả, Tốc độ phản hồi chat...). Định dạng bảng Markdown trực quan, có cột Trọng số và Tiêu chuẩn đạt. Lưu vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\checklist_kiem_toan_gian_hang.md."
    },
    {
        id: 10,
        title: "Kế hoạch Quản lý dòng tiền cá nhân & Quỹ dự phòng 6 tháng",
        prompt: "Đóng vai Chuyên viên Hoạch định Tài chính Cá nhân. Với mức thu nhập trung bình 20 triệu VNĐ/tháng, hãy lập một kế hoạch phân bổ chi tiêu theo quy tắc 50/30/20 cải tiến. Tính toán chi tiết số tiền và lộ trình từng tháng để xây dựng quỹ khẩn cấp 6 tháng (Emergency Fund). Xuất bảng tính ngân sách ra C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bang_tinh_dong_tien.csv và bản phân tích chi tiết vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\ke_hoach_tai_chinh_ca_nhan.md."
    }
];

function executeTask(item) {
    return new Promise((resolve) => {
        console.log(`\n===============================================================`);
        console.log(`🚀 [BẮT ĐẦU TASK ${item.id}/10]: ${item.title}`);
        console.log(`===============================================================`);
        const startTime = Date.now();

        const postData = JSON.stringify({
            task: item.prompt,
            useCache: false
        });

        const req = http.request('http://localhost:3000/api/v2/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 900000 // 15 phút
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                console.log(`\n🏁 [HOÀN THÀNH TASK ${item.id} SAU ${elapsed} GIÂY]`);
                try {
                    const data = JSON.parse(body);
                    const rawScore = data.qualityScore || (data.critique?.overallScore) || (data.success ? 90 : 0);
                    const score10 = (rawScore / 10).toFixed(1);

                    console.log(`- Trạng thái:`, data.success ? 'THÀNH CÔNG' : 'CÓ VẤN ĐỀ');
                    console.log(`- Điểm chất lượng (thang 10):`, `${score10}/10 (Gốc: ${rawScore}/100)`);
                    console.log(`- Phán quyết Critic:`, data.critique?.verdict || 'N/A');
                    
                    resolve({
                        id: item.id,
                        title: item.title,
                        elapsed,
                        success: !!data.success,
                        score10,
                        rawScore,
                        verdict: data.critique?.verdict || 'N/A',
                        error: data.error || null
                    });
                } catch (e) {
                    console.error(`- Lỗi phân tích phản hồi Task ${item.id}:`, e.message);
                    resolve({
                        id: item.id,
                        title: item.title,
                        elapsed,
                        success: false,
                        score10: '0.0',
                        verdict: 'PARSE_ERROR',
                        error: e.message
                    });
                }
            });
        });

        req.on('error', (e) => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.error(`- Lỗi kết nối Task ${item.id}:`, e.message);
            resolve({
                id: item.id,
                title: item.title,
                elapsed,
                success: false,
                score10: '0.0',
                verdict: 'CONN_ERROR',
                error: e.message
            });
        });

        req.write(postData);
        req.end();
    });
}

async function runAll() {
    console.log(`🔥 BẮT ĐẦU CHẠY BATCH 10 TÁC VỤ THỰC CHIẾN MỚI`);
    console.log(`⏰ Thời gian khởi động: ${new Date().toLocaleString()}`);
    console.log(`⚠️  NGUYÊN TẮC: Nếu có lỗi ở bất kỳ task nào, hệ thống KHÔNG dừng lại mà tiếp tục chạy hết 10 task!`);

    const results = [];

    for (const item of tasks) {
        try {
            const res = await executeTask(item);
            results.push(res);
        } catch (err) {
            console.error(`Lỗi ngoại lệ Task ${item.id}:`, err.message);
            results.push({
                id: item.id,
                title: item.title,
                elapsed: 0,
                success: false,
                score10: '0.0',
                verdict: 'EXCEPTION',
                error: err.message
            });
        }

        // Nghỉ 5 giây giữa các task để model hồi phục rate-limit
        if (item.id < tasks.length) {
            console.log(`⏳ Nghỉ 5 giây trước khi sang Task ${item.id + 1}...`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    console.log(`\n===============================================================`);
    console.log(`🎉 BẢNG TỔNG HỢP ĐÁNH GIÁ 10 TÁC VỤ (THANG ĐIỂM 10)`);
    console.log(`===============================================================`);
    results.forEach(r => {
        const icon = r.success ? '✅' : '❌';
        console.log(`${icon} Task ${r.id.toString().padStart(2, ' ')}: ${r.title.padEnd(55, ' ')} | Điểm: ${r.score10}/10 | ${r.elapsed}s | ${r.verdict}`);
    });

    // Xuất báo cáo tổng kết ra đĩa
    const reportPath = 'C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bao_cao_10_task.md';
    let md = `# Báo cáo Tổng hợp Kiểm định 10 Tác vụ Thực chiến\n\n`;
    md += `**Thời gian thực hiện:** ${new Date().toLocaleString()}\n\n`;
    md += `| STT | Tên Tác vụ | Trạng thái | Điểm (Thang 10) | Thời gian | Phán quyết |\n`;
    md += `| :---: | :--- | :---: | :---: | :---: | :---: |\n`;
    results.forEach(r => {
        const status = r.success ? 'Thành công ✅' : 'Thất bại ❌';
        md += `| ${r.id} | ${r.title} | ${status} | **${r.score10} / 10** | ${r.elapsed}s | ${r.verdict} |\n`;
    });
    fs.writeFileSync(reportPath, md, 'utf8');
    console.log(`\n💾 Đã lưu bảng điểm tổng hợp tại: ${reportPath}`);
}

runAll().catch(e => console.error("Lỗi Fatal:", e));

