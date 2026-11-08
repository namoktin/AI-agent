/**
 * test_tier4_update19_hardening.js
 * Cyber Agent Pro v5.5 - Update 19 (Tier 4 Hardening & Resilience)
 * 
 * Verifies all 5 core technical audit items:
 * 1. Persistent Condition Registry & Cold Process Restart Simulation
 * 2. StateNode Runtime Condition Serialization & Restoration
 * 3. Strict addConditionalEdge() Rejection of Missing Predicates (No Unconditional Fallback)
 * 4. End-to-End Self-Healing Cycle (Node Failure -> Replan -> Recovery -> Graph COMPLETED)
 * 5. IndependentVerifier 3.0 Provenance & Concept Alignment Guard
 * 6. CheckpointManager Dual-Buffer Backup Recovery on Corrupt Primary
 * 7. Dynamic Open-Ended DAG Synthesis for Novel Requests
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { StateGraph, StateNode } = require('../agents/StateGraph');
const { globalConditionRegistry } = require('../agents/StateGraphConditions');
const { IndependentVerifier } = require('../agents/IndependentVerifier');
const { CheckpointManager } = require('../agents/CheckpointManager');
const { AdaptivePlanner } = require('../agents/AdaptivePlanner');

async function runTests() {
    console.log('===============================================================');
    console.log('🧪 SUITE 10: UPDATE 19 TIER 4 HARDENING & TRUE RESILIENCE');
    console.log('===============================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    // -------------------------------------------------------------
    // TEST 1: SERVER RESTART EMULATION (COLD REGISTRY RECOVERY)
    // -------------------------------------------------------------
    console.log('--- PHẦN 1: SIMULATED SERVER RESTART & PERSISTENT CONDITION REGISTRY ---');
    {
        totalTests++;

        // Register with persistent descriptor
        StateGraph.registerCondition('cold_test_metric_gt_50', (state) => (state.metric || 0) > 50, {
            type: 'expression',
            expr: '(state.metric || 0) > 50'
        });

        const graph = new StateGraph({ id: 'cold_restart_graph' });
        graph.addNode({ id: 'source', action: async (i, s) => ({ success: true, metric: 85 }) });
        graph.addNode({ id: 'target', dependencies: ['source'], action: async () => ({ success: true, executed: true }) });
        graph.addConditionalEdge('source', 'target', null, 'cold_test_metric_gt_50');

        const serialized = graph.serialize();

        // SIMULATE COLD PROCESS RESTART: Clear in-memory Map completely!
        StateGraph.conditionRegistry.clear();
        assert.strictEqual(StateGraph.conditionRegistry.has('cold_test_metric_gt_50'), false, 'In-memory static registry must be wiped');

        // Deserialize with fresh process condition resolution
        const restored = StateGraph.deserialize(serialized);
        assert.ok(restored.edges.some(e => e.conditionId === 'cold_test_metric_gt_50'), 'Edge conditionId must be restored');

        // Execute restored graph
        const res = await restored.execute({ metric: 85 });
        assert.strictEqual(res.status, 'COMPLETED', 'Restored graph must complete successfully after simulated cold restart');
        assert.ok(restored.completedNodes.has('target'), 'Target node must execute via persisted condition');

        passedTests++;
        console.log('✅ [TEST 1] PASS: Giả lập khởi động lại máy chủ (xóa sạch RAM), Registry bền vững tự nạp lại và thực thi chuẩn xác điều kiện rẽ nhánh');
    }

    // -------------------------------------------------------------
    // TEST 2: STATENODE CONDITION SERIALIZATION & RUNTIME CHECK
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 2: STATENODE RUNTIME CONDITION SERIALIZATION ---');
    {
        totalTests++;

        const original = new StateGraph({ id: 'node_condition_graph' });
        original.addNode({
            id: 'guarded_node',
            conditionId: 'is_approved_true',
            action: async () => ({ success: true, guardedDone: true })
        });

        const serialized = original.serialize();
        assert.strictEqual(serialized.nodes[0].conditionId, 'is_approved_true', 'StateNode conditionId must be preserved in toJSON()');

        // Deserialize
        const restored = StateGraph.deserialize(serialized);
        const node = restored.nodes.get('guarded_node');
        assert.strictEqual(node.conditionId, 'is_approved_true', 'conditionId must be restored on StateNode');

        // Verify canExecute with condition: false when not approved, true when approved
        assert.strictEqual(node.canExecute(new Set(), { approved: false }), false, 'Node condition must block execution when condition predicate is false');
        assert.strictEqual(node.canExecute(new Set(), { approved: true }), true, 'Node condition must permit execution when condition predicate is true');

        passedTests++;
        console.log('✅ [TEST 2] PASS: StateNode toJSON() và canExecute() bảo tồn trọn vẹn conditionId qua chu trình serialize/deserialize');
    }

    // -------------------------------------------------------------
    // TEST 3: STRICT CONDITIONAL EDGE REJECTION (NO SILENT FALLBACK)
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 3: STRICT CONDITIONAL EDGE (ZERO SILENT FALLBACK) ---');
    {
        totalTests++;

        const graph = new StateGraph({ id: 'strict_edge_graph' });
        graph.addNode({ id: 'n1' });
        graph.addNode({ id: 'n2' });

        let threwError = false;
        try {
            // Attempt to add conditional edge with missing / unresolvable condition
            graph.addConditionalEdge('n1', 'n2', null, 'completely_unknown_predicate_12345');
        } catch (e) {
            threwError = true;
            assert.ok(e.message.includes('requires a valid condition function or registered conditionId'), 'Error message must explain requirement');
        }

        assert.strictEqual(threwError, true, 'addConditionalEdge MUST throw an Error when predicate is missing, never silently fallback to unconditional edge');

        passedTests++;
        console.log('✅ [TEST 3] PASS: addConditionalEdge() từ chối âm thầm biến thành cạnh vô điều kiện, chủ động ném lỗi khi thiếu hàm điều kiện');
    }

    // -------------------------------------------------------------
    // TEST 4: END-TO-END SELF-HEALING CYCLE WITHOUT GHOST FAILS
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 4: END-TO-END SELF-HEALING CYCLE (TRUE SUCCESS) ---');
    {
        totalTests++;

        const graph = new StateGraph({ id: 'healing_cycle_graph', enableCheckpoints: false });

        let failAttempt = 0;
        graph.addNode({
            id: 'unstable_node',
            maxRetries: 0,
            action: async () => {
                failAttempt++;
                throw new Error('Database connection failed abruptly');
            }
        });

        graph.addNode({
            id: 'downstream_node',
            dependencies: ['unstable_node'],
            action: async () => ({ success: true, downstreamDone: true })
        });

        // Run graph -> unstable_node fails
        const initialRes = await graph.execute();
        assert.strictEqual(initialRes.status, 'FAILED');
        assert.ok(graph.failedNodes.has('unstable_node'), 'unstable_node must be in failedNodes');

        // Trigger dynamic replan with recovery node
        const recoveryNode = graph.replan('unstable_node', {
            description: 'Fallback memory cache query',
            action: async () => ({ success: true, recoveredData: [1, 2, 3] })
        });

        assert.ok(recoveryNode, 'Recovery node must be created');
        assert.strictEqual(graph.failedNodes.has('unstable_node'), false, 'Failed node must be removed from failedNodes');
        assert.ok(graph.recoveredNodes.has('unstable_node'), 'Failed node must be recorded in recoveredNodes');

        // Resume graph execution
        const healedRes = await graph.resume();
        assert.strictEqual(healedRes.status, 'COMPLETED', 'Graph MUST complete with status COMPLETED after successful recovery');
        assert.ok(graph.completedNodes.has(recoveryNode.id), 'Recovery node must be completed');
        assert.ok(graph.completedNodes.has('downstream_node'), 'Downstream node must be completed');

        passedTests++;
        console.log('✅ [TEST 4] PASS: Chu trình Self-Healing trọn vẹn: Node lỗi -> Replan -> Chạy Recovery -> Đồ thị hoàn tất thành công (status: COMPLETED)');
    }

    // -------------------------------------------------------------
    // TEST 5: INDEPENDENT VERIFIER 3.0 PROVENANCE & CONCEPT GUARD
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 5: INDEPENDENT VERIFIER 3.0 PROVENANCE & ENTAILMENT ---');
    {
        totalTests++;
        const verifier = new IndependentVerifier(path.resolve(__dirname, '..'));

        // 1. Rejection of unprovenanced string sources
        const nodeClaims = { id: 'node_claims', acceptanceCriteria: ['claims'] };
        const auditNoProvenance = await verifier.verifyNodeOutput(nodeClaims, {
            response: 'Tỷ lệ tăng trưởng 45% ở 120 đơn vị năm 2026.',
            sources: ['Chuỗi văn bản trôi nổi không có URL DOI hay tệp tin']
        });
        assert.strictEqual(auditNoProvenance.passed, false, 'Unprovenanced source string must fail claims audit');

        // 2. Acceptance of source with verifiable document provenance
        const auditWithDoc = await verifier.verifyNodeOutput(nodeClaims, {
            response: 'Tỷ lệ tăng trưởng 45% ở 120 đơn vị năm 2026.',
            sources: [{ documentId: 'GOV-STAT-2026', text: 'Tỷ lệ tăng trưởng 45% ở 120 đơn vị năm 2026 theo cục thống kê.' }]
        });
        assert.strictEqual(auditWithDoc.passed, true, 'Source with verifiable document ID provenance must pass');

        // 3. Fast response anti-fluff topic alignment
        const offTopicResp = '### Khảo sát Thiên Văn Học\n1. Các hố đen vũ trụ có khối lượng 1000 Mặt Trời.\n2. Bức xạ Hawking phát ra 45 nm.';
        const auditOffTopic = verifier.verifyFastResponse('Hỏi về chiến lược Dropshipping TikTok Shop 2026', offTopicResp);
        assert.strictEqual(auditOffTopic.passed, false, 'Off-topic response must fail fast response verification despite length/entities');

        passedTests++;
        console.log('✅ [TEST 5] PASS: Verifier 3.0 yêu cầu căn cước nguồn (Provenance Guard) và phát hiện văn bản lệch chủ đề (Anti-Fluff Alignment)');
    }

    // -------------------------------------------------------------
    // TEST 6: DUAL-BUFFER CHECKPOINT RECOVERY ON CORRUPT PRIMARY
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 6: DUAL-BUFFER CHECKPOINT RECOVERY ON CORRUPT PRIMARY ---');
    {
        totalTests++;
        const cpManager = new CheckpointManager();
        const testTaskId = `resilient_test_${Date.now()}`;

        // Save stage 1 then stage 2 to establish backup .bak
        cpManager.saveCheckpoint(testTaskId, 'stage_1', { step: 1, data: 'intact_1' });
        cpManager.saveCheckpoint(testTaskId, 'stage_2', { step: 2, data: 'intact_2' });

        const filePath = cpManager.getCheckpointPath(testTaskId);
        const bakPath = `${filePath}.bak`;
        assert.ok(fs.existsSync(bakPath), 'Backup .bak file must exist');

        // SIMULATE CRASH: Corrupt primary file with truncated invalid JSON
        fs.writeFileSync(filePath, '{"taskId": "broken_truncated_json...', 'utf8');

        // Load checkpoint: must cleanly recover from .bak!
        const recovered = cpManager.loadCheckpoint(testTaskId);
        assert.ok(recovered !== null, 'Corrupt checkpoint must be automatically recovered from .bak');
        assert.strictEqual(recovered.taskId, testTaskId);
        assert.ok(recovered.completedStages.includes('stage_1'), 'Recovered checkpoint must contain intact stage data');

        // Cleanup
        cpManager.clearCheckpoint(testTaskId);
        assert.strictEqual(fs.existsSync(filePath), false);
        assert.strictEqual(fs.existsSync(bakPath), false);

        passedTests++;
        console.log('✅ [TEST 6] PASS: CheckpointManager tự động phục hồi từ tệp đệm .bak khi tệp chính bị hỏng/cắt cụt do mất nguồn đột ngột');
    }

    // -------------------------------------------------------------
    // TEST 7: DYNAMIC OPEN-ENDED DAG SYNTHESIS
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 7: DYNAMIC OPEN-ENDED DAG SYNTHESIS ---');
    {
        totalTests++;
        const planner = new AdaptivePlanner();

        const query = 'Nghiên cứu thị trường pin mặt trời perovskite, viết script Python tính toán hiệu suất quang điện và xuất biểu đồ CSV';
        const dynamicPlan = planner.synthesizeDynamicDag(query);

        assert.strictEqual(dynamicPlan.isDynamicDag, true, 'Must flag as dynamic DAG');
        assert.ok(dynamicPlan.tasks.length >= 2, 'Must synthesize at least 2 structured stages');

        const researchTask = dynamicPlan.tasks.find(t => t.assignedTo === 'researcher');
        const devTask = dynamicPlan.tasks.find(t => t.assignedTo === 'developer');

        assert.ok(researchTask, 'Must synthesize research stage');
        assert.ok(devTask, 'Must synthesize execution stage');
        assert.ok(devTask.dependencies.includes(researchTask.id), 'Execution stage must depend on research stage');
        assert.ok(devTask.acceptanceCriteria.includes('executable_code'), 'Execution stage must require executable code');

        passedTests++;
        console.log('✅ [TEST 7] PASS: AdaptivePlanner tự suy luận và thiết kế đồ thị DAG tùy biến (Dynamic DAG Synthesis) cho nhiệm vụ chưa từng gặp');
    }

    console.log('\n===============================================================');
    console.log(`🏁 TẤT CẢ ${passedTests}/${totalTests} BÀI TEST SUITE 10 ĐẠT HOÀN HẢO (100%)`);
    console.log('===============================================================');
}

runTests().catch(err => {
    console.error('💥 Test Suite 10 Error:', err);
    process.exit(1);
});
