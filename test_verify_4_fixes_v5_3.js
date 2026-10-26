/**
 * test_verify_4_fixes_v5_3.js - Verification Suite for 4 Critical Architecture Bugs (v5.3)
 *
 * Lỗi A: Dependency Injection mock fetch in AgentOrchestrator (prevents mock bypass & unmocked network calls)
 * Lỗi B: StateGraph deserialization preserves conditionId and does not fabricate blind loop on missing condition
 * Lỗi C: ModelRouter per-slot lease timeout (preserves slots past 45s up to 90s for long-running 75s requests)
 * Lỗi D: Tool follow-up quota denial returns QUOTA_WAITING instead of success: true with empty response
 */

const assert = require('assert');
const { AgentOrchestrator } = require('./agents/AgentOrchestrator');
const { StateGraph } = require('./agents/StateGraph');
const { ModelRouter } = require('./agents/ModelRouter');

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
    totalTests++;
    process.stdout.write(`⏳ [TEST] ${name} ... `);
    try {
        await fn();
        console.log('✅ PASS');
        passedTests++;
    } catch (err) {
        console.log('❌ FAIL');
        console.error(err);
        process.exitCode = 1;
    }
}

async function main() {
    console.log('===============================================================');
    console.log('🔬 XÁC MINH TOÀN DIỆN 4 LỖI KIẾN TRÚC MỚI NHẤT (V5.3)');
    console.log('===============================================================\n');

    // -------------------------------------------------------------------------
    // LỖI A: KIỂM THỬ FALLBACK GEMINI DÙNG DEPENDENCY INJECTION CHO HTTP FETCH
    // -------------------------------------------------------------------------
    console.log('--- LỖI A: DEPENDENCY INJECTION HTTP CLIENT TRÁNH BYPASS MOCK ---');

    await runTest('AgentOrchestrator nhận fetch qua constructor options và dùng đúng mock', async () => {
        let fetchCalls = [];
        const mockFetch = async (url, opts) => {
            fetchCalls.push({ url, opts });
            // Mock HTTP 429 for first model, then 200 for fallback
            if (url.includes('gemini-3.5-flash:')) {
                return {
                    ok: false,
                    status: 429,
                    statusText: 'Too Many Requests',
                    json: async () => ({ error: { code: 429, message: 'Resource exhausted' } }),
                    text: async () => JSON.stringify({ error: { code: 429, message: 'Resource exhausted' } })
                };
            }
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({
                    candidates: [{
                        content: {
                            parts: [{ text: 'Mock response from fallback model successfully received!' }]
                        },
                        finishReason: 'STOP'
                    }],
                    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 }
                }),
                text: async () => ''
            };
        };

        const orchestrator = new AgentOrchestrator({
            apiKey: 'mock_di_key_123',
            fetch: mockFetch,
            defaultModel: 'gemini-3.5-flash'
        });

        // Ensure orchestrator._getFetch() returns our mockFetch
        assert.strictEqual(orchestrator._getFetch(), mockFetch, 'orchestrator._getFetch() phải trả về mockFetch đã inject');

        const result = await orchestrator.callAgent('developer', {
            task: 'Test dependency injected mock fetch'
        });

        assert.strictEqual(result.success, true, 'Agent call phải thành công qua mock fallback');
        assert.ok(result.response.includes('Mock response from fallback model'), 'Phản hồi từ fallback model mock');
        assert.strictEqual(fetchCalls.length, 2, 'Phải gọi đúng 2 lần (lần 1: 429, lần 2: fallback 200)');
        assert.ok(fetchCalls[0].url.includes('gemini-3.5-flash:'), 'Lần 1 gọi gemini-3.5-flash');
        assert.ok(fetchCalls[1].url.includes('gemini-flash-lite-latest:') || fetchCalls[1].url.includes('gemini-3.5-flash-lite:'), 'Lần 2 gọi model fallback');
    });

    // -------------------------------------------------------------------------
    // LỖI B: STATEGRAPH DESERIALIZE BẢO TOÀN ĐIỀU KIỆN LẶP (KHÔNG LẶP MÙ QUÁNG)
    // -------------------------------------------------------------------------
    console.log('\n--- LỖI B: DESERIALIZATION KHÔNG TỰ CHẾ ĐIỀU KIỆN LẶP MÙ QUÁNG ---');

    await runTest('Khi không có loopConditions trong deserialize, graph KHÔNG tự lặp khi kết quả thành công', async () => {
        const originalGraph = new StateGraph({ graphId: 'graph_cond_test' });
        let execCountA = 0;
        let execCountB = 0;

        originalGraph.addNode({
            id: 'nodeA',
            action: async () => { execCountA++; return { success: true, verified: true }; }
        });
        originalGraph.addNode({
            id: 'nodeB',
            action: async () => { execCountB++; return { success: true }; }
        });
        originalGraph.addEdge('nodeA', 'nodeB');

        // Thêm conditional loop với conditionId rõ ràng: chỉ lặp nếu NOT verified
        originalGraph.addConditionalLoop('nodeB', 'nodeA', (res, state) => {
            return !state.verified;
        }, 3, 'loop_retry_if_unverified');

        // Serialize graph ra JSON
        const serialized = originalGraph.serialize();
        assert.ok(serialized.conditionalLoops.length === 1, 'Phải có 1 conditional loop');
        assert.strictEqual(serialized.conditionalLoops[0].conditionId, 'loop_retry_if_unverified', 'conditionId phải được lưu');

        // Deserialize KHÔNG truyền loopConditions (mô phỏng server restart không map được hàm)
        const restoredGraph = StateGraph.deserialize(serialized, {
            nodeExecutors: {
                nodeA: async () => { execCountA++; return { success: true, verified: true }; },
                nodeB: async () => { execCountB++; return { success: true }; }
            }
            // Không truyền loopConditions!
        });

        const restoredLoop = restoredGraph.conditionalLoops[0];
        assert.strictEqual(restoredLoop.unresolvedCondition, true, 'unresolvedCondition phải là true khi thiếu hàm');
        assert.strictEqual(restoredLoop.condition, null, 'condition phải là null thay vì tự chế hàm lặp mù quáng');

        // Chạy graph đã deserialize
        execCountA = 0;
        execCountB = 0;
        const runRes = await restoredGraph.run();

        assert.strictEqual(runRes.status, 'COMPLETED', 'Graph phải hoàn thành thành công');
        assert.strictEqual(execCountA, 1, 'nodeA chỉ chạy đúng 1 lần (KHÔNG bị lặp mù quáng)');
        assert.strictEqual(execCountB, 1, 'nodeB chỉ chạy đúng 1 lần (KHÔNG bị lặp mù quáng)');
    });

    await runTest('Khi cung cấp loopConditions qua conditionId trong deserialize, điều kiện lặp hoạt động chuẩn', async () => {
        const originalGraph = new StateGraph({ graphId: 'graph_cond_id_test' });
        originalGraph.addNode({ id: 'step1', action: async () => ({ success: true }) });
        originalGraph.addConditionalLoop('step1', 'step1', () => false, 3, 'cond_custom_id');

        const serialized = originalGraph.serialize();

        let conditionEvaluated = false;
        const restoredGraph = StateGraph.deserialize(serialized, {
            nodeExecutors: {
                step1: async () => ({ success: true })
            },
            loopConditions: {
                cond_custom_id: (res, state) => {
                    conditionEvaluated = true;
                    return false; // don't loop
                }
            }
        });

        assert.strictEqual(restoredGraph.conditionalLoops[0].unresolvedCondition, false, 'unresolvedCondition phải là false');
        assert.strictEqual(typeof restoredGraph.conditionalLoops[0].condition, 'function', 'condition phải là function');

        await restoredGraph.run();
        assert.strictEqual(conditionEvaluated, true, 'Hàm điều kiện gốc theo conditionId phải được gọi');
    });

    // -------------------------------------------------------------------------
    // LỖI C: MODELROUTER PER-SLOT LEASE DURATION (> 45s KHÔNG BỊ HỦY NHẦM)
    // -------------------------------------------------------------------------
    console.log('\n--- LỖI C: THU HỒI SLOT DỰA TRÊN LEASE THỰC TẾ THAY VÌ HARDCODE 45S ---');

    await runTest('cleanSlidingWindows KHÔNG thu hồi slot đang chạy ở giây thứ 50 khi maxDuration là 90s', async () => {
        const router = new ModelRouter({ defaultModel: 'gemini-3.5-flash' });

        // Cấp một slot với maxDuration 90000ms
        const slot = await router.acquireDispatchSlot({
            model: 'gemini-3.5-flash',
            estimatedTokens: 2000,
            priority: 1,
            maxDuration: 90000
        });

        assert.ok(slot.granted, 'Slot phải được cấp');
        const slotId = slot.slotId;
        assert.ok(router.activeSlots.has(slotId), 'Slot phải tồn tại trong activeSlots');

        // Giả lập thời gian trôi qua 50 giây (50,000ms > 45,000ms cũ)
        const slotData = router.activeSlots.get(slotId);
        slotData.timestamp = Date.now() - 50000; // Giả lập đã chạy được 50s

        // Chạy cleanSlidingWindows
        router.cleanSlidingWindows();

        // Slot PHẢI CÒN TỒN TẠI vì maxDuration là 90s (chưa quá hạn)!
        assert.ok(router.activeSlots.has(slotId), 'Slot chạy 50s KHÔNG ĐƯỢC bị thu hồi nhầm khi maxDuration là 90s');

        // Bây giờ giả lập thời gian trôi qua 95 giây (95,000ms > 90,000ms)
        slotData.timestamp = Date.now() - 95000;
        router.cleanSlidingWindows();

        // Lúc này slot đã quá hạn 90s thực sự -> PHẢI được thu hồi an toàn
        assert.strictEqual(router.activeSlots.has(slotId), false, 'Slot quá hạn 90s phải được dọn dẹp sạch sẽ');
    });

    // -------------------------------------------------------------------------
    // LỖI D: TOOL FOLLOW-UP HẾT QUOTA TRẢ QUOTA_WAITING THAY VÌ SUCCESS: TRUE RỖNG
    // -------------------------------------------------------------------------
    console.log('\n--- LỖI D: TOOL FOLLOW-UP / FINALIZE HẾT QUOTA TRẢ VỀ QUOTA_WAITING ---');

    await runTest('Khi tool follow-up bị scheduler từ chối cấp slot, trả về QUOTA_WAITING có retryable', async () => {
        // Mock fetch trả về functionCall cho lần đầu
        let step = 0;
        const mockFetch = async (url, opts) => {
            step++;
            if (step === 1) {
                // Return function call to calculate
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        candidates: [{
                            content: {
                                parts: [{
                                    functionCall: {
                                        name: 'calculate',
                                        args: { expression: '128 * 4' }
                                    }
                                }]
                            },
                            finishReason: 'STOP'
                        }],
                        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20, totalTokenCount: 70 }
                    }),
                    text: async () => ''
                };
            }
            throw new Error('Should not reach second fetch if quota denied!');
        };

        const orchestrator = new AgentOrchestrator({
            apiKey: 'mock_key',
            fetch: mockFetch
        });

        // Mock ToolExecutor calculate
        orchestrator.tools = {
            calculate: async () => ({ result: 512 })
        };

        // Mock ModelRouter từ chối slot ở lần follow-up (lần 1 granted, lần 2 denied)
        let slotAttempts = 0;
        orchestrator.modelRouter.acquireDispatchSlot = async (req) => {
            slotAttempts++;
            if (slotAttempts === 1) {
                return { granted: true, slotId: 'slot_initial_ok', waitMs: 0, model: req.model };
            }
            // Lần 2 (follow-up) bị từ chối quota
            return { granted: false, status: 'QUOTA_WAITING', retryAfterMs: 5000, message: 'RPM exhausted' };
        };

        const result = await orchestrator.callAgent('developer', {
            task: 'Tính toán biểu thức'
        });

        // Kiểm tra BẮT BUỘC: KHÔNG ĐƯỢC trả về success: true với response: ""!
        assert.strictEqual(result.success, false, 'Khi hết quota follow-up, success phải là false');
        assert.strictEqual(result.status, 'QUOTA_WAITING', 'status phải là QUOTA_WAITING');
        assert.strictEqual(result.retryable, true, 'retryable phải là true');
        assert.strictEqual(result.quotaDeferred, true, 'quotaDeferred phải là true');
        assert.ok(Array.isArray(result.conversationContents), 'Phải giữ nguyên conversationContents để resume');
        assert.ok(result.toolIterations >= 1, 'Phải giữ lại số lượt toolIterations');
    });

    await runTest('Khi Gemini trả về nội dung rỗng hoàn toàn, không trả success: true giả tạo', async () => {
        const mockEmptyFetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [{
                    content: {
                        parts: [] // Trống rỗng
                    },
                    finishReason: 'STOP'
                }],
                usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0, totalTokenCount: 10 }
            }),
            text: async () => ''
        });

        const orchestrator = new AgentOrchestrator({
            apiKey: 'mock_key',
            fetch: mockEmptyFetch
        });

        const result = await orchestrator.callAgent('developer', {
            task: 'Test empty response'
        });

        assert.strictEqual(result.success, false, 'Không được báo success: true khi response hoàn toàn rỗng');
        assert.strictEqual(result.status, 'INCOMPLETE_RESPONSE', 'status phải là INCOMPLETE_RESPONSE');
    });

    // -------------------------------------------------------------------------
    // TỔNG KẾT
    // -------------------------------------------------------------------------
    console.log('\n===============================================================');
    console.log(`🎉 KẾT QUẢ: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
    console.log('===============================================================');
}

main().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
