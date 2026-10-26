const fs = require('fs');
const path = require('path');

// 1. Update .env
const envPath = path.join(__dirname, '.env');
let envContent = fs.readFileSync(envPath, 'utf8');
if (!envContent.includes('USE_CUSTOM_AI')) {
    envContent += '\nUSE_CUSTOM_AI=true\n';
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Updated .env with USE_CUSTOM_AI=true');
} else {
    envContent = envContent.replace(/USE_CUSTOM_AI=.*/g, 'USE_CUSTOM_AI=true');
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Set USE_CUSTOM_AI=true in .env');
}

// 2. Update server.js
const serverPath = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

// 2.1 Update rate limiter for localhost
const oldRateLimiter = `const limit = isHeavy ? 15 : 300;`;
const newRateLimiter = `const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('127.0.0.1');
    const limit = isLocalhost ? 2000 : (isHeavy ? 15 : 300);`;

if (serverContent.includes(oldRateLimiter)) {
    serverContent = serverContent.replace(oldRateLimiter, newRateLimiter);
    console.log('✅ Upgraded rate limiter in server.js to allow localhost high throughput');
}

// 2.2 Update /api/custom-ai-chat to fallback to process.env if params missing
const oldCustomAiChatHeader = `app.post('/api/custom-ai-chat', async (req, res) => {\n    const { baseUrl, apiKey, model, messages, tools, systemInstruction, stream } = req.body;\n    if (!baseUrl || !apiKey || !model) {\n        return res.status(400).json({ success: false, error: 'Thiếu cấu hình Custom AI (Base URL, API Key hoặc Model).' });\n    }`;

const oldCustomAiChatHeaderCRLF = `app.post('/api/custom-ai-chat', async (req, res) => {\r\n    const { baseUrl, apiKey, model, messages, tools, systemInstruction, stream } = req.body;\r\n    if (!baseUrl || !apiKey || !model) {\r\n        return res.status(400).json({ success: false, error: 'Thiếu cấu hình Custom AI (Base URL, API Key hoặc Model).' });\r\n    }`;

const newCustomAiChatHeader = `app.post('/api/custom-ai-chat', async (req, res) => {
    let { baseUrl, apiKey, model, messages, tools, systemInstruction, stream } = req.body;
    baseUrl = baseUrl || process.env.CUSTOM_AI_BASE_URL || 'https://api.miraiapi.com/v1';
    apiKey = apiKey || process.env.CUSTOM_AI_KEY;
    model = model || process.env.CUSTOM_AI_MODEL || 'deepseek-v4-pro';
    if (!baseUrl || !apiKey || !model) {
        return res.status(400).json({ success: false, error: 'Thiếu cấu hình Custom AI (Base URL, API Key hoặc Model).' });
    }`;

if (serverContent.includes(oldCustomAiChatHeader)) {
    serverContent = serverContent.replace(oldCustomAiChatHeader, newCustomAiChatHeader);
    console.log('✅ Added env fallbacks to /api/custom-ai-chat in server.js (LF)');
} else if (serverContent.includes(oldCustomAiChatHeaderCRLF)) {
    serverContent = serverContent.replace(oldCustomAiChatHeaderCRLF, newCustomAiChatHeader);
    console.log('✅ Added env fallbacks to /api/custom-ai-chat in server.js (CRLF)');
} else {
    // regex fallback
    serverContent = serverContent.replace(
        /app\.post\('\/api\/custom-ai-chat',\s*async\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*?if\s*\(!baseUrl\s*\|\|\s*!apiKey\s*\|\|\s*!model\)\s*\{[\s\S]*?\}/,
        newCustomAiChatHeader
    );
    console.log('✅ Added env fallbacks to /api/custom-ai-chat via regex');
}

// 2.3 Pass useCustomAi in getOrchestrator
const oldGetOrch = `globalOrchestrator = new AgentOrchestrator(apiKey, {
            maxRetries: 3,
            timeout: 75000,
            parallelLimit: 5
        });`;
const oldGetOrchCRLF = `globalOrchestrator = new AgentOrchestrator(apiKey, {\r\n            maxRetries: 3,\r\n            timeout: 75000,\r\n            parallelLimit: 5\r\n        });`;

const newGetOrch = `globalOrchestrator = new AgentOrchestrator(apiKey, {
            maxRetries: 3,
            timeout: 75000,
            parallelLimit: 5,
            useCustomAi: process.env.USE_CUSTOM_AI === 'true'
        });`;

if (serverContent.includes(oldGetOrch)) {
    serverContent = serverContent.replace(oldGetOrch, newGetOrch);
    console.log('✅ Updated getOrchestrator with useCustomAi in server.js (LF)');
} else if (serverContent.includes(oldGetOrchCRLF)) {
    serverContent = serverContent.replace(oldGetOrchCRLF, newGetOrch);
    console.log('✅ Updated getOrchestrator with useCustomAi in server.js (CRLF)');
}

fs.writeFileSync(serverPath, serverContent, 'utf8');

// 3. Update agents/AgentOrchestrator.js
const orchPath = path.join(__dirname, 'agents', 'AgentOrchestrator.js');
let orchContent = fs.readFileSync(orchPath, 'utf8');

// 3.1 execute() sets this.useCustomAiForRun
const oldExecStart = `async execute(userRequest, context = {}) {
        this.executionLog = [];`;
const oldExecStartCRLF = `async execute(userRequest, context = {}) {\r\n        this.executionLog = [];`;
const newExecStart = `async execute(userRequest, context = {}) {
        this.executionLog = [];
        this.useCustomAiForRun = Boolean(context.useCustomAi || this.customAi?.enabled || process.env.USE_CUSTOM_AI === 'true');
        this.currentContext = context;`;

if (orchContent.includes(oldExecStart)) {
    orchContent = orchContent.replace(oldExecStart, newExecStart);
    console.log('✅ Updated execute() in AgentOrchestrator.js (LF)');
} else if (orchContent.includes(oldExecStartCRLF)) {
    orchContent = orchContent.replace(oldExecStartCRLF, newExecStart);
    console.log('✅ Updated execute() in AgentOrchestrator.js (CRLF)');
}

// 3.2 isUsingCustomAi in callAgent
const oldCallCustomAi = `const isUsingCustomAi = Boolean(this.useCustomAiForRun || this.customAi?.enabled || payload?.useCustomAi || payload?.context?.useCustomAi);`;
const newCallCustomAi = `const isUsingCustomAi = Boolean(this.useCustomAiForRun || this.customAi?.enabled || payload?.useCustomAi || payload?.context?.useCustomAi || process.env.USE_CUSTOM_AI === 'true');`;
if (orchContent.includes(oldCallCustomAi)) {
    orchContent = orchContent.replace(oldCallCustomAi, newCallCustomAi);
    console.log('✅ Updated isUsingCustomAi in callAgent');
}

// 3.3 Add token tracking in callAgent after receiving data
const oldDataJson = `const data = await response.json();
            const latency = Date.now() - startTime;`;
const oldDataJsonCRLF = `const data = await response.json();\r\n            const latency = Date.now() - startTime;`;
const newDataJson = `const data = await response.json();
            const latency = Date.now() - startTime;
            const consumedNow = (data.usageMetadata?.totalTokenCount) || (data.usage?.total_tokens) || 0;
            this.totalTokensConsumed = (this.totalTokensConsumed || 0) + consumedNow;`;

if (orchContent.includes(oldDataJson)) {
    orchContent = orchContent.replace(oldDataJson, newDataJson);
    console.log('✅ Added token accumulation for initial response (LF)');
} else if (orchContent.includes(oldDataJsonCRLF)) {
    orchContent = orchContent.replace(oldDataJsonCRLF, newDataJson);
    console.log('✅ Added token accumulation for initial response (CRLF)');
}

// 3.4 Add token tracking in tool followUpData
const oldFollowUpJson = `const followUpData = await followUpRes.json();
                if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {`;
const oldFollowUpJsonCRLF = `const followUpData = await followUpRes.json();\r\n                if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {`;
const newFollowUpJson = `const followUpData = await followUpRes.json();
                const consumedFollowUp = (followUpData.usageMetadata?.totalTokenCount) || (followUpData.usage?.total_tokens) || 0;
                this.totalTokensConsumed = (this.totalTokensConsumed || 0) + consumedFollowUp;
                if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {`;

if (orchContent.includes(oldFollowUpJson)) {
    orchContent = orchContent.replace(oldFollowUpJson, newFollowUpJson);
    console.log('✅ Added token accumulation for tool follow-up (LF)');
} else if (orchContent.includes(oldFollowUpJsonCRLF)) {
    orchContent = orchContent.replace(oldFollowUpJsonCRLF, newFollowUpJson);
    console.log('✅ Added token accumulation for tool follow-up (CRLF)');
}

// 3.5 Add repetitive tool loop guard
const oldToolLoopStart = `let toolIterationCount = 0;
            const MAX_TOOL_ITERATIONS = 5;

            // 1. KIỂM TRA & THỰC THI CHUỖI CÔNG CỤ ĐA BƯỚC (Multi-step Tool Calling Loop với Parallelization & Deduplication)
            while (toolIterationCount < MAX_TOOL_ITERATIONS) {`;

const oldToolLoopStartCRLF = `let toolIterationCount = 0;\r\n            const MAX_TOOL_ITERATIONS = 5;\r\n\r\n            // 1. KIỂM TRA & THỰC THI CHUỖI CÔNG CỤ ĐA BƯỚC (Multi-step Tool Calling Loop với Parallelization & Deduplication)\r\n            while (toolIterationCount < MAX_TOOL_ITERATIONS) {`;

const newToolLoopStart = `let toolIterationCount = 0;
            let previousToolSignature = '';
            const MAX_TOOL_ITERATIONS = 5;

            // 1. KIỂM TRA & THỰC THI CHUỖI CÔNG CỤ ĐA BƯỚC (Multi-step Tool Calling Loop với LoopGuard)
            while (toolIterationCount < MAX_TOOL_ITERATIONS) {`;

if (orchContent.includes(oldToolLoopStart)) {
    orchContent = orchContent.replace(oldToolLoopStart, newToolLoopStart);
} else if (orchContent.includes(oldToolLoopStartCRLF)) {
    orchContent = orchContent.replace(oldToolLoopStartCRLF, newToolLoopStart);
}

const oldToolCallsMap = `const toolCalls = functionCallParts.map(p => ({
                    name: p.functionCall.name,
                    args: p.functionCall.args || {}
                }));`;
const oldToolCallsMapCRLF = `const toolCalls = functionCallParts.map(p => ({\r\n                    name: p.functionCall.name,\r\n                    args: p.functionCall.args || {}\r\n                }));`;

const newToolCallsMap = `const toolCalls = functionCallParts.map(p => ({
                    name: p.functionCall.name,
                    args: p.functionCall.args || {}
                }));

                const currentToolSignature = JSON.stringify(toolCalls);
                if (previousToolSignature && previousToolSignature === currentToolSignature) {
                    this.log(\`⚠️ [LoopGuard] \${agentRole} lặp lại công cụ giống hệt bước trước, tự động ngắt và tổng hợp phản hồi.\`);
                    break;
                }
                previousToolSignature = currentToolSignature;`;

if (orchContent.includes(oldToolCallsMap)) {
    orchContent = orchContent.replace(oldToolCallsMap, newToolCallsMap);
    console.log('✅ Added repetitive tool loop guard (LF)');
} else if (orchContent.includes(oldToolCallsMapCRLF)) {
    orchContent = orchContent.replace(oldToolCallsMapCRLF, newToolCallsMap);
    console.log('✅ Added repetitive tool loop guard (CRLF)');
}

// 3.6 _callModelApi env fallbacks
const oldCallModelHeader = `if (useCustomAi && this.customAi?.apiKey) {
            const customAiUrl = \`\${this.config.serverUrl || 'http://localhost:3000'}/api/custom-ai-chat\`;
            return await activeFetch(customAiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseUrl: this.customAi.baseUrl,
                    model: this.customAi.model,
                    apiKey: this.customAi.apiKey,
                    messages: requestBody.contents,
                    tools: requestBody.tools,
                    systemInstruction: requestBody.systemInstruction
                }),
                signal: this._createSignal(timeoutMs, externalSignal)
            });
        }`;

const oldCallModelHeaderCRLF = `if (useCustomAi && this.customAi?.apiKey) {\r\n            const customAiUrl = \`\${this.config.serverUrl || 'http://localhost:3000'}/api/custom-ai-chat\`;\r\n            return await activeFetch(customAiUrl, {\r\n                method: 'POST',\r\n                headers: { 'Content-Type': 'application/json' },\r\n                body: JSON.stringify({\r\n                    baseUrl: this.customAi.baseUrl,\r\n                    model: this.customAi.model,\r\n                    apiKey: this.customAi.apiKey,\r\n                    messages: requestBody.contents,\r\n                    tools: requestBody.tools,\r\n                    systemInstruction: requestBody.systemInstruction\r\n                }),\r\n                signal: this._createSignal(timeoutMs, externalSignal)\r\n            });\r\n        }`;

const newCallModelHeader = `const customApiKey = this.customAi?.apiKey || process.env.CUSTOM_AI_KEY || '';
        const customBaseUrl = this.customAi?.baseUrl || process.env.CUSTOM_AI_BASE_URL || 'https://api.miraiapi.com/v1';
        const customModel = this.customAi?.model || process.env.CUSTOM_AI_MODEL || 'deepseek-v4-pro';

        if (useCustomAi && customApiKey) {
            const customAiUrl = \`\${this.config.serverUrl || 'http://localhost:3000'}/api/custom-ai-chat\`;
            return await activeFetch(customAiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseUrl: customBaseUrl,
                    model: customModel,
                    apiKey: customApiKey,
                    messages: requestBody.contents,
                    tools: requestBody.tools,
                    systemInstruction: requestBody.systemInstruction
                }),
                signal: this._createSignal(timeoutMs, externalSignal)
            });
        }`;

if (orchContent.includes(oldCallModelHeader)) {
    orchContent = orchContent.replace(oldCallModelHeader, newCallModelHeader);
    console.log('✅ Added env fallbacks in _callModelApi (LF)');
} else if (orchContent.includes(oldCallModelHeaderCRLF)) {
    orchContent = orchContent.replace(oldCallModelHeaderCRLF, newCallModelHeader);
    console.log('✅ Added env fallbacks in _callModelApi (CRLF)');
}

fs.writeFileSync(orchPath, orchContent, 'utf8');
console.log('🎉 All updates applied successfully!');

