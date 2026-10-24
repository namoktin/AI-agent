// Live Test: Yêu cầu AI của bạn tự động thực thi lấy thông tin người dùng và tải 5 video Reels gần nhất
const http = require('http');

(async () => {
    console.log('🚀 [LIVE TEST 2] Bắt đầu giao việc cho AI của bạn...');
    const task = "Từ video reel https://www.facebook.com/reel/1339248944820021, hãy lấy thông tin dữ liệu người dùng (tên uploader, uploader_id) và tải 5 video reels gần nhất của tác giả này về thư mục C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\reel_test_run2. Sử dụng cookie từ Kho CookieVault (C:\\Users\\Nam\\Desktop\\AI agent\\memory\\cookies\\facebook.com.txt) và yt-dlp để tải video về máy.";
    
    console.log('Nhiệm vụ:', task);
    console.log('Đang chờ hệ thống AI đa tác nhân điều phối và thực thi...\n');

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
        timeout: 900000 // 15 phút
    }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            try {
                const data = JSON.parse(body);
                console.log(`\n================ KẾT QUẢ TỰ HÀNH CỦA AI (${elapsed}s) ================`);
                console.log('Trạng thái:', data.success ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI');
                console.log('Điểm chất lượng:', data.qualityScore);
                console.log('Phán quyết Critic:', data.critique?.verdict || 'N/A');
                console.log('\n--- NỘI DUNG BÁO CÁO CỦA AI ---');
                console.log(typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2));

                if (data.executionLog && Array.isArray(data.executionLog)) {
                    console.log('\n--- CÁC BƯỚC ĐIỀU PHỐI ĐÃ GHI NHẬN (LOG) ---');
                    data.executionLog.forEach(l => {
                        console.log(`- ${l.message}`);
                    });
                }
            } catch (e) {
                console.error('Parse error:', e.message, body.slice(0, 300));
            }
        });
    });

    req.on('error', (err) => {
        console.error('Request error:', err.message);
    });

    req.write(postData);
    req.end();
})();
