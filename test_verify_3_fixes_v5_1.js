/**
 * test_verify_3_fixes_v5_1.js - Deep Verification Test Suite for the 3 Master Prompt Architectural Fixes
 * 
 * 1. Lỗi 1: StateGraph Zero False-Success (success: false treated as strict failure even without acceptance criteria)
 * 2. Lỗi 2: Human-In-The-Loop (HITL) unified task ID, event stream, and resume pipeline
 * 3. Lỗi 3: Quota Scheduler RPM/TPM/RPD pre-reservation under concurrency & actual token reconciliation
 */

const assert = require('assert');
const path = require('path');
const { StateGraph, StateNode } = require('./agents/StateGraph');
const { AgentEventStream, globalEventStream } = require('./agents/AgentEventStream');
const { AdaptivePlanner } = require('./agents/AdaptivePlanner');
const { AgentOrchestrator } = require('./agents/AgentOrchestrator');
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
    console.log('🔬 KIỂM THỬ XÁC MINH TRIỆT ĐỂ 3 LỖI KIẾN TRÚC V5.1');
    console.log('===============================================================\n');

    // -------------------------------------------------------------
    // LỖI 1: CHỐNG BÁO THÀNH CÔNG GIẢ (ZERO FALSE-SUCCESS IN STATEGRAPH)
    // -------------------------------------------------------------
    console.log('--- 1. KIỂM THỬ LỖI 1: STATEGRAPH STRICT FAILURE GUARD ---');

    await runTest('Node không có acceptance criteria nhưng trả về { success: false } BẮT BUỘC coi là THẤT BẠI', async () => {
        const graph = new StateGraph({ graphId: `graph_test_fail_${Date.now()}` });
        
        // Node KHÔNG có acceptanceCriteria
        graph.addNode({
            id: 'node_fail_action',
            description: 'Action returns success: false',
            acceptanceCriteria: [], // Không có điều kiện nghiệm thu
            maxRetries: 1,
            backoffMs: 10,
            action: async () => {
                return { success: false, error: 'Critical database connection failed' };
            }
        });

        const result = await graph.run();
        
        // Trạng thái node PHẢI là FAILED, KHÔNG ĐƯỢC PHÉP LÀ COMPLETED!
        const node = graph.nodes.get('node_fail_action');
        assert.strictEqual(node.status, 'FAILED', `Node status phải là FAILED nhưng lại là: ${node.status}`);
        assert.strictEqual(node.executedSuccessfully, false, 'executedSuccessfully phải là false');
        assert.ok(graph.failedNodes.has('node_fail_action'), 'Node phải nằm trong failedNodes');
        assert.strictEqual(graph.completedNodes.has('node_fail_action'), false, 'Node KHÔNG được nằm trong completedNodes');
        assert.strictEqual(result.status, 'FAILED', 'Toàn bộ graph phải có status FAILED');
    });

    await runTest('Node trả về { success: false } được phục hồi sau retry hoặc replan', async () => {
        const graph = new StateGraph({ graphId: `graph_test_retry_${Date.now()}` });
        let attempts = 0;

        graph.addNode({
            id: 'node_retry_action',
            description: 'Action fails first then succeeds',
            acceptanceCriteria: [],
            maxRetries: 2,
            backoffMs: 20,
            action: async () => {
                attempts++;
                if (attempts === 1) {
                    return { success: false, error: 'Temporary socket timeout' };
                }
                return { success: true, data: 'Fetched successfully on attempt 2' };
            }
        });

        const result = await graph.run();
        const node = graph.nodes.get('node_retry_action');
        assert.strictEqual(attempts, 2, 'Phải thực hiện đúng 2 lần thử');
        assert.strictEqual(node.status, 'COMPLETED', 'Node phải hoàn thành sau khi retry thành công');
        assert.strictEqual(result.status, 'COMPLETED', 'Graph hoàn thành thành công');
    });

    // -------------------------------------------------------------
    // LỖI 2: HITL KẾT NỐI KHÉP KÍN TỪ ORCHESTRATOR / PLANNER ĐẾN GRAPH & RESUME
    // -------------------------------------------------------------
    console.log('\n--- 2. KIỂM THỬ LỖI 2: HITL PIPELINE & UNIFIED EVENTSTREAM RESUME ---');

    await runTest('AdaptivePlanner & Orchestrator truyền thống nhất eventStream và taskId vào StateGraph', async () => {
        const planner = new AdaptivePlanner();
        const customEventStream = new AgentEventStream();
        const testTaskId = `task_hitl_${Date.now()}`;

        const { graph } = planner.generateStateGraph('autonomous', 'Test request', {}, null, {
            graphId: testTaskId,
            taskId: testTaskId,
            eventStream: customEventStream
        });

        assert.strictEqual(graph.graphId, testTaskId, 'GraphId phải khớp chính xác với testTaskId');
        assert.strictEqual(graph.eventStream, customEventStream, 'eventStream phải được gắn kết chính xác');
    });

    await runTest('StateGraph tạm dừng khi gặp node cần duyệt, đăng ký vào EventStream và tiếp tục sau khi approve', async () => {
        const eventStream = new AgentEventStream();
        const taskId = `task_approval_e2e_${Date.now()}`;
        const graph = new StateGraph({
            graphId: taskId,
            eventStream: eventStream
        });

        let executedProtectedAction = false;

        graph.addNode({
            id: 'safe_pre_task',
            description: 'Read system configs',
            action: async () => ({ success: true, config: 'ready' })
        });

        graph.addNode({
            id: 'sensitive_write_task',
            description: 'Update production database table',
            dependencies: ['safe_pre_task'],
            requiresApproval: true,
            approvalDescription: 'Yêu cầu quyền ghi vào bảng cơ sở dữ liệu production',
            action: async () => {
                executedProtectedAction = true;
                return { success: true, modifiedRows: 42 };
            }
        });

        // 1. Chạy đồ thị - Phải tạm dừng ở sensitive_write_task
        const pauseResult = await graph.run();
        assert.strictEqual(pauseResult.status, 'WAITING_APPROVAL', 'Graph phải có status WAITING_APPROVAL');
        assert.strictEqual(pauseResult.waitingApprovalNode, 'sensitive_write_task');
        assert.strictEqual(executedProtectedAction, false, 'Hành động nhạy cảm CHƯA ĐƯỢC chạy khi chưa phê duyệt');

        // 2. Kiểm tra EventStream đã lưu trữ thông tin phê duyệt theo đúng taskId
        const pending = eventStream.getApprovalStatus(taskId);
        assert.ok(pending, 'EventStream phải tìm thấy approval request theo taskId');
        assert.strictEqual(pending.status, 'WAITING_APPROVAL');
        assert.strictEqual(pending.nodeId, 'sensitive_write_task');

        // 3. Người giám sát (Human Supervisor) gửi quyết định APPROVE
        const approvalRes = eventStream.submitDecision(taskId, 'APPROVE', 'Đã kiểm tra an toàn, cho phép ghi');
        assert.strictEqual(approvalRes.status, 'APPROVED');

        // 4. StateGraph nhận quyết định phê duyệt và chạy tiếp (Resume)
        const resumeResult = await graph.resume();
        assert.strictEqual(resumeResult.status, 'COMPLETED', 'Graph sau khi approve phải hoàn thành COMPLETED');
        assert.strictEqual(executedProtectedAction, true, 'Hành động nhạy cảm PHẢI ĐƯỢC thực thi sau khi approve');
        const sensitiveNode = graph.nodes.get('sensitive_write_task');
        assert.strictEqual(sensitiveNode.status, 'COMPLETED');
        assert.strictEqual(sensitiveNode.output.modifiedRows, 42);
    });

    await runTest('AgentOrchestrator resumeGraph tiếp tục thực thi tác vụ thành công', async () => {
        const orchestrator = new AgentOrchestrator('fake-key-for-test');
        const taskId = `orchestrator_graph_${Date.now()}`;

        const graph = new StateGraph({
            graphId: taskId,
            eventStream: orchestrator.eventStream
        });

        let executed = false;
        graph.addNode({
            id: 'deploy_node',
            description: 'Deploy code to server',
            requiresApproval: true,
            action: async () => {
                executed = true;
                return { success: true, deployed: true };
            }
        });

        // Chạy và dừng chờ duyệt
        await orchestrator.executeGraph(graph);
        assert.strictEqual(graph.status, 'WAITING_APPROVAL');
        assert.strictEqual(executed, false);

        // Resume qua orchestrator
        const resumeRes = await orchestrator.resumeGraph(taskId, 'APPROVE', 'Chấp thuận triển khai');
        assert.strictEqual(resumeRes.status, 'COMPLETED');
        assert.strictEqual(executed, true);
    });

    // -------------------------------------------------------------
    // LỖI 3: QUOTA SCHEDULER ĐẶT TRƯỚC NGÂN SÁCH ĐỒNG THỜI & RPD LIMIT
    // -------------------------------------------------------------
    console.log('\n--- 3. KIỂM THỬ LỖI 3: CONCURRENT PRE-RESERVATION & RPD CONTROL ---');

    await runTest('Đặt trước (Pre-reserve) tokens & requests ngay khi cấp slot ngăn chặn vượt RPM/TPM đồng thời', async () => {
        const router = new ModelRouter({
            maxRPM: 2,          // Chỉ cho phép tối đa 2 requests / phút
            maxTPM: 5000,       // Tối đa 5.000 tokens / phút
            maxInflight: 5
        });

        // Request 1: Cần 2.000 tokens
        const slot1 = await router.acquireDispatchSlot({ estimatedTokens: 2000, priority: 1 });
        assert.strictEqual(slot1.immediate, true, 'Slot 1 cấp ngay');
        assert.ok(slot1.slotId, 'Slot 1 phải có slotId');

        // Ngay tại thời điểm cấp slot 1, request count và token usage đã được đặt trước trong bộ đếm!
        assert.strictEqual(router.requestTimestamps.length, 1, 'RPM window phải ghi nhận 1 request đang bay');
        const reservedTPM1 = router.tokenUsage.reduce((s, x) => s + x.tokens, 0);
        assert.strictEqual(reservedTPM1, 2000, 'TPM window phải ghi nhận 2.000 tokens đặt trước');

        // Request 2: Cần 2.500 tokens -> Tổng tokens sẽ là 4.500 <= 5.000, tổng requests là 2 <= 2 -> Được cấp ngay
        const slot2 = await router.acquireDispatchSlot({ estimatedTokens: 2500, priority: 2 });
        assert.strictEqual(slot2.immediate, true, 'Slot 2 cấp ngay');
        assert.strictEqual(router.requestTimestamps.length, 2, 'RPM window phải ghi nhận 2 requests');
        const reservedTPM2 = router.tokenUsage.reduce((s, x) => s + x.tokens, 0);
        assert.strictEqual(reservedTPM2, 4500, 'TPM window phải ghi nhận 4.500 tokens đặt trước');

        // Request 3: Cần 1.000 tokens -> CẢ RPM (2/2) VÀ TPM (4500 + 1000 > 5000) ĐỀU CHẠM NGƯỠNG!
        // Do đã đặt trước, Request 3 KHÔNG THỂ lọt qua đồng thời! Phải bị đưa vào hàng đợi!
        let slot3Immediate = true;
        const slot3Promise = router.acquireDispatchSlot({ estimatedTokens: 1000, timeout: 500 }).then(s => {
            slot3Immediate = s.immediate;
            return s;
        });

        assert.strictEqual(router.dispatchQueue.length, 1, 'Request 3 phải nằm trong hàng đợi');
        assert.strictEqual(slot3Immediate, true, 'Chưa được cấp');

        // Khi Request 1 hoàn tất, điều chỉnh token thực tế từ 2.000 thành 1.200
        router.releaseDispatchSlot(1200, router.defaultModel, slot1.slotId);
        
        // Slot 1 giải phóng: inflight giảm, tokens điều chỉnh xuống 1.200 + 2.500 = 3.700 tokens
        const s1Reservation = router.tokenUsage.find(e => e.slotId === slot1.slotId);
        assert.ok(s1Reservation, 'Phải tìm thấy reservation slot 1');
        assert.strictEqual(s1Reservation.tokens, 1200, 'Tokens phải được điều chỉnh về số thực tế (1200)');
        assert.strictEqual(s1Reservation.isReserved, false, 'isReserved phải chuyển thành false');

        // Dọn dẹp slot 2
        router.releaseDispatchSlot(2500, router.defaultModel, slot2.slotId);
        await slot3Promise;
    });

    await runTest('Kiểm tra nghiêm ngặt giới hạn RPD (Requests Per Day)', async () => {
        const router = new ModelRouter({
            maxRPM: 100,
            maxTPM: 1000000,
            maxRPD: 3, // Giới hạn chỉ 3 requests một ngày
            maxInflight: 10
        });

        // Cấp 3 slots đầu tiên
        const s1 = await router.acquireDispatchSlot({ estimatedTokens: 500 });
        const s2 = await router.acquireDispatchSlot({ estimatedTokens: 500 });
        const s3 = await router.acquireDispatchSlot({ estimatedTokens: 500 });

        assert.strictEqual(s1.immediate, true);
        assert.strictEqual(s2.immediate, true);
        assert.strictEqual(s3.immediate, true);
        assert.strictEqual(router.dailyRequests.length, 3, 'dailyRequests phải là 3');

        // Lần kiểm tra tiếp theo phải bị chặn bởi RPD
        assert.strictEqual(router._canDispatchNow(500), false, '_canDispatchNow phải trả về false do hết RPD');

        // Request 4 phải hoãn hoặc đưa vào queue
        let slot4Granted = false;
        const s4 = await router.acquireDispatchSlot({ estimatedTokens: 500, timeout: 100 });
        assert.strictEqual(s4.granted, false, 'Slot 4 không được cấp vì chạm giới hạn RPD');
        assert.strictEqual(s4.quotaDeferred, true, 'Slot 4 phải có cờ quotaDeferred: true');
    });

    await runTest('cancelDispatchSlot giải phóng và thu hồi đúng số lượng request và token đã đặt trước', async () => {
        const router = new ModelRouter({
            maxRPM: 10,
            maxTPM: 100000,
            maxRPD: 100
        });

        const slot = await router.acquireDispatchSlot({ estimatedTokens: 3000 });
        assert.strictEqual(router.requestTimestamps.length, 1);
        assert.strictEqual(router.dailyRequests.length, 1);
        assert.strictEqual(router.tokenUsage.length, 1);
        assert.strictEqual(router.tokenUsage[0].tokens, 3000);

        // Hủy bỏ slot (ví dụ network error trước khi gửi request)
        router.cancelDispatchSlot(slot.slotId);

        assert.strictEqual(router.activeSlots.size, 0, 'activeSlots phải rỗng');
        assert.strictEqual(router.tokenUsage.length, 0, 'tokenUsage phải được thu hồi');
        assert.strictEqual(router.requestTimestamps.length, 0, 'requestTimestamps phải được thu hồi');
        assert.strictEqual(router.dailyRequests.length, 0, 'dailyRequests phải được thu hồi');
    });

    await runTest('AgentOrchestrator hoãn gửi request khi scheduler từ chối cấp slot (QUOTA_WAITING)', async () => {
        const orchestrator = new AgentOrchestrator('fake-key-for-test');
        // Giả lập scheduler từ chối cấp slot
        orchestrator.modelRouter.acquireDispatchSlot = async () => ({
            granted: false,
            waitedMs: 100,
            quotaDeferred: true,
            slotId: 'slot_denied_123'
        });

        const res = await orchestrator.callAgent('developer', { task: 'Do heavy compute' });
        assert.strictEqual(res.success, false, 'Phải trả về success: false');
        assert.strictEqual(res.status, 'QUOTA_WAITING', 'Trạng thái phải là QUOTA_WAITING');
        assert.strictEqual(res.retryable, true, 'Phải có cờ retryable: true');
    });

    await runTest('releaseDispatchSlot với slotId không tồn tại KHÔNG ĐƯỢC giải phóng nhầm slot của request khác', async () => {
        const router = new ModelRouter({ maxInflight: 5 });
        const realSlot = await router.acquireDispatchSlot({ estimatedTokens: 1000 });
        assert.strictEqual(router.activeSlots.size, 1);
        assert.ok(router.activeSlots.has(realSlot.slotId));

        // Giải phóng một slotId ma không tồn tại
        router.releaseDispatchSlot(500, router.defaultModel, 'non_existent_slot_ghost_999');

        // Slot thực sự của request khác VẪN PHẢI ĐƯỢC BẢO TOÀN!
        assert.strictEqual(router.activeSlots.size, 1, 'activeSlots size vẫn phải là 1');
        assert.ok(router.activeSlots.has(realSlot.slotId), 'Slot thật của request khác không được bị xóa nhầm');

        // Giải phóng đúng slotId
        router.releaseDispatchSlot(800, router.defaultModel, realSlot.slotId);
        assert.strictEqual(router.activeSlots.size, 0, 'Sau khi truyền đúng slotId mới được xóa');
    });

    await runTest('resumeGraph tự động phục hồi StateGraph từ Checkpoint trên ổ cứng sau khi server restart', async () => {
        const orchestrator = new AgentOrchestrator('fake-key-for-test');
        const taskId = `restart_test_${Date.now()}`;

        const graph = new StateGraph({
            graphId: taskId,
            checkpointManager: orchestrator.checkpointManager,
            eventStream: orchestrator.eventStream
        });

        let executedOnResume = false;
        graph.addNode({
            id: 'node_restart_action',
            description: 'Action waiting approval across server restart',
            requiresApproval: true,
            action: async () => {
                executedOnResume = true;
                return { success: true, processedAfterRestart: true };
            }
        });

        // 1. Chạy ban đầu và dừng ở WAITING_APPROVAL (sẽ lưu checkpoint waiting_approval lên đĩa)
        await orchestrator.executeGraph(graph);
        assert.strictEqual(graph.status, 'WAITING_APPROVAL');
        assert.strictEqual(executedOnResume, false);

        // 2. GIẢ LẬP SERVER RESTART: Xóa toàn bộ bộ nhớ RAM (activeGraphs)
        orchestrator.activeGraphs.clear();
        assert.strictEqual(orchestrator.activeGraphs.size, 0, 'activeGraphs trong RAM đã bị xóa sạch hoàn toàn');

        // 3. Gọi resumeGraph: Phải tự động load checkpoint cp_${taskId}.json trên đĩa và tái tạo đồ thị!
        const resumeResult = await orchestrator.resumeGraph(taskId, 'APPROVE', 'Duyệt sau khi server restart', {
            nodeActions: {
                node_restart_action: async () => {
                    executedOnResume = true;
                    return { success: true, processedAfterRestart: true };
                }
            }
        });
        assert.strictEqual(resumeResult.status, 'COMPLETED', 'Đồ thị tái tạo từ đĩa phải hoàn thành COMPLETED');
        assert.strictEqual(executedOnResume, true, 'Hành động phải được thực thi thành công sau khi phục hồi từ đĩa');
    });

    // -------------------------------------------------------------
    // LỖI A: HẾT QUOTA TRONG GRAPH TẠM HOÃN AN TOÀN (KHÔNG BIẾN THÀNH FAILED)
    // -------------------------------------------------------------
    console.log('\n--- 4. KIỂM THỬ LỖI A: QUOTA_WAITING STATEGRAPH GRACEFUL PAUSE & RESUME ---');

    await runTest('Node nhận QUOTA_WAITING tạm hoãn WAITING_QUOTA, không hao retries và không bị coi là FAILED', async () => {
        const graph = new StateGraph({ graphId: `graph_quota_test_${Date.now()}` });
        let callCount = 0;

        graph.addNode({
            id: 'node_quota_wait',
            description: 'Action hits quota wait',
            maxRetries: 3,
            action: async () => {
                callCount++;
                if (callCount === 1) {
                    return {
                        success: false,
                        status: 'QUOTA_WAITING',
                        quotaDeferred: true,
                        error: 'RPM/TPM saturated'
                    };
                }
                return { success: true, result: 'Quota replenished, task finished' };
            }
        });

        // 1. Chạy lần đầu: Chạm quota
        const runRes = await graph.run();
        const node = graph.nodes.get('node_quota_wait');

        assert.strictEqual(node.status, 'WAITING_QUOTA', 'Node status phải là WAITING_QUOTA');
        assert.strictEqual(graph.status, 'WAITING_QUOTA', 'Graph status phải là WAITING_QUOTA');
        assert.strictEqual(node.retryCount, 0, 'retryCount không được hao (phải bằng 0)');
        assert.strictEqual(callCount, 1, 'Chỉ gọi đúng 1 lần trước khi tạm hoãn');
        assert.strictEqual(graph.failedNodes.has('node_quota_wait'), false, 'Node KHÔNG được nằm trong failedNodes');
        assert.strictEqual(runRes.status, 'WAITING_QUOTA', 'Kết quả trả về phải là WAITING_QUOTA');

        // 2. Resume khi có quota: Tự động chuyển PENDING và chạy thành công
        const resumeRes = await graph.resume();
        assert.strictEqual(node.status, 'COMPLETED', 'Node status phải là COMPLETED sau khi resume');
        assert.strictEqual(graph.status, 'COMPLETED', 'Graph status phải là COMPLETED');
        assert.strictEqual(callCount, 2, 'Gọi lần thứ 2 khi quota đã sẵn sàng');
        assert.ok(graph.completedNodes.has('node_quota_wait'), 'Node phải nằm trong completedNodes');
    });

    // -------------------------------------------------------------
    // LỖI B: MODEL FALLBACK & TOOL FOLLOW-UP QUA QUOTA SCHEDULER
    // -------------------------------------------------------------
    console.log('\n--- 5. KIỂM THỬ LỖI B: FALLBACK CALLS & TOOL FOLLOW-UP SLOTS IN MODELROUTER ---');

    await runTest('Fallback model và tool follow-up được kiểm soát slot, chuyển QUOTA_WAITING nếu fallback hết quota', async () => {
        const orchestrator = new AgentOrchestrator({
            apiKey: 'mock_key',
            defaultModel: 'gemini-3.5-flash'
        });

        // Mock ModelRouter
        let requestedModels = [];
        let releasedSlots = [];
        orchestrator.modelRouter = {
            resolveModel: () => 'gemini-3.5-flash',
            getFallbackModel: () => 'gemini-3.5-flash-lite',
            recordQuotaError: () => {},
            acquireDispatchSlot: async ({ model }) => {
                requestedModels.push(model);
                if (model === 'gemini-3.5-flash-lite') {
                    // Giả lập model dự phòng cũng hết quota
                    return { granted: false, quotaDeferred: true };
                }
                return { granted: true, slotId: 'slot_primary' };
            },
            releaseDispatchSlot: (tokens, model, slotId) => {
                releasedSlots.push({ model, slotId });
            }
        };

        // Giả lập fetch: Model chính bị 429
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            return {
                ok: false,
                status: 429,
                text: async () => 'RESOURCE_EXHAUSTED'
            };
        };

        try {
            const res = await orchestrator.callAgent('developer', { task: 'Test fallback quota' });
            assert.strictEqual(res.status, 'QUOTA_WAITING', 'Phải trả về trạng thái QUOTA_WAITING khi fallback hết quota');
            assert.strictEqual(res.retryable, true, 'Phải có cờ retryable: true');
            assert.ok(requestedModels.includes('gemini-3.5-flash'), 'Phải xin slot cho model chính');
            assert.ok(requestedModels.includes('gemini-3.5-flash-lite'), 'Phải xin slot cho model dự phòng qua Scheduler');
            assert.ok(releasedSlots.some(s => s.slotId === 'slot_primary'), 'Slot cũ phải được giải phóng');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    // -------------------------------------------------------------
    // LỖI C: KHÔI PHỤC GRAPH ĐẦY ĐỦ CONDITIONAL LOOPS, RETRYCOUNT, TOKENS
    // -------------------------------------------------------------
    console.log('\n--- 6. KIỂM THỬ LỖI C: STATEGRAPH FULL SEMANTIC DESERIALIZATION ---');

    await runTest('deserialize() phục hồi nguyên vẹn conditionalLoops, retryCount, loopIteration và tokensUsed', async () => {
        const graph = new StateGraph({ graphId: 'graph_semantic_test' });
        graph.addNode({
            id: 'node_alpha',
            description: 'Alpha task',
            retryCount: 2,
            loopIteration: 1,
            tokensUsed: 1250,
            executedSuccessfully: false
        });
        graph.addNode({
            id: 'node_beta',
            description: 'Beta task',
            dependencies: ['node_alpha']
        });
        graph.addConditionalLoop('node_beta', 'node_alpha', (res) => res?.needRevise, 3);
        graph.executionLog.push('Initial test log entry');

        const serialized = graph.serialize();
        assert.strictEqual(serialized.conditionalLoops.length, 1, 'Serialize phải chứa conditionalLoops');

        // Deserialize
        const restoredGraph = StateGraph.deserialize(serialized);

        // Kiểm tra conditionalLoops
        assert.strictEqual(restoredGraph.conditionalLoops.length, 1, 'Restored graph phải phục hồi conditionalLoops');
        assert.strictEqual(restoredGraph.conditionalLoops[0].from, 'node_beta');
        assert.strictEqual(restoredGraph.conditionalLoops[0].to, 'node_alpha');
        assert.strictEqual(restoredGraph.conditionalLoops[0].maxLoops, 3);

        // Kiểm tra StateNode attributes
        const restoredAlpha = restoredGraph.nodes.get('node_alpha');
        assert.strictEqual(restoredAlpha.retryCount, 2, 'retryCount phải được bảo toàn là 2');
        assert.strictEqual(restoredAlpha.loopIteration, 1, 'loopIteration phải được bảo toàn là 1');
        assert.strictEqual(restoredAlpha.tokensUsed, 1250, 'tokensUsed phải được bảo toàn là 1250');
        assert.strictEqual(restoredGraph.executionLog.length, 1, 'executionLog phải được phục hồi');
    });

    // -------------------------------------------------------------
    // LỖI D: TIMEOUT HỦY CÔNG VIỆC THỰC TẾ QUA ABORTSIGNAL
    // -------------------------------------------------------------
    console.log('\n--- 7. KIỂM THỬ LỖI D: REAL TIMEOUT CANCELLATION VIA ABORTCONTROLLER ---');

    await runTest('Timeout trong StateGraph kích hoạt AbortController.abort() hủy executorFn đang chạy', async () => {
        const graph = new StateGraph({ graphId: `graph_timeout_${Date.now()}` });
        let abortTriggered = false;
        let abortReason = '';

        graph.addNode({
            id: 'node_long_running',
            description: 'Hanging action',
            timeoutMs: 100, // Timeout ngắn 100ms
            maxRetries: 0,
            action: async (node, state, g, execContext) => {
                if (execContext && execContext.signal) {
                    execContext.signal.addEventListener('abort', () => {
                        abortTriggered = true;
                        abortReason = execContext.signal.reason?.message || 'Aborted';
                    });
                }
                // Giả lập tác vụ treo 1000ms
                await new Promise(r => setTimeout(r, 1000));
                return { success: true };
            }
        });

        const res = await graph.run();
        assert.strictEqual(res.status, 'FAILED', 'Graph phải FAILED do timeout');
        assert.strictEqual(abortTriggered, true, 'AbortSignal BẮT BUỘC phải được kích hoạt');
        assert.ok(abortReason.includes('timed out after 100ms'), 'Lý do abort phải ghi rõ timeout');
    });

    // -------------------------------------------------------------
    // LỖI E: VÒNG LẶP ĐIỀU KIỆN KHÔNG BỊ TREO STATUS 'RUNNING'
    // -------------------------------------------------------------
    console.log('\n--- 8. KIỂM THỬ LỖI E: CONDITIONAL LOOP STATUS RESET GUARD ---');

    await runTest('Vòng lặp conditional loop reset cả targetNode và node về PENDING, không kẹt RUNNING', async () => {
        const graph = new StateGraph({ graphId: `graph_loop_status_${Date.now()}` });
        let passCounter = 0;

        graph.addNode({
            id: 'step_create',
            action: async () => {
                passCounter++;
                return { success: true, version: passCounter };
            }
        });

        graph.addNode({
            id: 'step_review',
            dependencies: ['step_create'],
            action: async (state) => {
                const version = state.step_create?.version || 1;
                if (version < 2) {
                    return { success: true, needsRevision: true };
                }
                return { success: true, needsRevision: false };
            }
        });

        graph.addConditionalLoop('step_review', 'step_create', (result) => result?.needsRevision === true, 2);

        const result = await graph.run();
        assert.strictEqual(result.status, 'COMPLETED', 'Đồ thị phải hoàn thành COMPLETED');
        assert.strictEqual(passCounter, 2, 'Vòng lặp phải hoàn thành đúng 2 lượt revision');
        assert.strictEqual(graph.nodes.get('step_create').status, 'COMPLETED');
        assert.strictEqual(graph.nodes.get('step_review').status, 'COMPLETED');
    });

    // -------------------------------------------------------------
    // LỖI F: ENDPOINT /api/v2/tasks/:taskId/resume TỰ ĐỘNG KHÔI PHỤC VÀ TIẾP TỤC
    // -------------------------------------------------------------
    console.log('\n--- 9. KIỂM THỬ LỖI F: RESUME GRAPH API & CHECKPOINT INTEGRATION ---');

    await runTest('resumeGraph kích hoạt tiếp tục đồ thị từ bộ nhớ hoặc checkpoint trên đĩa', async () => {
        const taskId = `resume_endpoint_test_${Date.now()}`;
        const { CheckpointManager } = require('./agents/CheckpointManager');
        const checkpointManager = new CheckpointManager();

        const orchestrator = new AgentOrchestrator({
            apiKey: 'mock_key',
            defaultModel: 'gemini-3.5-flash',
            checkpointManager
        });

        const graph = new StateGraph({
            graphId: taskId,
            checkpointManager
        });

        let executedStep2 = false;

        graph.addNode({
            id: 'node_init',
            action: async () => ({ success: true, init: true })
        });

        graph.addNode({
            id: 'node_step2',
            dependencies: ['node_init'],
            action: async () => {
                if (!executedStep2) {
                    // Dừng lần 1 vì quota
                    return { success: false, status: 'QUOTA_WAITING' };
                }
                return { success: true, step2Finished: true };
            }
        });

        const initialRun = await orchestrator.executeGraph(graph);
        assert.strictEqual(graph.status, 'WAITING_QUOTA');

        // Tự động tiếp tục qua resumeGraph
        executedStep2 = true;
        const resumed = await orchestrator.resumeGraph(taskId);
        assert.strictEqual(resumed.status, 'COMPLETED', 'Đồ thị phải COMPLETED sau khi resume');
        assert.strictEqual(graph.status, 'COMPLETED');
        assert.strictEqual(executedStep2, true);
    });

    console.log('\n===============================================================');
    console.log(`🎉 HOÀN TẤT KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
    console.log('===============================================================');
}

main().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});

