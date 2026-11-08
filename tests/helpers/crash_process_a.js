/**
 * tests/helpers/crash_process_a.js
 * Cyber Agent Pro v5.8 - Update 22
 * Simulates Process A: runs Node 1 and Node 2, checkpoints graph state, then abruptly crashes with exit code 99.
 */

const fs = require('fs');
const path = require('path');
const { StateGraph } = require('../../agents/StateGraph');

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node crash_process_a.js <checkpointFilePath> <traceFilePath>');
        process.exit(1);
    }

    const [checkpointFile, traceFile] = args;
    const executionTrace = [];

    // Register actions for Process A
    StateGraph.registerAction('action_node_1', async (state, graph) => {
        executionTrace.push({ node: 'node_1', pid: process.pid, time: Date.now() });
        fs.writeFileSync(traceFile, JSON.stringify(executionTrace, null, 2), 'utf8');
        return { success: true, step1: true, value: 10 };
    });

    StateGraph.registerAction('action_node_2', async (state, graph) => {
        executionTrace.push({ node: 'node_2', pid: process.pid, time: Date.now() });
        fs.writeFileSync(traceFile, JSON.stringify(executionTrace, null, 2), 'utf8');
        return { success: true, step2: true, value: 20 };
    });

    StateGraph.registerAction('action_node_3', async (state, graph) => {
        // Node 3 saves the graph checkpoint mid-flight right before catastrophic process termination
        executionTrace.push({ node: 'node_3_crashing', pid: process.pid, time: Date.now() });
        fs.writeFileSync(traceFile, JSON.stringify(executionTrace, null, 2), 'utf8');
        
        // Save current graph state to disk
        const snapshot = graph.serialize();
        fs.writeFileSync(checkpointFile, JSON.stringify(snapshot, null, 2), 'utf8');
        
        console.log(`[Process A PID:${process.pid}] Saved checkpoint at Node 3. Simulating sudden OS kill/crash...`);
        // Abrupt termination
        process.exit(99);
    });

    const graph = new StateGraph({
        id: 'two_process_crash_recovery_graph',
        strict: true
    });

    graph.addNode({
        id: 'node_1',
        actionId: 'action_node_1'
    });

    graph.addNode({
        id: 'node_2',
        dependencies: ['node_1'],
        actionId: 'action_node_2'
    });

    graph.addNode({
        id: 'node_3',
        dependencies: ['node_2'],
        actionId: 'action_node_3'
    });

    graph.addNode({
        id: 'node_4',
        dependencies: ['node_3'],
        actionId: 'action_node_4'
    });

    graph.addEdge('node_1', 'node_2');
    graph.addEdge('node_2', 'node_3');
    graph.addEdge('node_3', 'node_4');

    try {
        await graph.execute({ initialData: 'test_recovery' });
    } catch (err) {
        console.error('Process A caught error:', err.message);
        process.exit(1);
    }
}

main();
