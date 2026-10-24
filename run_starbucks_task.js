const http = require('http');
const fs = require('fs');
const path = require('path');

const prompt = "Hãy vào web https://www.starbucks.com/ bấm GIFT CARDS sau đó tìm more ways to gift lấy chữ sau chữ amazon. Lưu báo cáo chi tiết kèm từ ngữ/cụm từ lấy được, ngữ cảnh câu gốc và đường dẫn URL vào file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\starbucks_gift_cards.md.";

console.log('🚀 Bắt đầu thực thi nhiệm vụ Starbucks qua AI Multi-Agent Orchestrator (/api/v2/execute)...');
const startTime = Date.now();

const postData = JSON.stringify({
    task: prompt,
    useCache: false
});

const req = http.request('http://localhost:3000/api/v2/execute', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 600000 // 10 phút
}, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n🏁 [HOÀN THÀNH STARBUCKS TASK SAU ${elapsed} GIÂY]`);
        try {
            const data = JSON.parse(body);
            const rawScore = data.qualityScore || (data.critique?.overallScore) || (data.success ? 90 : 0);
            const score10 = (rawScore / 10).toFixed(1);

            console.log(`- Trạng thái:`, data.success ? 'THÀNH CÔNG' : 'CÓ VẤN ĐỀ');
            console.log(`- Điểm chất lượng:`, `${score10}/10 (Gốc: ${rawScore}/100)`);
            console.log(`- Phán quyết Critic:`, data.critique?.verdict || 'N/A');
            console.log(`- Critic Feedback:`, data.critique?.feedback ? data.critique.feedback.slice(0, 300) : 'N/A');

            fs.writeFileSync('C:/Users/Nam/Desktop/AI agent/scratch_starbucks_result.json', JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.error('Lỗi phân tích kết quả:', e.message);
            console.log('Raw output preview:', body.slice(0, 500));
        }
    });
});

req.on('error', (e) => {
    console.error('Lỗi kết nối:', e.message);
});

req.write(postData);
req.end();
