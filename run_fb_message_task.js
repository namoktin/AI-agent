const http = require('http');

const taskPrompt = `Nhiệm vụ: Sử dụng cookie Facebook đã để sẵn tại file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\cookies.txt (hoặc C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\facebook_cookies.txt), hãy viết một script tự động hóa bằng Python Playwright hoặc Node.js Puppeteer để nạp các cookie này, truy cập vào Facebook Messenger (https://www.facebook.com/messages/t/), chọn người đầu tiên trong danh sách tin nhắn và gửi nội dung: 'hello'. Chụp ảnh màn hình làm bằng chứng lưu tại C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\fb_sent_hello.png và xuất báo cáo kết quả vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bao_cao_gui_tin_nhan_fb.md.`;

console.log("🚀 [BẮT ĐẦU GIAO VIỆC CHO AI]: Vào Facebook gửi tin nhắn 'hello' cho người đầu tiên...");

const postData = JSON.stringify({
    task: taskPrompt,
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
        try {
            const data = JSON.parse(body);
            console.log("\n================ KẾT QUẢ THỰC THI ================");
            console.log("Trạng thái:", data.success ? "THÀNH CÔNG" : "THẤT BẠI");
            console.log("Điểm chất lượng:", data.qualityScore || 'N/A');
            console.log("Phán quyết Critic:", data.critique?.verdict || 'N/A');
            console.log("Chi tiết:", typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2));
        } catch (e) {
            console.error("Lỗi parse JSON:", e.message, body.slice(0, 500));
        }
    });
});

req.on('error', (e) => {
    console.error("Lỗi kết nối:", e.message);
});

req.write(postData);
req.end();
