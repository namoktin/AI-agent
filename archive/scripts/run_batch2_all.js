const http = require('http');

const tasks = [
    {
        id: 1,
        title: "Điểm tin báo sáng sớm & Tóm tắt kinh tế/công nghệ",
        prompt: "Hãy đóng vai một trợ lý phân tích thông tin cao cấp, quét và thu thập các tin tức kinh tế, tài chính và công nghệ mới nhất từ các nguồn báo chí uy tín (VnExpress, CafeF, hoặc TechCrunch). Lọc ra 5 tin tức đáng chú ý nhất, với mỗi tin hãy tóm tắt ngắn gọn 3 luận điểm cốt lõi, nêu rõ tác động của tin tức đó đến thị trường kinh doanh tại Việt Nam, và đưa ra 1 gợi ý hành động cụ thể cho người làm kinh doanh. Xuất toàn bộ bản tin sáng sớm này thành file báo cáo chuyên nghiệp C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\diem_tin_sang_som.md."
    },
    {
        id: 2,
        title: "Nghiên cứu Khoa học NCKH Dinh dưỡng & Năng lượng não bộ",
        prompt: "Hãy nghiên cứu tài liệu khoa học chính thống trên PubMed/Europe PMC về chủ đề: 'Tối ưu hóa hiệu suất não bộ và duy trì năng lượng làm việc đỉnh cao suốt ngày dài bằng dinh dưỡng và nhịp sinh học'. Trích xuất 3 công trình nghiên cứu khoa học có bình duyệt uy tín nhất, bóc tách đầy đủ: Mã định danh DOI/PMID, tên tác giả chính, kích thước mẫu thử nghiệm (N), phương pháp thực hiện và kết luận then chốt có số liệu định lượng (p-value). Tổng hợp thành báo cáo khoa học ứng dụng lưu tại file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\nghien_cuu_khoa_hoc_nang_luong_nao_bo.md."
    },
    {
        id: 3,
        title: "Phân tích mô hình kinh doanh Trung Quốc để Copy về Việt Nam",
        prompt: "Hãy nghiên cứu và phân tích một mô hình kinh doanh bán lẻ / e-commerce / dịch vụ đang bùng nổ cực kỳ thành công tại Trung Quốc (trên nền tảng Douyin, Xiaohongshu hoặc Taobao). Phân tích chuyên sâu 4 khía cạnh: (1) Mô hình hoạt động và cách họ kéo lượng truy cập miễn phí khổng lồ; (2) Cách tối ưu chi phí vận hành và chuỗi cung ứng; (3) Điểm khác biệt giúp họ đánh bại đối thủ truyền thống; (4) Bản kế hoạch hành động từng bước để sao chép (clone) và điều chỉnh mô hình này áp dụng thành công tại thị trường Việt Nam với số vốn nhỏ. Lưu bản phân tích chiến lược này thành file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\phan_tich_mo_hinh_kinh_doanh_trung_quoc.md."
    },
    {
        id: 4,
        title: "Săn sản phẩm Hot Trend & Tính toán lợi nhuận nhập hàng Trung Quốc",
        prompt: "Hãy tìm kiếm và đề xuất 5 mặt hàng công nghệ tiện ích / gia dụng thông minh đang là 'Hot Trend' bán chạy rầm rộ bên thị trường Trung Quốc (hàng 1688 / Taobao / Douyin Trend). Với từng sản phẩm, hãy lập bảng phân tích chi tiết: Tên sản phẩm, Công năng độc lạ giải quyết nỗi đau của khách hàng, Ước tính giá nhập sỉ từ Trung Quốc (quy đổi VNĐ), Giá bán lẻ đề xuất tại thị trường Việt Nam, Chi phí marketing dự tính, và Tỷ suất lợi nhuận ròng (ROI %). Xuất dữ liệu bảng tính ra file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bang_tinh_san_pham_hot_trend.csv và viết bài phân tích tiềm năng thị trường ra file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\ke_hoach_kinh_doanh_san_pham.md."
    },
    {
        id: 5,
        title: "3 Hướng đi tương lai kiếm tiền nhiều nhất (2026 - 2030)",
        prompt: "Hãy phân tích xu hướng kinh tế, công nghệ và thị trường lao động từ nay đến năm 2030, xác định 3 ngách kinh doanh và kiếm tiền tiềm năng nhất có thể tận dụng đòn bẩy AI và tự động hóa (Ví dụ: AI Agency tự động hóa quy trình cho doanh nghiệp vừa và nhỏ, Kênh nội dung tự động đa nền tảng, Micro-SaaS dịch vụ ngách). Với mỗi hướng đi, hãy vạch rõ: Số vốn tối thiểu cần có, Rào cản cạnh tranh, Doanh thu mục tiêu dự phóng sau 6 tháng, và Bản lộ trình hành động chi tiết trong 14 ngày đầu tiên để bắt đầu triển khai ngay. Lưu toàn bộ tài liệu chiến lược làm giàu này vào file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\chien_luoc_kiem_tien_tuong_lai.md."
    }
];

function executeTask(item) {
    return new Promise((resolve) => {
        console.log(`\n===============================================================`);
        console.log(`🚀 [BẮT ĐẦU TASK ${item.id}/5]: ${item.title}`);
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
                    console.log(`- Thành công:`, data.success);
                    console.log(`- Điểm chất lượng:`, data.qualityScore || 'N/A');
                    console.log(`- Phán quyết Critic:`, data.critique?.verdict || 'N/A');
                    console.log(`- Báo cáo kết quả của AI:`);
                    const report = typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2);
                    console.log(report.slice(0, 1500));
                    resolve({ id: item.id, title: item.title, elapsed, success: data.success, score: data.qualityScore, verdict: data.critique?.verdict, data });
                } catch (e) {
                    console.error('Lỗi phân tích JSON:', e.message, body.slice(0, 300));
                    resolve({ id: item.id, title: item.title, elapsed, success: false, error: e.message });
                }
            });
        });

        req.on('error', (e) => {
            console.error(`Lỗi kết nối Task ${item.id}:`, e.message);
            resolve({ id: item.id, title: item.title, elapsed: 0, success: false, error: e.message });
        });

        req.write(postData);
        req.end();
    });
}

async function runAll() {
    console.log(`🔥 BẮT ĐẦU CHẠY BATCH 5 TÁC VỤ CHIẾN LƯỢC MỚI`);
    console.log(`⏰ Thời gian khởi động: ${new Date().toLocaleString()}`);
    const results = [];

    for (const item of tasks) {
        const res = await executeTask(item);
        results.push(res);
        // Nghỉ 4 giây giữa các task để reset rate limit
        console.log(`⏳ Nghỉ 4 giây trước khi chuyển task tiếp theo...`);
        await new Promise(r => setTimeout(r, 4000));
    }

    console.log(`\n===============================================================`);
    console.log(`🎉 BẢNG TỔNG HỢP KẾT QUẢ CẢ 5 TÁC VỤ MỚI`);
    console.log(`===============================================================`);
    results.forEach(r => {
        console.log(`- Task ${r.id} [${r.title}]: ${r.success ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI'} (${r.elapsed}s) | Điểm: ${r.score || 'N/A'} | Verdict: ${r.verdict || 'N/A'}`);
    });
}

runAll();

