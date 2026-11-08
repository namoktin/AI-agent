/**
 * test_tier4_update18_core.js
 * Cyber Agent Pro v5.5 - Update 18 (Tier 4 Core Architecture)
 * 
 * Comprehensive Unit & Integration Test Suite for:
 * 1. True Conditional Branching & Dynamic Path Pruning in StateGraph
 * 2. Serializable Graph State & Transition Registry
 * 3. Strict IndependentVerifier 2.0 (Zero fake-pass, Anti-circular Claim Checking)
 * 4. Zero-Based Fast Response Grounding
 * 5. Atomic Checkpoints & Crash Resilience
 * 6. Multi-Strategy Self-Healing & Targeted Diagnosis
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { StateGraph, StateNode } = require('../agents/StateGraph');
const { IndependentVerifier } = require('../agents/IndependentVerifier');
const { CheckpointManager } = require('../agents/CheckpointManager');
const { AdaptivePlanner } = require('../agents/AdaptivePlanner');

async function runTests() {
    console.log('===============================================================');
    console.log('🧪 SUITE 9: UPDATE 18 TIER 4 CORE ARCHITECTURE & AUDIT VERIFICATION');
    console.log('===============================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    // -------------------------------------------------------------
    // TEST 1: TRUE CONDITIONAL BRANCHING & SKIPPED NODE CASCADE
    // -------------------------------------------------------------
    console.log('--- PHẦN 1: TRUE CONDITIONAL GRAPH ENGINE (addBranch) ---');
    {
        totalTests++;
        const graph = new StateGraph({
            id: 'test_branch_graph_yes',
            enableCheckpoints: false
        });

        let yesRan = false;
        let noRan = false;
        let joinRan = false;

        graph.addNode({
            id: 'decision',
            action: async (input, state) => {
                state.approved = true;
                return { success: true, approved: true };
            }
        });

        graph.addNode({
            id: 'yes_branch',
            dependencies: ['decision'],
            action: async (input, state) => {
                yesRan = true;
                state.branchTaken = 'YES';
                return { success: true, branch: 'YES' };
            }
        });

        graph.addNode({
            id: 'no_branch',
            dependencies: ['decision'],
            action: async (input, state) => {
                noRan = true;
                state.branchTaken = 'NO';
                return { success: true, branch: 'NO' };
            }
        });

        graph.addNode({
            id: 'join_node',
            dependencies: ['yes_branch', 'no_branch'],
            action: async (input, state) => {
                joinRan = true;
                return { success: true, final: 'JOIN_DONE' };
            }
        });

        // Add conditional branch: only approved === true goes to yes_branch
        graph.addBranch('decision', [
            {
                target: 'yes_branch',
                condition: (state) => state.approved === true,
                conditionId: 'is_approved_true'
            },
            {
                target: 'no_branch',
                condition: (state) => state.approved === false,
                conditionId: 'is_approved_false'
            }
        ]);

        const result = await graph.execute({ approved: true });

        assert.strictEqual(result.status, 'COMPLETED', 'Graph execution status must be COMPLETED');
        assert.strictEqual(yesRan, true, 'YES branch must be executed when approved === true');
        assert.strictEqual(noRan, false, 'NO branch must NEVER execute when approved === true');
        assert.strictEqual(joinRan, true, 'Join node must execute because inactive NO branch is SKIPPED');
        assert.ok(graph.completedNodes.has('yes_branch'), 'yes_branch must be in completedNodes');
        assert.ok(graph.skippedNodes.has('no_branch'), 'no_branch must be marked SKIPPED');
        assert.ok(graph.completedNodes.has('join_node'), 'join_node must be in completedNodes');

        passedTests++;
        console.log('✅ [TEST 1] PASS: addBranch() kích hoạt ĐÚNG nhánh thỏa mãn (YES) và TỰ BỎ QUA nhánh sai (NO), Join node tiếp tục chạy bình thường');
    }

    {
        totalTests++;
        const graph = new StateGraph({
            id: 'test_branch_graph_no',
            enableCheckpoints: false
        });

        let yesRan = false;
        let noRan = false;
        let joinRan = false;

        graph.addNode({
            id: 'decision',
            action: async (input, state) => {
                state.approved = false;
                return { success: true, approved: false };
            }
        });

        graph.addNode({
            id: 'yes_branch',
            dependencies: ['decision'],
            action: async (input, state) => { yesRan = true; return { success: true }; }
        });

        graph.addNode({
            id: 'no_branch',
            dependencies: ['decision'],
            action: async (input, state) => { noRan = true; return { success: true }; }
        });

        graph.addNode({
            id: 'join_node',
            dependencies: ['yes_branch', 'no_branch'],
            action: async (input, state) => { joinRan = true; return { success: true }; }
        });

        graph.addBranch('decision', [
            {
                target: 'yes_branch',
                condition: (state) => state.approved === true,
                conditionId: 'is_approved_true'
            },
            {
                target: 'no_branch',
                condition: (state) => state.approved === false,
                conditionId: 'is_approved_false'
            }
        ]);

        const result = await graph.execute({ approved: false });

        assert.strictEqual(result.status, 'COMPLETED', 'Graph execution status must be COMPLETED');
        assert.strictEqual(yesRan, false, 'YES branch must NOT execute when approved === false');
        assert.strictEqual(noRan, true, 'NO branch must execute when approved === false');
        assert.strictEqual(joinRan, true, 'Join node must execute successfully');
        assert.ok(graph.skippedNodes.has('yes_branch'), 'yes_branch must be marked SKIPPED');
        assert.ok(graph.completedNodes.has('no_branch'), 'no_branch must be in completedNodes');

        passedTests++;
        console.log('✅ [TEST 2] PASS: addBranch() đảo nhánh chuẩn xác khi approved === false (NO chạy, YES bị skip)');
    }

    // -------------------------------------------------------------
    // TEST 3: SERIALIZE & DESERIALIZE WITH TRANSITION REGISTRY
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 2: SERIALIZATION & TRANSITION REGISTRY RECOVERY ---');
    {
        totalTests++;

        // 1. Register named condition
        StateGraph.registerCondition('check_score_high', (state) => (state.score || 0) >= 80);
        StateGraph.registerCondition('check_score_low', (state) => (state.score || 0) < 80);

        const original = new StateGraph({ id: 'serialize_test_graph' });
        original.addNode({ id: 'eval', action: async (inp, st) => ({ score: st.score }) });
        original.addNode({ id: 'pass_path', dependencies: ['eval'], action: async () => ({ status: 'PASS' }) });
        original.addNode({ id: 'fail_path', dependencies: ['eval'], action: async () => ({ status: 'FAIL' }) });

        original.addBranch('eval', [
            { target: 'pass_path', conditionId: 'check_score_high' },
            { target: 'fail_path', conditionId: 'check_score_low' }
        ]);

        // Serialize
        const serialized = original.serialize();
        assert.ok(serialized.edges.some(e => e.conditionId === 'check_score_high'), 'ConditionId must be serialized');

        // Deserialize
        const restored = StateGraph.deserialize(serialized, {
            eval: async (inp, st) => ({ score: st.score }),
            pass_path: async (inp, st) => { st.path = 'PASS'; return { status: 'PASS' }; },
            fail_path: async (inp, st) => { st.path = 'FAIL'; return { status: 'FAIL' }; }
        });

        // Execute restored graph with score = 95
        const res = await restored.execute({ score: 95 });
        assert.strictEqual(res.status, 'COMPLETED', 'Restored execution status must be COMPLETED');
        assert.ok(restored.completedNodes.has('pass_path'), 'Restored graph must execute pass_path');
        assert.ok(restored.skippedNodes.has('fail_path'), 'Restored graph must skip fail_path');

        passedTests++;
        console.log('✅ [TEST 3] PASS: serialize() & deserialize() bảo tồn đầy đủ logic rẽ nhánh qua Transition Registry');
    }

    // -------------------------------------------------------------
    // TEST 4: STRICT INDEPENDENT VERIFIER 2.0 (ANTI-FAKE PASS)
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 3: STRICT INDEPENDENT VERIFIER 2.0 ---');
    {
        totalTests++;
        const verifier = new IndependentVerifier(path.resolve(__dirname, '..'));

        // Test unknown / unsupported criterion: MUST NOT AUTOMATICALLY PASS!
        const nodeWithUnknownCriteria = {
            id: 'node_unknown',
            acceptanceCriteria: ['quantum_supremacy_teleportation_verified']
        };
        const auditUnknown = await verifier.verifyNodeOutput(nodeWithUnknownCriteria, {
            response: 'Here is some content'
        });

        assert.strictEqual(auditUnknown.passed, false, 'Unknown criteria MUST NOT pass');
        assert.ok(auditUnknown.evidence.checks.some(c => c.type === 'acceptance_criterion' && !c.passed && c.details.includes('unsupported or unhandled')), 'Must cite unsupported criterion');

        // Test circular claim verification: NEVER validate text using text itself!
        const nodeWithClaimsCriteria = {
            id: 'node_claims',
            acceptanceCriteria: ['claims']
        };
        const auditCircular = await verifier.verifyNodeOutput(nodeWithClaimsCriteria, {
            response: 'Doanh thu năm 2026 tăng 85% đạt 50 triệu USD theo số liệu báo cáo.',
            sources: [] // No external sources!
        });

        assert.strictEqual(auditCircular.passed, false, 'Claims criterion without external sources must fail');

        // Test valid claims with external source
        const auditValid = await verifier.verifyNodeOutput(nodeWithClaimsCriteria, {
            response: 'Doanh thu năm 2026 tăng 85% đạt 50 triệu USD theo số liệu báo cáo.',
            sources: ['Báo cáo tài chính năm 2026 xác nhận tăng 85% đạt 50 triệu USD doanh thu.']
        });
        assert.strictEqual(auditValid.passed, true, 'Claims with valid external evidence must pass');

        passedTests++;
        console.log('✅ [TEST 4] PASS: IndependentVerifier từ chối tiêu chí lạ (Anti-Fake Pass) và ngăn chặn xác minh tự thân (Anti-Circular Validation)');
    }

    // -------------------------------------------------------------
    // TEST 5: ZERO-BASED FAST RESPONSE GROUNDING
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 4: ZERO-BASED FAST RESPONSE GROUNDING ---');
    {
        totalTests++;
        const verifier = new IndependentVerifier(path.resolve(__dirname, '..'));

        // Empty / Refusal response
        const refusalResp = 'Tôi là AI và tôi không thể hỗ trợ yêu cầu này của bạn xin lỗi.';
        const auditRefusal = verifier.verifyFastResponse('Tính toán GMV 2026', refusalResp);
        assert.strictEqual(auditRefusal.passed, false, 'Refusal response must fail');
        assert.ok(auditRefusal.score <= 25, `Refusal score must be capped <= 25 (actual: ${auditRefusal.score})`);

        // Substantive grounded response
        const groundedResp = `### Báo Cáo Phân Tích GMV Năm 2026
1. Quy mô thị trường: Đạt 15.4 tỷ USD, tăng trưởng 28.5% so với năm 2025.
2. Cơ cấu ngành:
- Thương mại điện tử: 8.2 tỷ USD (chiếm 53.2%)
- Dịch vụ số & SaaS: 4.1 tỷ USD (chiếm 26.6%)
- Dịch vụ hậu cần: 3.1 tỷ USD (chiếm 20.2%)
3. Kết luận: Điểm hòa vốn biên lợi nhuận ròng đạt mốc 36.8%.`;

        const auditGrounded = verifier.verifyFastResponse('Phân tích GMV 2026', groundedResp);
        assert.strictEqual(auditGrounded.passed, true, 'Substantive response with data and structure must pass');
        assert.ok(auditGrounded.score >= 80, `Grounded score must earn >= 80 (actual: ${auditGrounded.score})`);

        passedTests++;
        console.log('✅ [TEST 5] PASS: verifyFastResponse() tính điểm từ 0 (Zero-based), bắt chính xác từ chối và tưởng thưởng nội dung có số liệu thực chứng');
    }

    // -------------------------------------------------------------
    // TEST 6: ATOMIC CHECKPOINT WRITING
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 5: ATOMIC CHECKPOINTS & RESILIENCE ---');
    {
        totalTests++;
        const cpManager = new CheckpointManager();
        const testTaskId = `atomic_test_${Date.now()}`;

        const saved = cpManager.saveCheckpoint(testTaskId, 'data_ingestion', { records: 1500, status: 'DONE' });
        assert.strictEqual(saved, true, 'Checkpoint save must return true');

        // Verify loaded checkpoint
        const loaded = cpManager.loadCheckpoint(testTaskId);
        assert.ok(loaded !== null, 'Loaded checkpoint must not be null');
        assert.strictEqual(loaded.taskId, testTaskId);
        assert.strictEqual(loaded.lastStage, 'data_ingestion');
        assert.strictEqual(loaded.stageData.data_ingestion.records, 1500);

        // Verify no leftover .tmp files
        const cpDir = cpManager.checkpointDir;
        const tmpFiles = fs.readdirSync(cpDir).filter(f => f.includes(testTaskId) && f.includes('.tmp'));
        assert.strictEqual(tmpFiles.length, 0, 'No leftover temporary files should exist after atomic rename');

        // Cleanup
        cpManager.clearCheckpoint(testTaskId);
        assert.strictEqual(cpManager.loadCheckpoint(testTaskId), null, 'Checkpoint must be deleted on clear');

        passedTests++;
        console.log('✅ [TEST 6] PASS: CheckpointManager ghi nguyên tử (Atomic write & rename), không để lại rác file tạm');
    }

    // -------------------------------------------------------------
    // TEST 7: MULTI-STRATEGY SELF-HEALING DIAGNOSIS
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 6: MULTI-STRATEGY SELF-HEALING DIAGNOSIS ---');
    {
        totalTests++;
        const planner = new AdaptivePlanner();

        const plan = {
            tasks: [
                { id: 'T001', description: 'Cào dữ liệu và phân tích chỉ số tài chính', assignedTo: 'developer' }
            ]
        };

        // Failure 1: Timeout latency bottleneck
        const replanTimeout = planner.replan(plan.tasks[0], 'ETIMEDOUT: Connection exceeded 60000ms latency', plan, 'Yêu cầu');
        const recoveryTimeout = replanTimeout.tasks.find(t => t.isRecovery);
        assert.ok(recoveryTimeout, 'Must generate recovery task');
        assert.strictEqual(recoveryTimeout.diagnosticCategory, 'TIMEOUT_LATENCY_BOTTLENECK');
        assert.ok(recoveryTimeout.timeoutMs >= 90000, 'Timeout budget should be expanded');

        // Failure 2: Syntax / Compilation error
        const replanSyntax = planner.replan(plan.tasks[0], 'SyntaxError: Unexpected token < in JSON at position 0', plan, 'Yêu cầu');
        const recoverySyntax = replanSyntax.tasks.find(t => t.isRecovery);
        assert.ok(recoverySyntax, 'Must generate recovery task');
        assert.strictEqual(recoverySyntax.assignedTo, 'developer', 'Syntax error must be routed to developer');
        assert.ok(recoverySyntax.acceptanceCriteria.includes('syntax'), 'Must include syntax verification criterion');

        passedTests++;
        console.log('✅ [TEST 7] PASS: AdaptivePlanner chẩn đoán đa chiến lược (Multi-Strategy Diagnosis), tự động phân bổ đúng vai trò và tiêu chí nghiệm thu');
    }

    console.log('\n===============================================================');
    console.log(`🏁 TẤT CẢ ${passedTests}/${totalTests} BÀI TEST SUITE 9 ĐẠT HOÀN HẢO (100%)`);
    console.log('===============================================================');
}

runTests().catch(err => {
    console.error('💥 Test Suite 9 Error:', err);
    process.exit(1);
});
