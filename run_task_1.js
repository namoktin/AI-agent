const http = require('http');

const task = "Hãy dùng trình duyệt web tìm và cào 5 tin tuyển dụng việc làm Remote cho vị trí 'Python / AI Developer' mới nhất. Trích xuất: Tên công việc, Công ty, Mức lương/Ngân sách, Kỹ năng yêu cầu, và Link bài viết gốc 100% có thật. Lưu kết quả thành bảng biểu chuẩn trong file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\danh_sach_viec_lam_remote.csv và tạo 1 file báo cáo Markdown tổng hợp C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bao_cao_viec_lam_remote.md.";

console.log('🚀 [TASK 1/5] Bắt đầu giao nhiệm vụ: Cào dữ liệu việc làm Remote Python/AI...');
const startTime = Date.now();

const postData = JSON.stringify({
    task: task,
    useCache: false
});

const req = http.request('http://localhost:3000/api/v2/execute', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 900000
}, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n================ KẾT QUẢ TASK 1 (${elapsed}s) ================`);
        try {
            const data = JSON.parse(body);
            console.log('Success:', data.success);
            console.log('Quality Score:', data.qualityScore);
            console.log('Critic Verdict:', data.critique?.verdict || 'N/A');
            console.log('\n--- BÁO CÁO CỦA AI ---');
            console.log(typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2));
        } catch (e) {
            console.error('Parse Error:', e.message, body.slice(0, 300));
        }
    });
});

req.on('error', (e) => {
    console.error('Request Error:', e.message);
});

req.write(postData);
req.end();
