const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const workDir = process.env.WORK_DIR || process.cwd();
const outputFile = path.join(workDir, 'link_health_report.csv');

console.log('🚀 [TASK 5] Bắt đầu kiểm tra sức khỏe hệ thống liên kết mạng (Network Health Audit)...');

const endpoints = [
    'https://www.google.com',
    'https://www.github.com',
    'https://www.microsoft.com',
    'https://www.cloudflare.com',
    'https://www.wikipedia.org',
    'https://api.github.com',
    'https://news.ycombinator.com',
    'https://dev.to',
    'https://httpbin.org/status/200',
    'https://httpbin.org/status/404'
];

function checkUrl(url) {
    return new Promise(resolve => {
        const start = Date.now();
        const client = url.startsWith('https:') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'HealthChecker/1.0' }, timeout: 4000 }, res => {
            const latency = Date.now() - start;
            res.resume();
            resolve({ url, status: res.statusCode, latencyMs: latency, ok: res.statusCode >= 200 && res.statusCode < 400 });
        });
        req.on('error', err => {
            resolve({ url, status: 0, latencyMs: Date.now() - start, ok: false, error: err.message });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ url, status: 408, latencyMs: 4000, ok: false, error: 'Timeout' });
        });
    });
}

async function run() {
    const total = endpoints.length;
    const results = [];
    const rows = ['"URL","HTTP Status","Độ Trễ (ms)","Đánh Giá","Lỗi Nếu Có"'];

    for (let i = 0; i < total; i++) {
        const url = endpoints[i];
        const res = await checkUrl(url);
        results.push(res);
        rows.push(`"${res.url}",${res.status},${res.latencyMs},"${res.ok ? 'HEALTHY' : 'DEGRADED'}","${res.error || 'N/A'}"`);
        const percent = Math.round(((i + 1) / total) * 100);
        console.log(`[PROGRESS] ${i + 1}/${total} (${percent}%): Đã kiểm tra ${url} [${res.status} - ${res.latencyMs}ms]`);
    }

    fs.writeFileSync(outputFile, '\uFEFF' + rows.join('\n'), 'utf8');
    console.log(`✅ [TASK 5] Đã xuất báo cáo kiểm tra liên kết vào ${outputFile}`);
}

run().catch(err => {
    console.error('❌ [TASK 5] Lỗi:', err);
    process.exit(1);
});
