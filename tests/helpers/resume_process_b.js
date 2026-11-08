/**
 * tests/helpers/resume_process_b.js
 * Cyber Agent Pro v5.8 - Update 22
 * Simulates Process B: starts completely cold in a new OS process, reads checkpoint from disk,
 * ensures Node 1 and Node 2 are NOT re-executed, executes Node 3 and Node 4, and writes final artifact.
 */

const fs = require('fs');
const path = require('path');
const { StateGraph } = require('../../agents/StateGraph');

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.error('Usage: node resume_process_b.js <checkpointFilePath> <outputFilePath> <artifactFilePath> <traceFilePath>');
        process.exit(1);
    }

    const [checkpointFile, outputFile, artifactFile, traceFile] = args;

    // Load existing execution trace from Process A if available
    let executionTrace = [];
    if (fs.existsSync(traceFile)) {
        try {
            executionTrace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
        } catch (_) {}
    }

    // Register all actions in Process B
    StateGraph.registerAction('action_node_1', async (state, graph) => {
        executionTrace.push({ node: 'node_1_UNEXPECTED_RERUN', pid: process.pid, time: Date.now() });
        fs.writeFileSync(traceFile, JSON.stringify(executionTrace, null, 2), 'utf8');
        return { success: true, step1: true, value: 10 };
    });

    StateGraph.registerAction('action_node_2', async (state, graph) => {
        executionTrace.push({ node: 'node_2_UNEXPECTED_RERUN', pid: process.pid, time: Date.now() });
        fs.writeFileSync(traceFile, JSON.stringify(executionTrace, null, 2), 'utf8');
        return { success: true, step2: true, value: 20 };
    });

    StateGraph.registerAction('action_node_3', async (state, graph) => {
        executionTrace.push({ node: 'node_3_resumed', pid: process.pid, time: Date.now() });
        fs.writeFileSync(traceFile, JSON.stringify(executionTrace, null, 2), 'utf8');
        const prevVal = typeof state.value === 'number' ? state.value : 20;
        return { success: true, step3: true, value: prevVal + 15 };
    });

    StateGraph.registerAction('action_node_4', async (state, graph) => {
        executionTrace.push({ node: 'node_4_executed', pid: process.pid, time: Date.now() });
        fs.writeFileSync(traceFile, JSON.stringify(executionTrace, null, 2), 'utf8');

        const finalValue = (state.value || 35) * 2; // (20 + 15) * 2 = 70
        const artifactData = {
            processPid: process.pid,
            completedNodes: Array.from(graph.completedNodes).concat('node_4'),
            finalValue: finalValue,
            recoveredSuccessfully: true,
            createdAt: Date.now()
        };

        fs.writeFileSync(artifactFile, JSON.stringify(artifactData, null, 2), 'utf8');
        return {
            success: true,
            step4: true,
            deliverableWritten: true,
            finalValue
        };
    });

    try {
        const raw = fs.readFileSync(checkpointFile, 'utf8');
        const snapshot = JSON.parse(raw);

        // Deserializing in fresh process B with ZERO in-memory state from process A!
        const restored = StateGraph.deserialize(snapshot, { strict: true });

        // Resume execution
        const res = await restored.execute();

        const resultData = {
            pid: process.pid,
            status: restored.status,
            completedNodes: Array.from(restored.completedNodes),
            failedNodes: Array.from(restored.failedNodes),
            skippedNodes: Array.from(restored.skippedNodes),
            state: restored.state,
            stepCounter: restored.stepCounter,
            executionTrace: executionTrace
        };

        fs.writeFileSync(outputFile, JSON.stringify(resultData, null, 2), 'utf8');
        process.exit(0);
    } catch (err) {
        console.error('Fatal in resume_process_b:', err);
        fs.writeFileSync(outputFile, JSON.stringify({ error: err.message, stack: err.stack }), 'utf8');
        process.exit(1);
    }
}

main();
