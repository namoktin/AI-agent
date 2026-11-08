/**
 * tests/helpers/resume_process_runner.js
 * Standalone worker process used to test true process restart & cold memory isolation
 * Update 21: Executes real task action and verifies real physical deliverable artifact creation
 */

const fs = require('fs');
const path = require('path');
const { StateGraph } = require('../../agents/StateGraph');

// Register real specialist action handlers for cold restart task execution
StateGraph.registerAction('calculate_and_write_artifact', async (state, graph) => {
    const artifactPath = path.resolve(__dirname, '..', '..', 'memory', 'cold_restart_artifact.json');
    const computedData = {
        computedAt: Date.now(),
        processPid: process.pid,
        sourceMetric: state.metric || 0,
        computedMetric: (state.metric || 0) * 2,
        verifiedDeliverable: true
    };
    fs.writeFileSync(artifactPath, JSON.stringify(computedData, null, 2), 'utf8');
    return {
        success: true,
        artifactWritten: true,
        artifactPath,
        computedMetric: computedData.computedMetric
    };
});

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node resume_process_runner.js <graphFilePath> <outputFilePath>');
        process.exit(1);
    }

    const [graphFilePath, outputFilePath] = args;

    try {
        const raw = fs.readFileSync(graphFilePath, 'utf8');
        const serialized = JSON.parse(raw);

        // Deserializing in fresh process with ZERO in-memory state from parent process!
        const restored = StateGraph.deserialize(serialized);

        // Execute restored graph with real actions and verification
        const res = await restored.execute({ metric: 85, approved: true });

        const resultData = {
            pid: process.pid,
            status: res.status,
            completedNodes: Array.from(restored.completedNodes),
            failedNodes: Array.from(restored.failedNodes),
            skippedNodes: Array.from(restored.skippedNodes),
            state: restored.state,
            results: res.results || {}
        };

        fs.writeFileSync(outputFilePath, JSON.stringify(resultData, null, 2), 'utf8');
        process.exit(0);
    } catch (err) {
        console.error('Fatal in child process runner:', err);
        fs.writeFileSync(outputFilePath, JSON.stringify({ error: err.message, stack: err.stack }), 'utf8');
        process.exit(1);
    }
}

main();
