/**
 * test_platform_hardened_stress.js - High-Concurrency & Edge-Case Stress Test
 */

const assert = require('assert');
const { ModelRouter } = require('./agents/ModelRouter');
const { StateGraph } = require('./agents/StateGraph');
const { MCPClientManager } = require('./agents/MCPClientManager');
const { AgentEventStream } = require('./agents/AgentEventStream');

let pass = 0;
let fail = 0;

async function check(name, fn) {
    try {
        await fn();
        console.log(`  ✅ [STRESS PASS] ${name}`);
        pass++;
    } catch (e) {
        console.error(`  ❌ [STRESS FAIL] ${name}: ${e.message}`);
        fail++;
    }
}

async function runAll() {
    console.log('===============================================================');
    console.log('⚡ STRESS TEST: HIGH CONCURRENCY, EDGE CASES & BOUNDARY LIMITS');
    console.log('===============================================================\n');

    await check('50 concurrent requests under strict RPM=5, TPM=10000 do not deadlock or explode budget', async () => {
        const router = new ModelRouter({
            maxRPM: 5,
            maxTPM: 10000,
            maxRPD: 100,
            maxInflight: 5
        });

        // Dispatch 50 promises simultaneously
        const promises = [];
        let grantedCount = 0;
        let deferredCount = 0;

        for (let i = 0; i < 50; i++) {
            promises.push(
                router.acquireDispatchSlot({ estimatedTokens: 1500, timeout: 50 }).then(slot => {
                    if (slot.granted) {
                        grantedCount++;
                        // Release shortly after
                        setTimeout(() => router.releaseDispatchSlot(1000, router.defaultModel, slot.slotId), 10);
                    } else {
                        deferredCount++;
                    }
                    return slot;
                })
            );
        }

        const results = await Promise.all(promises);
        assert.strictEqual(results.length, 50, 'All 50 promises must resolve without crash');
        assert.ok(grantedCount > 0, 'Some requests must be granted');
        assert.ok(deferredCount > 0, 'Excess requests must be deferred without crash');
        assert.ok(router.inflightRequests <= 5, 'Inflight requests must never exceed maxInflight (5)');
    });

    await check('StateGraph cleanly detects circular dependency / deadlock and terminates with FAILED status', async () => {
        const graph = new StateGraph({ graphId: `cycle_test_${Date.now()}` });
        
        // Node 1 depends on Node 2, and Node 2 depends on Node 1 (Cycle)
        graph.addNode({
            id: 'node_cycle_1',
            dependencies: ['node_cycle_2'],
            action: async () => ({ success: true })
        });
        graph.addNode({
            id: 'node_cycle_2',
            dependencies: ['node_cycle_1'],
            action: async () => ({ success: true })
        });

        const res = await graph.run();
        assert.strictEqual(res.status, 'FAILED', 'Circular dependency must cleanly terminate as FAILED');
        assert.strictEqual(graph.completedNodes.size, 0, 'No nodes should complete in a deadlock');
    });

    await check('MCPClientManager graceful recovery on non-existent or invalid executable', async () => {
        const mgr = new MCPClientManager();
        mgr.registerServer('ghost_server', {
            command: 'non_existent_binary_xyz_123',
            args: []
        });

        let caught = false;
        try {
            await mgr.executeTool('mcp__ghost_server__test_tool', {});
        } catch (err) {
            caught = true;
            assert.ok(/error|spawn/i.test(err.message), 'Must reject with descriptive spawn error');
        }
        assert.strictEqual(caught, true, 'Must catch invalid binary execution');
    });

    await check('AgentEventStream history truncation respects maxEventsPerTask boundary', async () => {
        const stream = new AgentEventStream({ maxEventsPerTask: 15 });
        const testTaskId = 'stream_bound_test';

        for (let i = 0; i < 50; i++) {
            stream.emitEvent(testTaskId, 'AGENT_OUTPUT_DELTA', { chunk: `chunk_${i}` });
        }

        const history = stream.taskEvents.get(testTaskId);
        assert.strictEqual(history.length, 15, 'History must strictly be capped at maxEventsPerTask (15)');
        assert.strictEqual(history[history.length - 1].data.chunk, 'chunk_49', 'Last event must be the newest');
    });

    console.log('\n===============================================================');
    console.log(`🏁 KẾT QUẢ STRESS TEST: ${pass}/${pass + fail} TESTS PASSED`);
    console.log('===============================================================');

    if (fail > 0) process.exit(1);
    process.exit(0);
}

runAll().catch(e => {
    console.error(e);
    process.exit(1);
});
