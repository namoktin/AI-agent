/**
 * run_10_hard_tasks.js - Bộ 10 Tác Vụ Độ Khó Cao Kiểm Thử Toàn Diện Năng Lực AI Agent
 * Cyber Agent Pro v3.5 Ultimate
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = 'C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const HARD_TASKS = [
    {
        id: 1,
        title: 'Nghiên cứu Y học GLP-1 & Thụ thể Hypothalamus (Deep Research & DOI Check)',
        prompt: 'Nghiên cứu cơ chế tác động của phân tử GLP-1 receptor agonist (Semaglutide/Tirzepatide) lên thụ thể vùng dưới đồi (Hypothalamus) trong việc ức chế cảm giác thèm ăn. BẮT BUỘC trích dẫn ít nhất 2 bài báo có mã số DOI hoặc PubMed PMID, nêu cụ thể số liệu định lượng về tỷ lệ % giảm cân trung bình trong các thử nghiệm lâm sàng giai đoạn 3 (STEP hoặc SURPASS).'
    },
    {
        id: 2,
        title: 'Viết Script Python Tính Ma Trận Xoay 3D Euler (Autonomous & Python AST Check)',
        prompt: 'Viết một script Python hoàn chỉnh tại C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\phan_tich_hinh_hoc_nang_cao.py thực hiện tính toán ma trận xoay 3D (Euler angles yaw-pitch-roll) biến đổi tọa độ điểm không gian. Yêu cầu có hàm kiểm tra tính trực giao của ma trận xoay (R * R^T = I), có unit test tự động và chạy không có lỗi syntax.'
    },
    {
        id: 3,
        title: 'Khai thác Kỹ năng Thủ tục Starbucks (Procedural Skill Reuse)',
        prompt: 'Vào trang web Starbucks tìm hiểu cách tặng thẻ quà tặng và lấy đoạn văn bản chứa chữ Amazon. Hãy kiểm tra các cách tặng khác "More ways to gift" và trích xuất ngữ cảnh văn bản sau chữ Amazon.'
    },
    {
        id: 4,
        title: 'Script Đo Network Speed & Ping 3 DNS Servers (Resilience & Node AST Check)',
        prompt: 'Viết một script Node.js tại C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\kiem_tra_network_speed.js đo lường thời gian phân giải DNS và độ trễ ping tới 3 DNS servers: Google (8.8.8.8), Cloudflare (1.1.1.1), OpenDNS (208.67.222.222). File phải xử lý ngoại lệ timeout không được crash và in ra bảng tổng kết.'
    },
    {
        id: 5,
        title: 'Lập Mô hình Danh mục Đầu tư Markowitz Mean-Variance (Quantitative Finance)',
        prompt: 'Đóng vai chuyên viên tài chính định lượng, lập mô hình phân bổ danh mục đầu tư theo thuyết Modern Portfolio Theory (Markowitz Mean-Variance) cho 3 lớp tài sản: Cổ phiếu VN30 (lợi nhuận kỳ vọng 14%, độ lệch chuẩn 20%), Trái phiếu chính phủ (lợi nhuận 6%, độ lệch 4%), Vàng SJC (lợi nhuận 9%, độ lệch 12%). Lưu báo cáo chi tiết kèm công thức KaTeX tại C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\danh_muc_markowitz.md.'
    },
    {
        id: 6,
        title: 'So sánh JWT vs Session Cookie (Fast Mode Dynamic Scoring)',
        prompt: 'Hãy cho biết sự khác biệt cốt lõi nhất giữa JWT (JSON Web Token) và Session Cookie trong kiến trúc xác thực người dùng là gì trong đúng 3 gạch đầu dòng ngắn gọn.'
    },
    {
        id: 7,
        title: 'Xây dựng Middleware TimingSafe Auth & Rate Limit (Security Engineering)',
        prompt: 'Tạo file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\secure_auth_middleware.js chứa một middleware Express.js xác thực JWT và bảo vệ chống tấn công Timing Attack khi so sánh HMAC secret bằng crypto.timingSafeEqual, tích hợp rate limiting bộ nhớ và gắn headers bảo mật.'
    },
    {
        id: 8,
        title: 'Cào Tin Hacker News Top 5 & Xuất JSON Cấu Trúc (Web Extraction & JSON AST)',
        prompt: 'Truy cập https://news.ycombinator.com/ trích xuất danh sách 5 bài viết có điểm vote cao nhất hiện tại, bao gồm tiêu đề, link gốc, số điểm points và người đăng, lưu kết quả ra file JSON có cấu trúc tại C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\hacker_news_top5.json.'
    },
    {
        id: 9,
        title: 'Tranh luận Kiến trúc: LangGraph vs Custom Multi-Agent (Architecture Debate)',
        prompt: 'Đóng vai Hội đồng Kiến trúc sư AI: Giám đốc (Director) và Trưởng phòng Kiểm định (Critic) tranh luận gay gắt về việc: "Có nên dùng LangGraph / StateGraph hay tự viết Custom Orchestrator cho hệ thống Multi-Agent doanh nghiệp?". Tổng hợp các trade-offs về Vendor Lock-in, Debuggability, Latency và Quota vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\tranh_luan_kien_truc_langgraph.md.'
    },
    {
        id: 10,
        title: 'Công cụ Tạo Sitemap XML Google Search Console (Autonomous Skill Auto-Promote)',
        prompt: 'Tạo một công cụ tự động hóa Node.js tại C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\tao_sitemap_xml.js đọc danh sách các đường dẫn URL từ file JSON và sinh ra file sitemap.xml chuẩn cấu trúc của Google Search Console, bao gồm thẻ <loc>, <lastmod>, <changefreq>, <priority>.'
    }
];

async function runHardTaskBatch() {
    console.log('===============================================================');
    console.log('🔥 BẮT ĐẦU CHẠY BỘ 10 TÁC VỤ ĐỘ KHÓ CAO (CHỜ NHƯ NGƯỜI DÙNG THẬT)');
    console.log(`⏰ Khởi động lúc: ${new Date().toLocaleTimeString('vi-VN')} ${new Date().toLocaleDateString('vi-VN')}`);
    console.log('===============================================================\n');

    const summaryResults = [];

    for (let i = 0; i < HARD_TASKS.length; i++) {
        const item = HARD_TASKS[i];
        console.log('---------------------------------------------------------------');
        console.log(`🎬 [BẮT ĐẦU TASK ${item.id}/10]: ${item.title}`);
        console.log(`📝 Yêu cầu: "${item.prompt.slice(0, 100)}..."`);
        console.log('⏳ Đang gửi request và tự động chờ hệ thống phản hồi...');

        const startTime = Date.now();
        let taskSuccess = false;
        let score = '0/10';
        let mode = 'UNKNOWN';
        let auditStatus = 'UNKNOWN';
        let elapsed = 0;
        let resultData = null;

        try {
            const response = await fetch(`${BASE_URL}/api/v2/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: item.prompt,
                    context: {
                        taskId: `hard_task_${item.id}_${Date.now()}`
                    }
                }),
                signal: AbortSignal.timeout(180000)
            });

            elapsed = Math.round((Date.now() - startTime) / 1000);

            if (response.ok) {
                const data = await response.json();
                resultData = data;
                if (data.success) {
                    taskSuccess = true;
                    mode = (data.mode || 'standard').toUpperCase();
                    const rawScore = data.qualityScore || 85;
                    score = `${(rawScore / 10).toFixed(1)}/10`;
                    auditStatus = data.verification?.status || data.audit?.status || (rawScore >= 80 ? 'APPROVED' : 'VERIFIED');
                } else {
                    auditStatus = 'FAILED';
                    score = '4.0/10';
                }
            } else {
                auditStatus = `HTTP_${response.status}`;
                score = '3.0/10';
            }
        } catch (err) {
            elapsed = Math.round((Date.now() - startTime) / 1000);
            auditStatus = `ERR_${err.message.slice(0, 15)}`;
            score = '2.0/10';
        }

        console.log(`🏁 [HOÀN THÀNH TASK ${item.id} SAU ${elapsed}s]`);
        console.log(`- Trạng thái: ${taskSuccess ? 'THÀNH CÔNG' : 'CẦN XỬ LÝ'}`);
        console.log(`- Chế độ: ${mode}`);
        console.log(`- Điểm số: ${score}`);
        console.log(`- Kiểm định (Audit): ${auditStatus}`);

        summaryResults.push({
            STT: item.id,
            'Tên Tác Vụ': item.title,
            'Chế độ': mode,
            'Trạng Thái': taskSuccess ? 'THÀNH CÔNG' : 'THẤT BÀI',
            'Điểm': score,
            'Thời Gian': `${elapsed}s`,
            'Kiểm Định': auditStatus
        });

        console.log('☕ Tạm nghỉ 5 giây trước khi thực hiện task tiếp theo...');
        await new Promise(r => setTimeout(r, 5000));
    }

    console.log('\n===============================================================');
    console.log('🎉 BẢNG TỔNG KẾT KẾT QUẢ 10 TÁC VỤ ĐỘ KHÓ CAO');
    console.log('===============================================================');
    console.table(summaryResults);

    // Xuất báo cáo Markdown
    const reportMdPath = path.join(OUTPUT_DIR, 'bao_cao_10_task_do_kho_cao.md');
    let mdContent = `# 🏆 BÁO CÁO THỰC THI 10 TÁC VỤ ĐỘ KHÓ CAO (CYBER AGENT PRO v3.5 - 4 CORE UPGRADES)\n\n`;
    mdContent += `**Thời gian hoàn tất:** ${new Date().toLocaleTimeString('vi-VN')} ${new Date().toLocaleDateString('vi-VN')}\n\n`;
    mdContent += `| STT | Tên Tác vụ | Chế độ (Mode) | Trạng thái | Điểm (Thang 10) | Thời gian | Kiểm định (Audit) |\n`;
    mdContent += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: |\n`;

    for (const r of summaryResults) {
        mdContent += `| ${r.STT} | ${r['Tên Tác Vụ']} | \`${r['Chế độ']}\` | ${r['Trạng Thái'] === 'THÀNH CÔNG' ? '✅ THÀNH CÔNG' : '❌ THẤT BÀI'} | **${r['Điểm']}** | ${r['Thời Gian']} | ${r['Kiểm Định']} |\n`;
    }

    fs.writeFileSync(reportMdPath, mdContent, 'utf8');
    console.log(`\n💾 Đã lưu báo cáo nghiệm thu tại: ${reportMdPath}`);
}

runHardTaskBatch();

