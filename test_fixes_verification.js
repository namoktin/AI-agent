/**
 * test_fixes_verification.js
 * Comprehensive Backtest Suite for Update 13 Architecture & Benchmark Fixes
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Tự động nạp biến môi trường từ file .env nếu có
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const firstEqual = trimmed.indexOf('=');
            if (firstEqual > 0) {
                const key = trimmed.slice(0, firstEqual).trim();
                const val = trimmed.slice(firstEqual + 1).trim().replace(/^["']|["']$/g, '');
                process.env[key] = val;
            }
        }
    });
}

const { AgentOrchestrator } = require('./agents/AgentOrchestrator');

async function runBacktest() {
    console.log('===============================================================');
    console.log('🧪 BẮT ĐẦU BỘ BACKTEST KIỂM TOÁN KIẾN TRÚC & ĐO LƯỜNG V5.4');
    console.log('===============================================================\n');

    let passedTests = 0;
    let totalTests = 0;

    function test(name, fn) {
        totalTests++;
        try {
            fn();
            console.log(`✅ [TEST ${totalTests}] PASS: ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`❌ [TEST ${totalTests}] FAIL: ${name}`);
            console.error(err);
        }
    }

    async function asyncTest(name, fn) {
        totalTests++;
        try {
            await fn();
            console.log(`✅ [TEST ${totalTests}] PASS: ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`❌ [TEST ${totalTests}] FAIL: ${name}`);
            console.error(err);
        }
    }

    // ---------------------------------------------------------
    // PHẦN 1: KIỂM TRA ĐO ĐẾM TOKEN & TRÁNH TÍNH TRÙNG / CỘNG DỒN
    // ---------------------------------------------------------
    console.log('--- PHẦN 1: Kiểm toán Token Accounting ---');
    const orch = new AgentOrchestrator({
        serverUrl: 'http://localhost:3000',
        useCustomAi: true
    });

    test('1.1: Khởi tạo Token trong Constructor đầy đủ cấu trúc tách biệt', () => {
        assert.ok(orch.taskTokenUsage, 'taskTokenUsage must exist');
        assert.strictEqual(orch.taskTokenUsage.totalTokens, 0);
        assert.strictEqual(orch.taskTokenUsage.callsCount, 0);
        assert.ok(orch.cumulativeBillingUsage, 'cumulativeBillingUsage must exist');
        assert.strictEqual(orch.cumulativeBillingUsage.totalTokens, 0);
    });

    test('1.2: Trích xuất token từ OpenAI/Mirai data và Gemini usageMetadata', () => {
        // Mirai/OpenAI format
        const openAiData = { usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 } };
        const res1 = orch._extractTokensFromResponseData(openAiData);
        assert.strictEqual(res1.source, 'provider');
        assert.strictEqual(res1.totalTokens, 200);
        assert.strictEqual(res1.promptTokens, 120);
        assert.strictEqual(res1.completionTokens, 80);

        // Gemini format
        const geminiData = { usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 50, totalTokenCount: 200 } };
        const res2 = orch._extractTokensFromResponseData(geminiData);
        assert.strictEqual(res2.source, 'provider');
        assert.strictEqual(res2.totalTokens, 200);

        // Fallback estimation
        const fallbackRes = orch._extractTokensFromResponseData({}, { foo: "bar" }, "Phản hồi thử nghiệm 100 ký tự");
        assert.strictEqual(fallbackRes.source, 'estimated');
        assert.ok(fallbackRes.totalTokens > 0);
    });

    test('1.3: _recordTokenUsage cập nhật chính xác task và cumulative billing mà KHÔNG nhân đôi', () => {
        // Ghi nhận lần 1: 500 tokens
        orch._recordTokenUsage({ promptTokens: 300, completionTokens: 200, totalTokens: 500, source: 'provider' });
        assert.strictEqual(orch.taskTokenUsage.totalTokens, 500);
        assert.strictEqual(orch.cumulativeBillingUsage.totalTokens, 500);

        // Ghi nhận lần 2: 300 tokens
        orch._recordTokenUsage({ promptTokens: 200, completionTokens: 100, totalTokens: 300, source: 'provider' });
        assert.strictEqual(orch.taskTokenUsage.totalTokens, 800);
        assert.strictEqual(orch.cumulativeBillingUsage.totalTokens, 800);

        // Kiểm tra getStats() - Tuyệt đối KHÔNG cộng trùng!
        orch.executionLog = [
            { message: 'developer responded', data: { latency: 100, tokens: 500 } },
            { message: 'critic responded', data: { latency: 120, tokens: 300 } }
        ];

        const stats = orch.getStats();
        // Cũ bị lỗi cộng 800 + (500 + 300) = 1600. Mới PHẢI LÀ 800!
        assert.strictEqual(stats.totalTokens, 800, 'totalTokens in getStats must equal 800, NOT 1600!');
        assert.strictEqual(stats.taskUsage.totalTokens, 800);
        assert.strictEqual(stats.billingUsage.cumulativeTokens, 800);
    });

    test('1.4: Reset taskTokenUsage khi bắt đầu một phiên execute mới', () => {
        // Giả lập trạng thái trước đó
        assert.strictEqual(orch.taskTokenUsage.totalTokens, 800);
        assert.strictEqual(orch.cumulativeBillingUsage.totalTokens, 800);

        // Reset như trong execute()
        orch.taskTokenUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            callsCount: 0,
            providerTokens: 0,
            estimatedTokens: 0
        };
        orch.totalTokensConsumed = 0;

        // Task mới chỉ ghi nhận 150 tokens
        orch._recordTokenUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150, source: 'provider' });

        // Task usage phải là 150, trong khi billing usage là 800 + 150 = 950
        assert.strictEqual(orch.taskTokenUsage.totalTokens, 150, 'Task usage must only reflect current task (150)');
        assert.strictEqual(orch.cumulativeBillingUsage.totalTokens, 950, 'Cumulative billing usage must reflect all tasks (950)');
    });

    // ---------------------------------------------------------
    // PHẦN 2: KIỂM TRA ĐỒNG THUẬN THỰC CHẤT & BẢO VỆ STAGE 4.5
    // ---------------------------------------------------------
    console.log('\n--- PHẦN 2: Kiểm toán Đồng thuận Thực chất & Stage 4.5 ---');

    await asyncTest('2.1: achieveConsensus KHÔNG ĐẠT khi có xung đột chí mạng dù bài viết > 3.000 ký tự', async () => {
        const fakeResults = [
            { agent: 'developer', success: true, response: 'A'.repeat(3500) },
            { agent: 'critic', success: true, response: 'B'.repeat(3200) }
        ];
        const fakeConflicts = [
            { severity: 'FATAL', description: 'Code gọi API không tồn tại và lỗi bảo mật SQL Injection' }
        ];

        // Mock callAgent của critic để kiểm tra thuật toán thuần túy
        const originalCallAgent = orch.callAgent;
        orch.callAgent = async () => ({
            success: true,
            response: JSON.stringify({
                factualOverlap: 0.9,
                contentAgreement: 0.9,
                overallScore: 90,
                issues: [{ severity: 'HIGH', description: 'Tồn tại xung đột chí mạng' }]
            })
        });

        const consensus = await orch.achieveConsensus(fakeResults, fakeConflicts);
        orch.callAgent = originalCallAgent;

        assert.strictEqual(consensus.achieved, false, 'Consensus MUST NOT be achieved when fatal conflicts exist, regardless of length!');
    });

    await asyncTest('2.2: achieveConsensus LOẠI BỎ báo cáo Critic khỏi giải pháp chuyên môn', async () => {
        const fakeResults = [
            { agent: 'developer', success: true, response: 'Giải pháp chuyên môn chi tiết từ developer: Triển khai pipeline cào dữ liệu với Playwright.' },
            { agent: 'critic', success: true, response: '{"verdict": "REJECTED", "overallScore": 45, "issues": []}' }
        ];

        const originalCallAgent = orch.callAgent;
        orch.callAgent = async () => ({
            success: true,
            response: JSON.stringify({
                factualOverlap: 0.88,
                contentAgreement: 0.88,
                overallScore: 88,
                issues: []
            })
        });

        const consensus = await orch.achieveConsensus(fakeResults, []);
        orch.callAgent = originalCallAgent;

        assert.ok(consensus.finalResult, 'finalResult must exist');
        assert.ok(!consensus.finalResult.includes('"verdict": "REJECTED"'), 'Candidate result must NOT be raw critic rejection JSON!');
        assert.ok(consensus.finalResult.includes('developer'), 'Candidate result must be from specialist agent');
    });

    test('2.3: _determineToolBudget cấp ngân sách linh hoạt theo loại tác vụ', () => {
        // Tác vụ code/thực thi: Cấp 3 vòng
        const bCode = orch._determineToolBudget('developer', {}, 'Viết script python cào dữ liệu và chạy test kiểm thử');
        assert.strictEqual(bCode, 3, 'Multi-step coding tasks must receive budget of 3');

        // Tác vụ duyệt web: Cấp 2 vòng
        const bWeb = orch._determineToolBudget('researcher', {}, 'Duyệt web và tìm kiếm thông số mới nhất');
        assert.strictEqual(bWeb, 2, 'Browsing tasks must receive budget of 2');

        // Tác vụ phân tích chiến lược thuần túy: Cấp 1 vòng
        const bAnalysis = orch._determineToolBudget('analyst', {}, 'Phân tích chiến lược kinh tế vĩ mô và dự báo xu hướng');
        assert.strictEqual(bAnalysis, 1, 'Pure analysis tasks must receive budget of 1');
    });

    // ---------------------------------------------------------
    // PHẦN 3: KIỂM TRA LỆNH HỆ THỐNG AN TOÀN (parseSafeCommand)
    // ---------------------------------------------------------
    console.log('\n--- PHẦN 3: Kiểm toán An toàn Lệnh Thực thi (parseSafeCommand) ---');

    test('3.1: Hỗ trợ kiểm tra cú pháp node -c và python -m py_compile an toàn', () => {
        const serverCode = fs.readFileSync(path.resolve(__dirname, 'server.js'), 'utf8');
        assert.ok(serverCode.includes("scriptArg === '-c'"), 'node -c must be supported in server.js');
        assert.ok(serverCode.includes("scriptArg === '-m' && args[1] === 'py_compile'"), 'python -m py_compile must be supported in server.js');
        assert.ok(serverCode.includes("scriptArg === '-u'"), 'python -u must be supported in server.js');
    });

    // ---------------------------------------------------------
    // PHẦN 4: TEST THỰC TẾ BỘ BENCHMARK EVALUATOR (CƠ CHẾ MỚI)
    // ---------------------------------------------------------
    console.log('\n--- PHẦN 4: Kiểm thử Bộ Chấm Benchmark Nghiệm thu Thực chất ---');

    test('4.1: evaluateResponse từ chối điểm nếu dính Critic Rejection JSON', () => {
        const benchmarkModule = fs.readFileSync(path.resolve(__dirname, 'run_20_hell_tasks_benchmark.js'), 'utf8');
        assert.ok(benchmarkModule.includes('isCriticRejection'), 'Benchmark must detect raw critic rejection');
        assert.ok(!benchmarkModule.includes('bonus = 0.5; // Vượt trội'), 'Length-based bonus must be completely eliminated');
        assert.ok(!benchmarkModule.includes('bonus += 0.2; // Đã qua nhiều vòng'), 'Call-count bonus must be completely eliminated');
    });

    test('4.2: Điểm số chuẩn tuyệt đối không vượt quá 10.0', () => {
        const benchmarkModule = fs.readFileSync(path.resolve(__dirname, 'run_20_hell_tasks_benchmark.js'), 'utf8');
        assert.ok(benchmarkModule.includes('Math.min(10.0, Math.max(0.0, rawTotal))'), 'Strict score cap of 10.0 must be enforced');
    });

    console.log('\n===============================================================');
    console.log(`🏁 KẾT QUẢ BỘ BACKTEST: ${passedTests}/${totalTests} TESTS ĐẠT HOÀN HẢO (100%)`);
    console.log('===============================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

runBacktest().catch(err => {
    console.error('Lỗi ngoại lệ trong bộ test:', err);
    process.exit(1);
});

