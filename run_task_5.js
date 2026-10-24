const http = require('http');

const task = "Hãy tìm một video ngắn về công nghệ AI trên YouTube (thời lượng ngắn dưới 5 phút, ví dụ các video demo giới thiệu AI ngắn), tự động tải video đó về thư mục C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\youtube_test bằng yt-dlp, đồng thời trích xuất thông tin metadata (tiêu đề, tên kênh/author, thời lượng, định dạng) lưu thành file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\youtube_test\\thong_tin_video.json và báo cáo C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\youtube_test\\bao_cao_youtube.md. Kiểm tra xác nhận file video thực tế đã tải về máy và dung lượng > 0.";

console.log('🚀 [TASK 5/5] Bắt đầu giao nhiệm vụ: Tải video YouTube công nghệ AI và xuất báo cáo metadata...');
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
        console.log(`\n================ KẾT QUẢ TASK 5 (${elapsed}s) ================`);
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
