const http = require('http');

const task = "Hãy nghiên cứu tài liệu y khoa chính thống trên PubMed/Europe PMC về chủ đề: 'Tác động của việc ngắt quãng giấc ngủ (Sleep fragmentation) đến chức năng nhận thức và suy giảm trí nhớ'. Trích xuất 3 nghiên cứu uy tín có kèm mã DOI, cỡ mẫu thử nghiệm (N), kết luận then chốt và ghi nhận vào Sổ cái tuyên bố khoa học (Claim Ledger) trong file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\bao_cao_y_khoa_giac_ngu.md.";

console.log('🚀 [TASK 2/5] Bắt đầu giao nhiệm vụ: Nghiên cứu y khoa & Sổ cái tuyên bố khoa học...');
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
        console.log(`\n================ KẾT QUẢ TASK 2 (${elapsed}s) ================`);
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
