/**
 * tests/helpers/resume_process_runner.js
 * Standalone worker process used to test true process restart & cold memory isolation
 */

const fs = require('fs');
const path = require('path');
const { StateGraph } = require('../../agents/StateGraph');

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

        // Provide node action if needed or execute existing graph
        const res = await restored.execute({ metric: 85, approved: true });

        const resultData = {
            pid: process.pid,
            status: res.status,
            completedNodes: Array.from(restored.completedNodes),
            failedNodes: Array.from(restored.failedNodes),
            skippedNodes: Array.from(restored.skippedNodes),
            state: restored.state
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
