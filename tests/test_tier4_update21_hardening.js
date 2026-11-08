/**
 * test_tier4_update21_hardening.js
 * Cyber Agent Pro v5.8 - Update 21 (Full Production Resilience & Strict Dynamic DAG StateGraph)
 * 
 * Verifies all 5 core technical audit items:
 * 1. True Cold Restart with Real Action Execution & Physical Artifact Verification
 * 2. Dynamic DAG Full StateGraph Runtime Integration (shouldUseGraph & Checkpoints)
 * 3. Evidence Verifier Hardening: Zero False-Positive Research Claim Bypasses
 * 4. Strict DAG Validation: Missing Dependency Rejection & Topological Fail-Fast
 * 5. Condition DSL Schema Hardening: Empty NOT Rejection & Operator Whitelist
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { StateGraph, StateNode } = require('../agents/StateGraph');
const { safeEvaluateDsl, validateDslDescriptor } = require('../agents/StateGraphConditions');
const { IndependentVerifier } = require('../agents/IndependentVerifier');
const { AdaptivePlanner } = require('../agents/AdaptivePlanner');
const { AgentOrchestrator } = require('../agents/AgentOrchestrator');

async function runTests() {
    console.log('===============================================================');
    console.log('🧪 SUITE 12: UPDATE 22 HARDENED CRASH RECOVERY & TRUE STATEGRAPH DAG');
    console.log('===============================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    // -------------------------------------------------------------
    // TEST 1: TRUE TWO-PROCESS CRASH SIMULATION & HARDENED ARTIFACT RECOVERY (P0)
    // -------------------------------------------------------------
    console.log('--- PHẦN 1: TRUE TWO-PROCESS CRASH & ARTIFACT RECOVERY ---');
    {
        totalTests++;

        const tmpDir = path.resolve(__dirname, '..', 'memory');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const checkpointFile = path.join(tmpDir, 'test_two_proc_checkpoint.json');
        const traceFile = path.join(tmpDir, 'test_two_proc_trace.json');
        const outFile = path.join(tmpDir, 'test_two_proc_out.json');
        const artifactPath = path.join(tmpDir, 'final_recovery_artifact.json');

        // Cleanup stale test files
        try { fs.unlinkSync(checkpointFile); } catch (_) {}
        try { fs.unlinkSync(traceFile); } catch (_) {}
        try { fs.unlinkSync(outFile); } catch (_) {}
        try { fs.unlinkSync(artifactPath); } catch (_) {}

        // STEP 1: Launch Process A (runs Node 1 & 2, checkpoints at Node 3, abruptly crashes with code 99)
        const crashPath = path.resolve(__dirname, 'helpers', 'crash_process_a.js');
        const childA = spawn(process.execPath, [crashPath, checkpointFile, traceFile], {
            cwd: path.resolve(__dirname, '..'),
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const exitCodeA = await new Promise((resolve) => childA.on('close', (code) => resolve(code)));
        assert.strictEqual(exitCodeA, 99, 'Process A must deliberately terminate with crash exit code 99');
        assert.ok(fs.existsSync(checkpointFile), 'Checkpoint file must be persisted to disk prior to crash');

        // STEP 2: Strict Mode Verification (node without action throws immediately, no silent { success: true })
        const strictGraph = new StateGraph({ id: 'strict_mode_guard_graph', strict: true });
        strictGraph.addNode({ id: 'ghost_action_node' });
        await assert.rejects(async () => {
            await strictGraph.execute();
        }, /has no executable action or registered actionId/, 'Strict mode StateGraph must throw on unexecutable node');

        // STEP 3: Launch Process B (spawned fresh with zero RAM state, reads checkpoint, executes Node 3 & 4)
        const resumePath = path.resolve(__dirname, 'helpers', 'resume_process_b.js');
        const childB = spawn(process.execPath, [resumePath, checkpointFile, outFile, artifactPath, traceFile], {
            cwd: path.resolve(__dirname, '..'),
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const exitCodeB = await new Promise((resolve) => childB.on('close', (code) => resolve(code)));
        assert.strictEqual(exitCodeB, 0, 'Process B must resume and exit cleanly with code 0');

        assert.ok(fs.existsSync(outFile), 'Output report from Process B must exist');
        const outData = JSON.parse(fs.readFileSync(outFile, 'utf8'));
        assert.notStrictEqual(outData.pid, process.pid, 'Process B must run in a separate OS PID');
        assert.strictEqual(outData.status, 'COMPLETED', 'Resumed StateGraph in Process B must reach COMPLETED status');
        assert.ok(outData.completedNodes.includes('node_1'), 'Node 1 must remain completed');
        assert.ok(outData.completedNodes.includes('node_2'), 'Node 2 must remain completed');
        assert.ok(outData.completedNodes.includes('node_3'), 'Node 3 must complete in Process B');
        assert.ok(outData.completedNodes.includes('node_4'), 'Node 4 must complete in Process B');

        // STEP 4: Verify Physical Deliverable Artifact on Disk
        assert.ok(fs.existsSync(artifactPath), 'Physical recovery deliverable artifact must exist on disk');
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        assert.strictEqual(artifact.finalValue, 70, 'Calculated computational value must be correct ((20 + 15) * 2 = 70)');
        assert.strictEqual(artifact.processPid, outData.pid, 'Deliverable must be created by Process B');
        assert.strictEqual(artifact.recoveredSuccessfully, true);

        // STEP 5: Verify Execution Trace: Node 1 and Node 2 were NOT re-executed in Process B
        const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
        const rerun1 = trace.filter(t => t.node === 'node_1_UNEXPECTED_RERUN');
        const rerun2 = trace.filter(t => t.node === 'node_2_UNEXPECTED_RERUN');
        assert.strictEqual(rerun1.length, 0, 'Node 1 must NOT be re-executed in Process B');
        assert.strictEqual(rerun2.length, 0, 'Node 2 must NOT be re-executed in Process B');
        assert.ok(trace.some(t => t.node === 'node_3_resumed'), 'Node 3 must be resumed in Process B');
        assert.ok(trace.some(t => t.node === 'node_4_executed'), 'Node 4 must be executed in Process B');

        // Cleanup
        try { fs.unlinkSync(checkpointFile); } catch (_) {}
        try { fs.unlinkSync(traceFile); } catch (_) {}
        try { fs.unlinkSync(outFile); } catch (_) {}
        try { fs.unlinkSync(artifactPath); } catch (_) {}

        passedTests++;
        console.log('✅ [TEST 1] PASS: True Two-Process Crash & Recovery (Process A exit 99 -> Process B resume 0 -> không chạy lại Node cũ, tạo Artifact chuẩn)');
    }

    // -------------------------------------------------------------
    // TEST 2: DYNAMIC DAG ROUTED THROUGH StateGraph RUNTIME WITH PERSISTENT CHECKPOINTS
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 2: DYNAMIC DAG EXECUTED VIA StateGraph RUNTIME WITH CHECKPOINTS ---');
    {
        totalTests++;

        const planner = new AdaptivePlanner();
        const orchestrator = new AgentOrchestrator({ apiKey: 'gemini_test_key' });

        // Synthesize dynamic DAG
        const dynamicPlan = planner.synthesizeDynamicDag('So sánh Apache Spark và Apache Flink');
        assert.strictEqual(dynamicPlan.isDynamicDag, true);

        // Convert into StateGraph runtime instance with full persistence wiring
        const graphId = `DAG_TEST_${Date.now()}`;
        const graph = planner.generateStateGraphFromDynamicDag(dynamicPlan, {
            graphId,
            taskId: graphId,
            checkpointManager: orchestrator.checkpointManager,
            verifier: orchestrator.verifier,
            strict: false // Allow dynamic DAG steps to execute with default resolution
        });
        assert.ok(graph instanceof StateGraph, 'Dynamic DAG must generate a full StateGraph runtime instance');
        assert.strictEqual(graph.graphId, graphId, 'Graph must bind passed graphId');
        assert.strictEqual(graph.checkpointManager, orchestrator.checkpointManager, 'Graph must bind orchestrator checkpointManager');
        assert.strictEqual(graph.nodes.size, dynamicPlan.tasks.length, 'StateGraph node count must equal task count');

        // Verify all nodes and edges have proper topology and dependencies in StateGraph
        const exploreA = graph.nodes.get(dynamicPlan.tasks[0].id);
        const synthNode = graph.nodes.get(dynamicPlan.tasks[2].id);
        assert.ok(exploreA, 'Exploration node A must exist in StateGraph');
        assert.ok(synthNode, 'Synthesis node must exist in StateGraph');
        assert.ok(synthNode.dependencies.includes(exploreA.id), 'Synthesis node must have dependencies configured in StateGraph');

        // Execute dynamic DAG via StateGraph with specialist executor and verify checkpoint persistence
        await graph.execute(async (node) => ({
            success: true,
            response: `Kết quả phân tích hoàn thành xuất sắc cho node [${node.id}]`,
            sources: [{
                url: 'https://spark.apache.org/docs/latest/',
                text: `Tài liệu kỹ thuật chính thức đối chiếu cho ${node.id}`,
                verified: true
            }]
        }));
        assert.strictEqual(graph.status, 'COMPLETED');
        const loadedCheckpoint = orchestrator.checkpointManager.loadCheckpoint(graphId);
        assert.ok(loadedCheckpoint, 'StateGraph dynamic DAG execution must write persistent checkpoints to disk');
        assert.strictEqual(loadedCheckpoint.taskId, graphId);
        assert.strictEqual(loadedCheckpoint.stageData[loadedCheckpoint.lastStage].status, 'COMPLETED');

        // Clean up checkpoint
        orchestrator.checkpointManager.clearCheckpoint(graphId);

        // Orchestrator executeGraph on Dynamic DAG end-to-end
        const e2eTaskId = `E2E_DAG_${Date.now()}`;
        const e2eGraph = planner.generateStateGraphFromDynamicDag(dynamicPlan, {
            graphId: e2eTaskId,
            taskId: e2eTaskId,
            checkpointManager: orchestrator.checkpointManager,
            verifier: orchestrator.verifier
        });
        const e2eRun = await orchestrator.executeGraph(e2eGraph, {
            nodeActions: {
                [dynamicPlan.tasks[0].id]: async () => ({ success: true, response: 'Spark data', sources: [{ url: 'https://spark.apache.org', verified: true }] }),
                [dynamicPlan.tasks[1].id]: async () => ({ success: true, response: 'Flink data', sources: [{ url: 'https://flink.apache.org', verified: true }] }),
                [dynamicPlan.tasks[2].id]: async () => ({ success: true, response: 'Spark vs Flink comparison analysis', sources: [{ url: 'https://spark.apache.org', verified: true }] })
            }
        });
        assert.strictEqual(e2eRun.status, 'COMPLETED', 'Orchestrator.executeGraph on Dynamic DAG must complete');
        orchestrator.checkpointManager.clearCheckpoint(e2eTaskId);

        passedTests++;
        console.log('✅ [TEST 2] PASS: Dynamic DAG được chuyển đổi thành StateGraph runtime đầy đủ, gắn CheckpointManager và ghi checkpoint trên đĩa');
    }

    // -------------------------------------------------------------
    // TEST 3: EVIDENCE VERIFIER HARDENING (NO FALSE-POSITIVE BYPASS)
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 3: EVIDENCE VERIFIER STRICT ACCURACY & ZERO FAKE PASS ---');
    {
        totalTests++;

        const verifier = new IndependentVerifier(path.resolve(__dirname, '..'));

        // 1. Unverified official prefix (e.g. GOV-FAKE-2026 with verified: false or missing verified) MUST BE REJECTED
        const nodeClaims = { id: 'audit_node', acceptanceCriteria: ['claims'] };
        const rejectedMockOfficial = await verifier.verifyNodeOutput(nodeClaims, {
            response: 'Doanh thu tăng 90% năm 2026.',
            sources: [{ documentId: 'GOV-FAKE-UNVERIFIED', verified: false, text: 'Doanh thu tăng 90% năm 2026.' }]
        });
        assert.strictEqual(rejectedMockOfficial.passed, false, 'Mock official document explicitly marked unverified must be rejected');

        // 2. Deep Research Verification MUST require claimAudit.passed === true
        // Even with liveSourceVerified simulated, if claims are unproven, it must fail!
        const claimAudit = verifier.verifyClaimsEvidence(
            ['Thuốc X làm tăng tỷ lệ tử vong 80% ở 500 bệnh nhân lâm sàng.'],
            [{ text: 'Báo cáo ghi nhận thuốc X an toàn, không có tỷ lệ tử vong 80%.' }]
        );
        assert.strictEqual(claimAudit.passed, false, 'Contradicted claims must fail audit');

        // 3. Quantitative Claim Strictness: Any quantitative claim with numbers without evidence MUST FAIL
        const fakeNumbersClaim = verifier.verifyClaimsEvidence(
            ['Thuốc Y giúp tăng tỷ lệ hồi phục 98.5% ở 1500 bệnh nhân.'],
            ['Tài liệu nghiên cứu ghi nhận thuốc Y an toàn trong thử nghiệm ban đầu.']
        );
        assert.strictEqual(fakeNumbersClaim.passed, false, 'Ungrounded quantitative numbers (98.5% ở 1500 bệnh nhân) must fail audit');
        assert.strictEqual(fakeNumbersClaim.status, 'INSUFFICIENT_EVIDENCE');

        // 4. Grounded Quantitative Claim PASSES
        const groundedNumbersClaim = verifier.verifyClaimsEvidence(
            ['Thuốc Y giúp tăng tỷ lệ hồi phục 98.5% ở 1500 bệnh nhân.'],
            ['Tài liệu nghiên cứu xác nhận thuốc Y giúp tăng tỷ lệ hồi phục 98.5% ở 1500 bệnh nhân lâm sàng.']
        );
        assert.strictEqual(groundedNumbersClaim.passed, true, 'Grounded quantitative claim must pass audit');

        passedTests++;
        console.log('✅ [TEST 3] PASS: Evidence Verifier loại bỏ hoàn toàn đường tắt false-positive, số liệu định lượng bắt buộc có bằng chứng đối chiếu');
    }

    // -------------------------------------------------------------
    // TEST 4: STRICT DAG VALIDATION & FAIL-FAST TOPOLOGY
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 4: STRICT DAG VALIDATION & TOPOLOGICAL FAIL-FAST ---');
    {
        totalTests++;

        const planner = new AdaptivePlanner();
        const orchestrator = new AgentOrchestrator({ apiKey: 'gemini_test_key' });

        // 1. Missing dependency rejection
        const tasksWithMissingDep = [
            { id: 'TASK_REAL', dependencies: ['NON_EXISTENT_GHOST_NODE'] }
        ];
        assert.throws(() => {
            planner.validateAndToposort(tasksWithMissingDep);
        }, /depends on non-existent task/, 'Planner must reject task with non-existent dependency');

        // 2. Duplicate Task ID rejection
        const tasksWithDupId = [
            { id: 'DUPLICATE_ID', dependencies: [] },
            { id: 'DUPLICATE_ID', dependencies: [] }
        ];
        assert.throws(() => {
            planner.validateAndToposort(tasksWithDupId);
        }, /Duplicate task ID/, 'Planner must reject duplicate task IDs');

        // 3. TopologicalSort in Orchestrator strictly fails-fast on circular dependencies (No hiding fallback!)
        const circularTasks = [
            { id: 'NODE_X', dependencies: ['NODE_Y'] },
            { id: 'NODE_Y', dependencies: ['NODE_X'] }
        ];
        assert.throws(() => {
            orchestrator.topologicalSort(circularTasks);
        }, /Circular dependency detected/, 'Orchestrator topologicalSort must throw Fail-Fast on circular dependency');

        passedTests++;
        console.log('✅ [TEST 4] PASS: Kiểm tra tính hợp lệ DAG nghiêm ngặt (chặn dependency ma, task ID trùng, cycle Fail-Fast)');
    }

    // -------------------------------------------------------------
    // TEST 5: CONDITION DSL SCHEMA HARDENING (EMPTY NOT & OPERATOR WHITELIST)
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 5: CONDITION DSL SCHEMA HARDENING ---');
    {
        totalTests++;

        // 1. Empty NOT condition fails closed
        const emptyNot = { type: 'logical', operator: 'not', conditions: [] };
        assert.strictEqual(validateDslDescriptor(emptyNot), false, 'Empty NOT condition must be rejected by validator');
        assert.strictEqual(safeEvaluateDsl(emptyNot, {}), false, 'Empty NOT condition must evaluate to false (Fail Closed)');

        // 2. Unknown comparison operator fails closed
        const unknownOp = { type: 'comparison', path: 'score', operator: 'malicious_eval', value: 100 };
        assert.strictEqual(validateDslDescriptor(unknownOp), false, 'Unknown operator must be rejected by validator');
        assert.strictEqual(safeEvaluateDsl(unknownOp, { score: 100 }), false, 'Unknown operator must evaluate to false');

        // 3. Excessive nesting depth (> 5) fails closed
        let deepDsl = { type: 'comparison', path: 'x', operator: 'equals', value: 1 };
        for (let i = 0; i < 7; i++) {
            deepDsl = { type: 'logical', operator: 'and', conditions: [deepDsl] };
        }
        assert.strictEqual(validateDslDescriptor(deepDsl), false, 'Excessive nesting depth (> 5) must be rejected');
        assert.strictEqual(safeEvaluateDsl(deepDsl, { x: 1 }), false, 'Deeply nested condition must evaluate to false');

        passedTests++;
        console.log('✅ [TEST 5] PASS: Condition DSL Schema Validator kiểm duyệt chặt chẽ (chặn NOT rỗng, toán tử lạ, giới hạn độ sâu nesting)');
    }

    console.log('\n===============================================================');
    console.log(`🎉 HOÀN THÀNH TOÀN BỘ ${passedTests}/${totalTests} BÀI KIỂM THỬ UPDATE 22 (100% PASS)`);
    console.log('===============================================================');
}

if (require.main === module) {
    runTests().catch(err => {
        console.error('❌ Test failed with error:', err);
        process.exit(1);
    });
}

module.exports = { runTests };
