const http = require('http');

const task = "Hãy thực hiện kiểm tra an ninh và kiểm định chất lượng mã nguồn (Code Security Audit): Đọc các file trong thư mục utils/ và middleware/ của dự án AI agent, phân tích và tìm các lỗ hổng bảo mật tiềm ẩn (như Path Traversal, Shell Injection, Memory leak, Race condition). Viết báo cáo chi tiết kèm phân tích từng file và đề xuất phương án vá lỗi lưu thành file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\audit_bao_mat_codebase.md.";

console.log('🚀 [TASK 4/5] Bắt đầu giao nhiệm vụ: Kiểm tra an ninh và kiểm định mã nguồn utils/ & middleware/...');
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
        console.log(`\n================ KẾT QUẢ TASK 4 (${elapsed}s) ================`);
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
