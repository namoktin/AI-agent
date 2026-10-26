const fs = require('fs');
const path = require('path');

// 1. Update server.js
const serverPath = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

// Add reqController to /api/v2/execute
const oldExecRoute = `app.post('/api/v2/execute', async (req, res) => {
    try {
        const { task, useCache = true, useGrounding = false, context = {}, useCustomAi = false } = req.body;`;

const oldExecRouteCRLF = `app.post('/api/v2/execute', async (req, res) => {\r\n    try {\r\n        const { task, useCache = true, useGrounding = false, context = {}, useCustomAi = false } = req.body;`;

const newExecRoute = `app.post('/api/v2/execute', async (req, res) => {
    const reqController = new AbortController();
    req.on('close', () => {
        if (!res.writableEnded) {
            reqController.abort(new Error('Client disconnected or request aborted'));
        }
    });

    try {
        const { task, useCache = true, useGrounding = false, context = {}, useCustomAi = false } = req.body;`;

if (serverContent.includes(oldExecRoute)) {
    serverContent = serverContent.replace(oldExecRoute, newExecRoute);
    console.log('✅ Added reqController in server.js (LF)');
} else if (serverContent.includes(oldExecRouteCRLF)) {
    serverContent = serverContent.replace(oldExecRouteCRLF, newExecRoute);
    console.log('✅ Added reqController in server.js (CRLF)');
}

// Pass signal to execute
const oldCallExec = `result = await globalOrchestrator.execute(task, {
                experiences: experiences.slice(-20),
                groundingResult: groundingResult,
                ...context,
                useCustomAi: useCustomAi || context.useCustomAi
            });`;

const oldCallExecCRLF = `result = await globalOrchestrator.execute(task, {\r\n                experiences: experiences.slice(-20),\r\n                groundingResult: groundingResult,\r\n                ...context,\r\n                useCustomAi: useCustomAi || context.useCustomAi\r\n            });`;

const newCallExec = `result = await globalOrchestrator.execute(task, {
                experiences: experiences.slice(-20),
                groundingResult: groundingResult,
                ...context,
                signal: reqController.signal,
                useCustomAi: useCustomAi || context.useCustomAi
            });`;

if (serverContent.includes(oldCallExec)) {
    serverContent = serverContent.replace(oldCallExec, newCallExec);
    console.log('✅ Passed signal to execute in server.js (LF)');
} else if (serverContent.includes(oldCallExecCRLF)) {
    serverContent = serverContent.replace(oldCallExecCRLF, newCallExec);
    console.log('✅ Passed signal to execute in server.js (CRLF)');
}

fs.writeFileSync(serverPath, serverContent, 'utf8');

// 2. Update agents/AgentOrchestrator.js
const orchPath = path.join(__dirname, 'agents', 'AgentOrchestrator.js');
let orchContent = fs.readFileSync(orchPath, 'utf8');

// 2.1 Max tool iterations = 2
const oldMaxIter = `const MAX_TOOL_ITERATIONS = 5;`;
const newMaxIter = `const MAX_TOOL_ITERATIONS = 2; // Tối ưu: 2 vòng công cụ là chuẩn vàng cho phối hợp đa tác nhân`;

if (orchContent.includes(oldMaxIter)) {
    orchContent = orchContent.replace(oldMaxIter, newMaxIter);
    console.log('✅ Set MAX_TOOL_ITERATIONS = 2 in AgentOrchestrator.js');
}

// 2.2 Increase default timeout to 120000ms
orchContent = orchContent.replace(/timeout:\s*75000/g, 'timeout: 120000');
orchContent = orchContent.replace(/timeoutMs\s*=\s*75000/g, 'timeoutMs = 120000');
console.log('✅ Set default timeout to 120000ms');

// 2.3 Optimize Stage 2: use adaptivePlan directly for speed and precision
const oldStage2Planning = `if (mode === 'deep_research' || mode === 'autonomous' || context.matchedSkill) {
                    this.log(\`📐 [AdaptivePlanner] Activated task graph directly (\${adaptivePlan.tasks.length} tasks)\`);
                    taskPlan = adaptivePlan;
                } else {`;

const oldStage2PlanningCRLF = `if (mode === 'deep_research' || mode === 'autonomous' || context.matchedSkill) {\r\n                    this.log(\`📐 [AdaptivePlanner] Activated task graph directly (\${adaptivePlan.tasks.length} tasks)\`);\r\n                    taskPlan = adaptivePlan;\r\n                } else {`;

const newStage2Planning = `if (mode === 'deep_research' || mode === 'autonomous' || mode === 'standard' || context.matchedSkill || (adaptivePlan?.tasks && adaptivePlan.tasks.length > 0)) {
                    this.log(\`📐 [AdaptivePlanner] Activated task graph directly (\${adaptivePlan.tasks.length} tasks)\`);
                    taskPlan = adaptivePlan;
                } else {`;

if (orchContent.includes(oldStage2Planning)) {
    orchContent = orchContent.replace(oldStage2Planning, newStage2Planning);
    console.log('✅ Optimized Stage 2 to activate adaptivePlan directly (LF)');
} else if (orchContent.includes(oldStage2PlanningCRLF)) {
    orchContent = orchContent.replace(oldStage2PlanningCRLF, newStage2Planning);
    console.log('✅ Optimized Stage 2 to activate adaptivePlan directly (CRLF)');
}

// 2.4 Optimize director maxOutputTokens to 2048 for faster strategic reasoning
const oldDirectorTokenConfig = `maxOutputTokens: agent.thinking ? 16384 : 8192,`;
const newDirectorTokenConfig = `maxOutputTokens: agentRole === 'director' ? 2048 : (agent.thinking ? 8192 : 4096),`;
if (orchContent.includes(oldDirectorTokenConfig)) {
    orchContent = orchContent.replace(oldDirectorTokenConfig, newDirectorTokenConfig);
    console.log('✅ Optimized maxOutputTokens per role (director = 2048, others = 4096-8192)');
}

// 2.5 Director prompt optimization: concise high-impact strategy
const oldDirectorPromptEnd = `**THỜI GIAN HỆ THỐNG:** \${timeStatement}`;
const newDirectorPromptEnd = `**THỜI GIAN HỆ THỐNG:** \${timeStatement}\n\n**QUY TẮC CÔ ĐỌNG:** Trình bày định hướng chiến lược súc tích, ngắn gọn (1-2 đoạn văn tập trung vào mục tiêu và tiêu chuẩn cốt lõi) để các chuyên viên bắt tay vào việc ngay.`;
if (orchContent.includes(oldDirectorPromptEnd)) {
    orchContent = orchContent.replace(oldDirectorPromptEnd, newDirectorPromptEnd);
    console.log('✅ Added concise guidance to Director prompt');
}

fs.writeFileSync(orchPath, orchContent, 'utf8');
console.log('🎉 Optimization patches applied successfully!');

