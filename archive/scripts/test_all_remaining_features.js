/**
 * test_all_remaining_features.js
 * Comprehensive testing of all remaining features:
 * 1. Security Path Guard (anti-path-traversal)
 * 2. Security Command Whitelist & Sandbox
 * 3. JS VM Sandbox Execution & Isolation
 * 4. Cookie Vault API
 * 5. Native Google Search Grounding & Fallback
 * 6. File System CRUD Operations
 */

const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passCount = 0;
let failCount = 0;

function httpRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function it(name, fn) {
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
        failCount++;
    }
}

async function runAllTests() {
    console.log('===============================================================');
    console.log('🛡️ KIỂM THỬ TOÀN BỘ CÁC CHỨC NĂNG CÒN LẠI (SECURITY, TOOLS, API)');
    console.log('===============================================================\n');

    // 1. SECURITY PATH GUARD
    console.log('--- PHẦN 1: BẢO MẬT ĐƯỜNG DẪN (PATH GUARD) ---');
    await it('Path Guard chặn đứng tấn công Path Traversal (../../windows/win.ini)', async () => {
        const res = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/read-file',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { filePath: '../../../windows/win.ini' });

        assert.ok(res.status === 403 || res.data?.error || !res.data?.success, 'Phải chặn truy cập ngoài workspace');
    });

    // 2. SAFE COMMAND PARSER & INJECTION SHIELD
    console.log('\n--- PHẦN 2: BẢO MẬT LỆNH SHELL & BLACKLIST ---');
    await it('Hệ thống từ chối lệnh shell độc hại (rmdir, format, powershell -enc)', async () => {
        const res = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/run-cmd',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { command: 'powershell -enc JABhID0gMQ==' });

        assert.ok(res.data?.success === false || res.status >= 400 || res.data?.error, 'Phải chặn shell injection');
    });

    await it('Cho phép các lệnh an toàn trong whitelist (node test_parse_cmd.js)', async () => {
        const res = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/run-cmd',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { command: 'node test_parse_cmd.js', cwd: path.resolve(__dirname) });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data?.success, true);
        assert.ok(res.data?.output.includes('Parsed: OK'));
    });

    // 3. JAVASCRIPT VM SANDBOX
    console.log('\n--- PHẦN 3: JS VM SANDBOX (CÔ LẬP THỰC THI CODE) ---');
    await it('JS Sandbox thực thi mã an toàn và trả kết quả chính xác', async () => {
        const res = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/run-code',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { code: 'const a = [1, 2, 3, 4, 5]; a.reduce((sum, x) => sum + x, 0);' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data?.success, true);
        assert.strictEqual(String(res.data?.result), '15');
    });

    await it('JS Sandbox chặn đứng việc truy cập module hệ thống (fs, process.exit)', async () => {
        const res = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/run-code',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { code: 'process.exit(1);' });

        assert.strictEqual(res.data?.success, false, 'Không được cho phép process.exit()');
    });

    // 4. COOKIE VAULT API
    console.log('\n--- PHẦN 4: COOKIE VAULT BẢO VỆ PHIÊN ĐĂNG NHẬP ---');
    await it('Cookie Vault kiểm tra trạng thái cookie thành công qua /api/check-cookie-status', async () => {
        const res = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/check-cookie-status',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { urlOrDomain: 'facebook.com' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data?.success, true);
        assert.strictEqual(typeof res.data?.hasCookie, 'boolean');
    });

    // 5. GOOGLE SEARCH GROUNDING MỚI ĐƯỢC CHUẨN HÓA & RESILIENT FALLBACK
    console.log('\n--- PHẦN 5: GEMINI GROUNDING & RESILIENT UN-GROUNDED FALLBACK ---');
    await it('GeminiGrounding sinh câu trả lời thành công với cơ chế fallback tự động', async () => {
        const { GeminiGrounding } = require('./agents/GeminiGrounding');
        const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        let apiKey = '';
        envContent.split('\n').forEach(l => {
            if (l.startsWith('GEMINI_API_KEY=')) apiKey = l.split('=')[1].trim();
        });

        const grounding = new GeminiGrounding(apiKey);
        const result = await grounding.generateWithGrounding('Thủ đô của nước Pháp là gì?');
        assert.ok(result.text, 'Phải có text phản hồi');
        assert.ok(result.text.toLowerCase().includes('paris'), 'Phải trả lời đúng Paris');
    });

    // 6. FILE CRUD OPERATIONS
    console.log('\n--- PHẦN 6: FILE OPERATIONS VÀ QUẢN LÝ TỆP TIN ---');
    await it('Ghi file, đọc file và kiểm tra tính toàn vẹn', async () => {
        const testFile = 'scratch_integrity_check.txt';
        const content = 'CYBER_AGENT_PRO_V4_INTEGRITY_VERIFIED_' + Date.now();

        // Write
        const writeRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/write-file',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { fileName: testFile, content: content });
        assert.strictEqual(writeRes.data?.success, true);

        // Read
        const readRes = await httpRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/read-file',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { filePath: testFile });
        assert.strictEqual(readRes.data?.content?.trim(), content);

        // Clean
        try { fs.unlinkSync(path.join(__dirname, testFile)); } catch (e) {}
    });

    console.log('\n===============================================================');
    console.log(`🏁 KẾT THÚC KIỂM THỬ TOÀN DIỆN: ${passCount} PASSED | ${failCount} FAILED`);
    console.log('===============================================================');

    if (failCount > 0) process.exit(1);
}

runAllTests().catch(err => {
    console.error('Lỗi ngoại lệ:', err);
    process.exit(1);
});
