const http = require('http');

const task = "Hãy viết một script Python tự động tạo bộ dữ liệu giả lập doanh thu 12 tháng qua của 4 dòng sản phẩm công nghệ. Thực hiện phân tích thống kê (tăng trưởng, trung bình, độ lệch chuẩn), vẽ biểu đồ xu hướng đường và cột lưu thành file ảnh C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bieu_do_doanh_thu.png (độ phân giải cao), xuất kèm file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bao_cao_doanh_thu.csv và kiểm tra xác nhận các file đã xuất hiện trên máy.";

console.log('🚀 [TASK 3/5] Bắt đầu giao nhiệm vụ: Lập trình Python phân tích dữ liệu & vẽ biểu đồ...');
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
        console.log(`\n================ KẾT QUẢ TASK 3 (${elapsed}s) ================`);
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
