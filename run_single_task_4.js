const fs = require('fs');
const http = require('http');
const vm = require('vm');
const path = require('path');

function httpPostJson(urlStr, body, timeoutMs = 0) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const postData = JSON.stringify(body);
        const options = {
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Connection': 'keep-alive'
            }
        };

        const req = http.request(options, (res) => {
            let resData = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { resData += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => parsed, text: async () => resData });
                } catch (e) {
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => resData, json: async () => { throw e; } });
                }
            });
        });

        req.setTimeout(timeoutMs);
        req.on('timeout', () => { req.destroy(new Error('REQUEST_TIMEOUT')); });
        req.on('error', (err) => { reject(err); });
        req.write(postData);
        req.end();
    });
}

const runnerFile = fs.readFileSync(path.resolve(__dirname, 'run_20_hell_tasks_benchmark.js'), 'utf8');

// Extract evaluateResponse function code
const evalStart = runnerFile.indexOf('function evaluateResponse(task, durationMs, data) {');
const evalEnd = runnerFile.indexOf('async function runSingleTask(task, index) {');
const evalCode = runnerFile.slice(evalStart, evalEnd);

const evalSandbox = { vm, console };
vm.createContext(evalSandbox);
vm.runInContext(evalCode, evalSandbox);
const evaluateResponse = evalSandbox.evaluateResponse;

// Load Task 4 definition
const match = runnerFile.match(/const HELL_TASKS = (\[[\s\S]*?\n\];)/);
const tasks = eval(match[1]);
const task4 = tasks[3];

async function run() {
    console.log("Starting Task 4 Execution...");
    const startTime = Date.now();
    const res = await httpPostJson('http://localhost:3000/api/v2/execute', {
        task: task4.prompt,
        useGrounding: false,
        useCustomAi: true,
        context: {
            benchmarkTask: task4.id,
            mode: 'standard',
            useCustomAi: true
        }
    });
    const durationMs = Date.now() - startTime;
    console.log(`Execution ended in ${(durationMs/1000).toFixed(1)}s. Status:`, res.status);
    const data = await res.json();
    
    const evaluation = evaluateResponse(task4, durationMs, data);
    console.log("Evaluation Result:", JSON.stringify(evaluation, null, 2));

    const outObj = {
        taskId: 4,
        domain: task4.domain,
        title: task4.title,
        durationMs,
        durationSec: parseFloat((durationMs / 1000).toFixed(1)),
        success: data.success,
        tokensUsed: data.stats?.totalTokens || 0,
        modelUsed: data.stats?.model || 'deepseek-v4-pro',
        qualityScore: data.qualityScore || 85,
        stats: data.stats,
        eval: evaluation,
        sampleSnippet: (typeof data.result === 'string' ? data.result : JSON.stringify(data.result)).slice(0, 500),
        fullResponse: data.result
    };

    fs.writeFileSync('task_04_eval.json', JSON.stringify(outObj, null, 2), 'utf8');
    console.log("Saved task_04_eval.json successfully!");
}

run().catch(console.error);

