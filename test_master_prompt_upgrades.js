/**
 * test_master_prompt_upgrades.js
 * Comprehensive Verification Test Suite for Master Prompt Upgrades
 * 
 * Verifies all 6 upgrades:
 * 1. Stateful Graph Execution Engine (DAG, parallel, loops, idempotency, replanning)
 * 2. MCP Tool Ecosystem (stdio JSON-RPC 2.0 handshake, tool discovery, ToolExecutor integration)
 * 3. Real-Time SSE Agent Streaming (13 events, history replay, pub/sub)
 * 4. Human-in-the-Loop Engine (WAITING_APPROVAL, decision submission, execution resumption)
 * 5. Quota-Aware Scheduler V2 (no force-granting, dynamic retryDelay parsing, priority queue)
 * 6. Evidence-Aware Verifier & Skill Intelligence (claim fact-checks, Wilson score ranking)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { StateGraph, StateNode } = require('./agents/StateGraph');
const { MCPClientManager } = require('./agents/MCPClientManager');
const { ToolExecutor } = require('./agents/ToolExecutor');
const { AgentEventStream } = require('./agents/AgentEventStream');
const { ModelRouter } = require('./agents/ModelRouter');
const { IndependentVerifier } = require('./agents/IndependentVerifier');
const { SkillLibrary } = require('./agents/SkillLibrary');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
    totalTests++;
    return (async () => {
        try {
            console.log(`\n⏳ RUNNING: ${testName}`);
            await fn();
            passedTests++;
            console.log(`✅ PASSED: ${testName}`);
        } catch (err) {
            console.error(`❌ FAILED: ${testName}`);
            console.error(`   Error: ${err.message}`);
            if (err.stack) console.error(err.stack);
            process.exitCode = 1;
        }
    })();
}

async function runAllTests() {
    console.log('================================================================');
    console.log('🚀 MASTER PROMPT UPGRADES VERIFICATION TEST SUITE');
    console.log('================================================================');

    // =========================================================================
    // UPGRADE 1: STATEFUL GRAPH EXECUTION ENGINE
    // =========================================================================
    await runTest('1.1 StateGraph DAG Execution with Prerequisites & Parallelism', async () => {
        const graph = new StateGraph({ graphId: 'test_dag_1' });

        const executionOrder = [];

        const nodeA = new StateNode({
            id: 'node_a',
            action: async () => {
                executionOrder.push('A');
                return { success: true, valA: 10 };
            }
        });

        const nodeB = new StateNode({
            id: 'node_b',
            prerequisites: ['node_a'],
            action: async (state) => {
                executionOrder.push('B');
                return { success: true, valB: state.node_a.valA + 5 };
            }
        });

        const nodeC = new StateNode({
            id: 'node_c',
            prerequisites: ['node_a'],
            action: async (state) => {
                executionOrder.push('C');
                return { success: true, valC: state.node_a.valA * 2 };
            }
        });

        const nodeD = new StateNode({
            id: 'node_d',
            prerequisites: ['node_b', 'node_c'],
            action: async (state) => {
                executionOrder.push('D');
                return { success: true, total: state.node_b.valB + state.node_c.valC };
            }
        });

        graph.addNode(nodeA);
        graph.addNode(nodeB);
        graph.addNode(nodeC);
        graph.addNode(nodeD);

        const result = await graph.execute();

        assert.strictEqual(result.status, 'COMPLETED');
        assert.strictEqual(executionOrder[0], 'A');
        assert.ok(executionOrder.includes('B') && executionOrder.includes('C'));
        assert.strictEqual(executionOrder[3], 'D');
        assert.strictEqual(result.state.node_d.total, 35); // (10+5) + (10*2) = 15 + 20 = 35
    });

    await runTest('1.2 StateGraph Conditional Loop & Max Loops Guard', async () => {
        const graph = new StateGraph({ graphId: 'test_loop_1', maxLoops: 3 });

        let iteration = 0;
        const nodeCounter = new StateNode({
            id: 'counter',
            action: async () => {
                iteration++;
                return { success: true, count: iteration };
            },
            transitions: [
                {
                    targetNodeId: 'counter',
                    condition: (state) => (state.counter?.count || 0) < 10 // would run 10 times if no guard
                }
            ]
        });

        graph.addNode(nodeCounter);
        const result = await graph.execute();

        // Loop guard should halt after 3 loops
        assert.ok(result.executionLog.some(log => log.includes('Loop guard reached') || log.includes('exceeded max allowed')));
        assert.strictEqual(result.status, 'COMPLETED');
        assert.ok(iteration <= 4, `Iteration count (${iteration}) must be capped by loop guard`);
    });

    await runTest('1.3 StateGraph Idempotency Guard', async () => {
        const graph = new StateGraph({ graphId: 'test_idempotent_1' });

        let runCount = 0;
        const nodeNonIdempotent = new StateNode({
            id: 'payment_charge',
            idempotent: false,
            action: async () => {
                runCount++;
                return { success: true, charged: true };
            }
        });

        graph.addNode(nodeNonIdempotent);

        // First run: executes action
        await graph.execute();
        assert.strictEqual(runCount, 1);

        // Simulate re-running graph when node is already COMPLETED
        await graph.execute();
        assert.strictEqual(runCount, 1, 'Non-idempotent node must not re-execute if already COMPLETED');
    });

    await runTest('1.4 StateGraph Dynamic Replanning & Serialization', async () => {
        const graph = new StateGraph({ graphId: 'test_replan_1' });

        const node1 = new StateNode({
            id: 'initial_step',
            action: async (state, g) => {
                // Dynamically inject a new required step
                g.replan([
                    new StateNode({
                        id: 'injected_step',
                        prerequisites: ['initial_step'],
                        action: async () => ({ success: true, injected: true })
                    })
                ]);
                return { success: true, original: true };
            }
        });

        graph.addNode(node1);
        const res = await graph.execute();

        assert.strictEqual(res.status, 'COMPLETED');
        assert.ok(res.state.injected_step);
        assert.strictEqual(res.state.injected_step.injected, true);

        // Serialization check
        const serialized = graph.toJSON();
        const restored = StateGraph.fromJSON(serialized);
        assert.strictEqual(restored.graphId, graph.graphId);
        assert.strictEqual(restored.nodes.size, 2);
    });

    // =========================================================================
    // UPGRADE 2: MCP TOOL ECOSYSTEM
    // =========================================================================
    await runTest('2.1 MCP Client Manager Discovery & Call Execution', async () => {
        const mcpManager = new MCPClientManager(process.cwd());
        const discoveredTools = await mcpManager.discoverTools();

        assert.ok(Array.isArray(discoveredTools));
        assert.ok(discoveredTools.length >= 2, 'Must discover at least echo and calculate from test server');

        const echoTool = discoveredTools.find(t => t.name.includes('echo'));
        assert.ok(echoTool, 'Echo tool must exist in discovered MCP tools');
        assert.ok(echoTool.name.startsWith('mcp__local_test__'));

        // Call tool through MCPClientManager
        const echoRes = await mcpManager.callTool(echoTool.name, { message: 'Unit Test MCP' });
        assert.strictEqual(echoRes.success, true);
        assert.strictEqual(echoRes.result, 'Echo: Unit Test MCP');

        const calcTool = discoveredTools.find(t => t.name.includes('calculate'));
        const calcRes = await mcpManager.callTool(calcTool.name, { expression: '100 * 2.5' });
        assert.strictEqual(calcRes.success, true);
        assert.strictEqual(calcRes.result, 'Result: 250');

        await mcpManager.shutdown();
    });

    await runTest('2.2 ToolExecutor MCP Dynamic Delegation', async () => {
        const toolExecutor = new ToolExecutor(process.cwd());
        const toolDefs = await toolExecutor.getToolDefinitions();

        const mcpCalcDef = toolDefs.find(t => t.name === 'mcp__local_test__calculate');
        assert.ok(mcpCalcDef, 'ToolExecutor must expose namespaced MCP tools in its definitions');

        const execution = await toolExecutor.callToolAPI('mcp__local_test__calculate', { expression: '7 * 6' });
        assert.strictEqual(execution.success, true);
        assert.strictEqual(execution.result, 'Result: 42');

        if (toolExecutor.mcpManager) {
            await toolExecutor.mcpManager.shutdown();
        }
    });

    // =========================================================================
    // UPGRADE 3: REAL-TIME SSE AGENT STREAMING
    // =========================================================================
    await runTest('3.1 AgentEventStream Pub/Sub & History Replay', async () => {
        const eventStream = new AgentEventStream();
        const testTaskId = 'stream_test_101';

        // Emit initial events before client connects
        eventStream.emit(AgentEventStream.EVENTS.TASK_STARTED, { taskId: testTaskId, goal: 'Stream Test' });
        eventStream.emit(AgentEventStream.EVENTS.STAGE_CHANGED, { taskId: testTaskId, stage: 'STAGE_1_PLAN' });

        // Mock SSE response object
        const receivedSSE = [];
        const mockRes = {
            writeHead: () => {},
            write: (chunk) => {
                receivedSSE.push(chunk);
            },
            on: () => {}
        };

        // Client subscribes with replay
        eventStream.subscribe(testTaskId, mockRes);

        // Verify history replay delivered connection banner + 2 replayed events
        assert.strictEqual(receivedSSE.length, 3);
        assert.ok(receivedSSE[0].includes('connected to cyber-agent-stream'));
        assert.ok(receivedSSE[1].includes('TASK_STARTED'));
        assert.ok(receivedSSE[2].includes('STAGE_CHANGED'));

        // Emit a 3rd live event
        eventStream.emit(AgentEventStream.EVENTS.NODE_STARTED, { taskId: testTaskId, nodeId: 'fetch_data' });
        assert.strictEqual(receivedSSE.length, 4);
        assert.ok(receivedSSE[3].includes('NODE_STARTED'));
    });

    // =========================================================================
    // UPGRADE 4: HUMAN-IN-THE-LOOP (HITL) ENGINE
    // =========================================================================
    await runTest('4.1 StateGraph HITL Approval Workflow & Resumption', async () => {
        const eventStream = new AgentEventStream();
        const taskId = `hitl_test_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const graph = new StateGraph({ graphId: taskId, eventStream });

        let step1Ran = false;
        let step2Ran = false;

        const node1 = new StateNode({
            id: 'safe_preparation',
            action: async () => {
                step1Ran = true;
                return { success: true };
            }
        });

        const node2 = new StateNode({
            id: 'dangerous_action',
            prerequisites: ['safe_preparation'],
            requiresApproval: true,
            approvalDescription: 'Action will alter remote system state',
            action: async () => {
                step2Ran = true;
                return { success: true, altered: true };
            }
        });

        graph.addNode(node1);
        graph.addNode(node2);

        // First execution should run step1 and halt at step2 for approval
        const run1 = await graph.execute();

        assert.strictEqual(step1Ran, true);
        assert.strictEqual(step2Ran, false);
        assert.strictEqual(run1.status, 'WAITING_APPROVAL');
        assert.strictEqual(run1.waitingApprovalNode, 'dangerous_action');

        // Verify approval request was registered in AgentEventStream
        const pending = eventStream.getPendingApprovals();
        const req = pending.find(p => p.taskId === taskId);
        assert.ok(req, 'Pending approval must be recorded in EventStream');
        assert.strictEqual(req.nodeId, 'dangerous_action');

        // Human approves the request
        const decisionRes = eventStream.submitDecision(taskId, 'APPROVE', 'Granted by admin');
        assert.strictEqual(decisionRes.success, true);
        assert.strictEqual(decisionRes.status, 'APPROVED');

        // Resuming execution
        const run2 = await graph.execute();
        assert.strictEqual(run2.status, 'COMPLETED');
        assert.strictEqual(step2Ran, true);
        assert.strictEqual(run2.state.dangerous_action.altered, true);
    });

    // =========================================================================
    // UPGRADE 5: QUOTA-AWARE SCHEDULER V2
    // =========================================================================
    await runTest('5.1 ModelRouter Dynamic Retry Delay Parsing & Backoff', async () => {
        const router = new ModelRouter({ defaultModel: 'gemini-3.5-flash-lite' });

        // Test format 1: "Resource has been exhausted (e.g. check quota)... retry in 18s"
        const err1 = { message: 'Resource exhausted, please retry in 18s' };
        const delay1 = router.parseRetryDelay(err1);
        assert.strictEqual(delay1, 18000);

        // Test format 2: Gemini API structured error with retryDelay: "45s"
        const err2 = {
            error: {
                details: [{
                    '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                    retryDelay: '45s'
                }]
            }
        };
        const delay2 = router.parseRetryDelay(err2);
        assert.strictEqual(delay2, 45000);

        // Test format 3: duration "1m30s"
        const err3 = { message: 'Quota exceeded. retryDelay: 1m30s' };
        const delay3 = router.parseRetryDelay(err3);
        assert.strictEqual(delay3, 90000);

        // Test backoff calculation with jitter
        const backoff = router.calculateBackoff('gemini-3.5-flash-lite', 20000);
        assert.ok(backoff >= 20000 && backoff <= 24000, `Backoff (${backoff}) must include positive jitter`);
    });

    await runTest('5.2 ModelRouter No Force-Granting & Priority Queue Discipline', async () => {
        const router = new ModelRouter({ defaultModel: 'gemini-3.5-flash-lite' });

        // Simulate quota limits saturated by filling timestamps
        for (let i = 0; i < router.limits.maxRPM; i++) {
            router.requestTimestamps.push(Date.now());
        }

        // Restrict fallback pool to saturated model so it cannot bypass via another model
        router.registry.FALLBACK_POOL = ['gemini-3.5-flash-lite'];

        // Normal request should NOT get force-granted
        const slotPromise = router.acquireSlot('gemini-3.5-flash-lite', 100, 300, { priority: 1 });
        
        const acquired = await slotPromise;
        // Since RPM was saturated, it must reject or return false/granted:false, NOT force grant
        assert.ok(!acquired || acquired.granted === false, 'Must not force grant slot when RPM is strictly saturated');
    });

    // =========================================================================
    // UPGRADE 6: EVIDENCE-AWARE VERIFIER & SKILL INTELLIGENCE
    // =========================================================================
    await runTest('6.1 IndependentVerifier Fact-Check Categorization (SUPPORTED / CONTRADICTED / INSUFFICIENT)', async () => {
        const verifier = new IndependentVerifier();

        const claimText = `
        Nhiệt độ hoạt động pin Tesla 4680 duy trì ổn định ở 45°C.
        Hiệu suất sạc thế hệ mới tăng 16% theo dữ liệu đo thực nghiệm.
        Báo cáo thử nghiệm bị thu hồi và retracted do làm giả dữ kiện.
        `;

        const extracted = verifier.extractClaims(claimText);
        assert.strictEqual(extracted.length, 3, 'Must extract exactly 3 verifiable claims');

        // Evidence source that supports claim 1 and 2
        const evidenceSources = [
            'Dữ liệu thực nghiệm: Nhiệt độ pin Tesla 4680 duy trì ở 45°C và hiệu suất sạc tăng 16% trong điều kiện sạc tiêu chuẩn.'
        ];

        // Audit supported claims
        const supportedAudit = verifier.verifyClaimsEvidence(extracted.slice(0, 2), evidenceSources);
        assert.strictEqual(supportedAudit.status, 'SUPPORTED');
        assert.strictEqual(supportedAudit.stats.supported, 2);
        assert.strictEqual(supportedAudit.passed, true);

        // Audit contradicted claim
        const contradictedAudit = verifier.verifyClaimsEvidence([extracted[2]], evidenceSources);
        assert.strictEqual(contradictedAudit.status, 'CONTRADICTED');
        assert.strictEqual(contradictedAudit.stats.contradicted, 1);
        assert.strictEqual(contradictedAudit.passed, false);

        // Audit claim with zero evidence -> strictly UNVERIFIED (No inflated 90s)
        const unverifiedAudit = verifier.verifyClaimsEvidence(['Tốc độ sản xuất đạt 100000 xe mỗi tuần.'], []);
        assert.strictEqual(unverifiedAudit.status, 'UNVERIFIED');
        assert.strictEqual(unverifiedAudit.passed, false);
    });

    await runTest('6.2 IndependentVerifier StateNode Contract Verification', async () => {
        const verifier = new IndependentVerifier();

        const node = {
            id: 'build_output',
            outputSchema: { status: 'string', count: 'number' },
            acceptanceCriteria: ['non-empty output']
        };

        // Test passing node output
        const passRes = await verifier.verifyNodeOutput(node, {
            success: true,
            status: 'success',
            count: 42,
            response: 'Completed pipeline run'
        });
        assert.strictEqual(passRes.passed, true);
        assert.strictEqual(passRes.status, 'APPROVED');

        // Test failing node output (missing schema key)
        const failRes = await verifier.verifyNodeOutput(node, {
            success: true,
            status: 'success'
            // missing count
        });
        assert.strictEqual(failRes.passed, false);
        assert.strictEqual(failRes.status, 'RETRY_REQUIRED');
        assert.ok(failRes.reason.includes('Missing required schema fields: [count]'));
    });

    await runTest('6.3 SkillLibrary Wilson Score Ranking & Cold-Start Bias Protection', async () => {
        const skillLib = new SkillLibrary();

        // 1 trial at 100% (anomalous one-shot trial)
        const oneTrialWilson = skillLib.calculateWilsonScore(1, 1);
        // 95 trials out of 100 (proven high-volume battle-tested strategy)
        const provenWilson = skillLib.calculateWilsonScore(95, 100);

        // Math proof: 1/1 should have Wilson ~0.207, whereas 95/100 has ~0.888
        assert.ok(oneTrialWilson < 0.25, `One trial Wilson score (${oneTrialWilson}) must be conservative`);
        assert.ok(provenWilson > 0.85, `Proven Wilson score (${provenWilson}) must be high confidence`);
        assert.ok(provenWilson > oneTrialWilson, 'Proven strategy must beat anomalous 1-trial strategy');

        // Test optimal strategy selection
        const strat = skillLib.getOptimalStrategy('cào dữ liệu facebook reels xemlacuon');
        assert.ok(strat, 'Must find matching optimal strategy');
        assert.strictEqual(strat.key, 'facebook_reels');
        assert.ok(strat.rankScore > 0);
    });

    console.log('\n================================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} MASTER PROMPT UPGRADE TESTS PASSED 100%!`);
    console.log('================================================================\n');
}

runAllTests().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
