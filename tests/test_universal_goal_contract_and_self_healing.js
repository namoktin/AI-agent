/**
 * test_universal_goal_contract_and_self_healing.js
 * Cyber Agent Pro v6.0 Enterprise Test Suite
 * 
 * Kiểm thử toàn diện 5 năng lực tự hành:
 * 1. Universal Goal Contract: Bóc tách chính xác N, domain, extensions cho mọi bài toán.
 * 2. Anti-Mock Detection: Bắt quả tang mọi hành vi gian lận (echo processing, [x]*N, placeholder).
 * 3. Physical Audit Fulfillment: Đối chiếu số lượng thực tế trên đĩa cứng.
 * 4. Dynamic Environment Discovery: Quét đồ nghề trên máy và tự tìm thư viện thay thế khi có lỗi.
 * 5. IndependentVerifier Closed-Loop Rejection: Đánh dấu DEFICIT_DETECTED khi chưa đủ số lượng thật.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const UniversalGoalContract = require('../utils/UniversalGoalContract');
const DynamicEnvironmentDiscovery = require('../utils/DynamicEnvironmentDiscovery');
const { IndependentVerifier } = require('../agents/IndependentVerifier');

async function runTests() {
    console.log('===============================================================');
    console.log('🧪 KIỂM THỬ NÂNG CẤP KIẾN TRÚC: UNIVERSAL GOAL CONTRACT & SELF-HEALING (v6.0)');
    console.log('===============================================================\n');

    const contractEngine = new UniversalGoalContract(path.resolve(__dirname, '..'));
    const discovery = new DynamicEnvironmentDiscovery();
    const verifier = new IndependentVerifier(path.resolve(__dirname, '..'));

    // --- TEST 1: UNIVERSAL GOAL CONTRACT EXTRACTION ---
    console.log('--- PHẦN 1: Bóc tách Hợp đồng Mục tiêu Tổng quát ---');
    {
        const c1 = contractEngine.extractContract('Hãy tự tải 5 video short bất kỳ có tiếng anh dưới 60s trên youtube');
        assert.strictEqual(c1.requestedCount, 5, 'Phải bóc tách được N = 5 video');
        assert.strictEqual(c1.domain, 'media_video', 'Domain phải là media_video');
        assert.ok(c1.targetExtensions.includes('.mp4'), 'Phải bao gồm đuôi .mp4');

        const c2 = contractEngine.extractContract('Cào 20 bài báo công nghệ từ vnexpress và xuất ra file csv doanh số');
        assert.strictEqual(c2.requestedCount, 20, 'Phải bóc tách được N = 20 bài');
        assert.strictEqual(c2.domain, 'data_spreadsheet', 'Domain phải là data_spreadsheet');
        assert.ok(c2.targetExtensions.includes('.csv'), 'Phải bao gồm đuôi .csv');

        const c3 = contractEngine.extractContract('Tạo 10 bản ghi khách hàng và lưu trữ vào cơ sở dữ liệu sqlite');
        assert.strictEqual(c3.requestedCount, 10, 'Phải bóc tách được N = 10 bản ghi');
        assert.strictEqual(c3.domain, 'data_database', 'Domain phải là data_database');
        assert.ok(c3.targetExtensions.includes('.sqlite'), 'Phải bao gồm đuôi .sqlite');

        console.log('✅ [TEST 1] PASS: Bóc tách chính xác N, domain, extensions cho mọi bài toán đa dạng');
    }

    // --- TEST 2: ANTI-MOCK PATTERN DETECTION ---
    console.log('\n--- PHẦN 2: Bắt quả tang mã nguồn giả lập (Anti-Mock Patterns) ---');
    {
        const fakeCode1 = `
files = ["short_7jH-ayTNxvU.mp4.webm"] * 5
for f in files:
    subprocess.run(["echo", "Processing audio for", f])
print("Hoàn thành xử lý 5 video.")
`;
        const issues1 = contractEngine.detectMockAntiPatterns(fakeCode1);
        assert.ok(issues1.length >= 2, 'Phải phát hiện ít nhất 2 lỗi (nhân bản mảng và echo shell)');
        assert.ok(issues1.some(i => i.includes('nhân bản mảng')), 'Phải bắt lỗi [item] * 5');
        assert.ok(issues1.some(i => i.includes('lệnh shell giả lập')), 'Phải bắt lỗi echo processing');

        const cleanCode = `
import subprocess
for i in range(5):
    subprocess.run(['ffmpeg', '-i', f'in_{i}.mp4', '-c:v', 'copy', f'out_{i}.mp4'])
`;
        const issues2 = contractEngine.detectMockAntiPatterns(cleanCode);
        assert.strictEqual(issues2.length, 0, 'Code chuẩn thực tế không được dính lỗi anti-mock');

        console.log('✅ [TEST 2] PASS: Phát hiện triệt để nhân bản mảng ảo và lệnh shell echo giả vờ');
    }

    // --- TEST 3: PHYSICAL AUDIT FULFILLMENT ---
    console.log('\n--- PHẦN 3: Kiểm toán thỏa mãn mục tiêu trên đĩa cứng ---');
    {
        const contract = contractEngine.extractContract('Tải 5 video short');
        
        // Giả lập khi chỉ có 1 file và dính code echo
        const auditFail = contractEngine.auditFulfillment(contract, {
            searchDirs: [__dirname], // Thư mục tests không chứa 5 file .mp4
            codeSnippet: 'files = ["a.mp4"] * 5\nsubprocess.run(["echo", "Processing..."])'
        });
        assert.strictEqual(auditFail.satisfied, false, 'Không đủ file và có code giả lập phải bị satisfied = false');
        assert.ok(auditFail.deficitDiagnostic.includes('Thiếu số lượng') || auditFail.deficitDiagnostic.includes('Vi phạm'), 'Phải có thông báo chẩn đoán thiếu hụt cụ thể');

        // Thử nghiệm với thư mục hôm nay có đủ 5 video thật
        const todayDir = 'C:\\Users\\Nam\\Desktop\\gemini\\2026-11-01';
        if (fs.existsSync(todayDir)) {
            const auditPass = contractEngine.auditFulfillment(contract, {
                searchDirs: [todayDir],
                codeSnippet: 'print("Execution completed with real tools")'
            });
            assert.strictEqual(auditPass.satisfied, true, 'Khi thư mục có đủ file thật và code sạch thì satisfied = true');
            assert.ok(auditPass.actualCount >= 5, 'Số lượng file thật phải >= 5');
        }

        console.log('✅ [TEST 3] PASS: Phân biệt chính xác giữa môi trường thiếu hụt vs môi trường đủ 100% file thật');
    }

    // --- TEST 4: DYNAMIC ENVIRONMENT DISCOVERY ---
    console.log('\n--- PHẦN 4: Tự khám phá công cụ môi trường & tìm giải pháp thay thế ---');
    {
        const caps = discovery.scanAvailableCapabilities();
        assert.ok(Array.isArray(caps.text_to_speech), 'Danh mục TTS phải là mảng');
        assert.ok(caps.text_to_speech.includes('gTTS') || caps.text_to_speech.includes('edge-tts'), 'Phải phát hiện ít nhất 1 thư viện TTS trên máy');
        assert.ok(caps.system_binaries.includes('python') || caps.system_binaries.includes('node'), 'Phải phát hiện runtime python hoặc node');

        const remedyTTS = discovery.suggestRemediationStrategy('edge-tts connection failed');
        assert.strictEqual(remedyTTS.failedCategory, 'Text-to-Speech');
        assert.ok(remedyTTS.remediationPrompt.includes('gTTS'), 'Phải đề xuất gTTS khi edge-tts bị lỗi');

        const remedyScrape = discovery.suggestRemediationStrategy('403 cloudflare scrape blocked');
        assert.strictEqual(remedyScrape.failedCategory, 'Web Scraping');
        assert.ok(remedyScrape.remediationPrompt.includes('REST API') || remedyScrape.remediationPrompt.includes('BROWSE_WEB'), 'Phải đề xuất giải pháp vượt rào cản cào web');

        console.log('✅ [TEST 4] PASS: Quét đồ nghề hệ thống thành công và tự động cấp phương án thay thế tối ưu');
    }

    // --- TEST 5: INDEPENDENT VERIFIER CLOSED-LOOP INTEGRATION ---
    console.log('\n--- PHẦN 5: Tích hợp Verifier từ chối nghiệm thu khi dính Deficit ---');
    {
        const directive = { objective: 'Tự động tải 5 video short và lồng tiếng' };
        const plan = { description: 'Xử lý video hàng loạt' };
        
        // Giả lập Specialist trả về code giả lập echo
        const mockSpecialistResults = [{
            agent: 'developer',
            id: 'A001',
            success: true,
            response: '```python\nfiles = ["video.mp4"] * 5\nsubprocess.run(["echo", "Processing..."])\n```'
        }];

        // Tạo verifier với thư mục trống không có file mp4
        const emptyVerifier = new IndependentVerifier(__dirname);
        const auditResult = await emptyVerifier.verifyExecution(directive, plan, mockSpecialistResults, [], 'standard');

        assert.strictEqual(auditResult.status, 'DEFICIT_DETECTED', 'Phải đánh dấu DEFICIT_DETECTED khi không có đủ file và dính code mock');
        assert.strictEqual(auditResult.verified, false, 'verified phải là false khi dính Goal Deficit');
        assert.ok(auditResult.qualityScore <= 60, 'Điểm chất lượng không được vượt quá 60 khi chưa đạt mục tiêu');

        console.log('✅ [TEST 5] PASS: Verifier bắt quả tang gian lận và từ chối nghiệm thu, kích hoạt vòng lặp tự chữa lành');
    }

    console.log('\n===============================================================');
    console.log('🏁 TẤT CẢ 5/5 BÀI TEST TỰ HÀNH & HỢP ĐỒNG MỤC TIÊU ĐỀU ĐẠT HOÀN HẢO (100%)');
    console.log('===============================================================\n');
}

runTests().catch(err => {
    console.error('❌ Lỗi kiểm thử:', err);
    process.exit(1);
});
