const fs = require('fs');
const path = require('path');

// 1. Sanitize experiences.json
const expFile = path.join(__dirname, 'memory', 'experiences.json');
if (fs.existsSync(expFile)) {
    const raw = JSON.parse(fs.readFileSync(expFile, 'utf8'));
    console.log(`Original experiences: ${raw.length}`);
    const cleaned = raw.map(e => ({
        task: (e.task || '').slice(0, 150),
        solution: (typeof e.solution === 'string' ? e.solution : JSON.stringify(e.solution || '')).slice(0, 300),
        takeaway: (e.takeaway || '').slice(0, 250),
        tags: Array.isArray(e.tags) ? e.tags.slice(0, 5) : [],
        qualityScore: e.qualityScore || 85
    }));
    fs.writeFileSync(expFile, JSON.stringify(cleaned, null, 2), 'utf8');
    console.log(`✅ Cleaned experiences.json! File size now: ${fs.statSync(expFile).size} bytes`);
}

// 2. Update server.js
const serverFile = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverFile, 'utf8');

// Replace experience loading in /api/v2/execute
const oldExpLoad = `// Load experiences
        let experiences = [];
        try {
            if (fs.existsSync(EXPERIENCES_FILE)) {
                const content = fs.readFileSync(EXPERIENCES_FILE, 'utf8');
                experiences = JSON.parse(content);
                console.log(\`📚 Loaded \${experiences.length} experiences\`);
            }
        } catch (e) {
            console.warn('⚠️ Could not load experiences:', e.message);
        }`;

const oldExpLoadCRLF = `// Load experiences\r\n        let experiences = [];\r\n        try {\r\n            if (fs.existsSync(EXPERIENCES_FILE)) {\r\n                const content = fs.readFileSync(EXPERIENCES_FILE, 'utf8');\r\n                experiences = JSON.parse(content);\r\n                console.log(\`📚 Loaded \${experiences.length} experiences\`);\r\n            }\r\n        } catch (e) {\r\n            console.warn('⚠️ Could not load experiences:', e.message);\r\n        }`;

const newExpLoad = `// Load concise experiences (avoid token bloat)
        let experiences = [];
        try {
            if (fs.existsSync(EXPERIENCES_FILE)) {
                const content = fs.readFileSync(EXPERIENCES_FILE, 'utf8');
                const rawExp = JSON.parse(content);
                experiences = rawExp.slice(-5).map(e => ({
                    task: (e.task || '').slice(0, 120),
                    takeaway: (e.takeaway || '').slice(0, 200),
                    tags: e.tags || []
                }));
                console.log(\`📚 Loaded \${experiences.length} concise experiences\`);
            }
        } catch (e) {
            console.warn('⚠️ Could not load experiences:', e.message);
        }`;

if (serverContent.includes(oldExpLoad)) {
    serverContent = serverContent.replace(oldExpLoad, newExpLoad);
    console.log('✅ Updated experience loading in server.js (LF)');
} else if (serverContent.includes(oldExpLoadCRLF)) {
    serverContent = serverContent.replace(oldExpLoadCRLF, newExpLoad);
    console.log('✅ Updated experience loading in server.js (CRLF)');
}

// Replace any remaining 75000 timeout in server.js
serverContent = serverContent.replace(/timeout:\s*75000/g, 'timeout: 120000');
fs.writeFileSync(serverFile, serverContent, 'utf8');

// 3. Update agents/AgentOrchestrator.js
const orchFile = path.join(__dirname, 'agents', 'AgentOrchestrator.js');
let orchContent = fs.readFileSync(orchFile, 'utf8');

// Replace all 75000 timeouts with 120000
orchContent = orchContent.replace(/75000/g, '120000');
console.log('✅ Replaced all 75000 timeouts with 120000 in AgentOrchestrator.js');

// Fix the prompt payload bloat at line 1270
const oldPromptBuild = `contents: [{
                    role: 'user',
                    parts: [{ text: (payload?.context?.optimalStrategy ? \`⚡ [CHIẾN LƯỢC TỐI ƯU ĐÃ CHỨNG MINH - TIẾT KIỆM TOKEN]:\\n- Bài học kinh nghiệm: \${payload.context.optimalStrategy.bestRoute}\\n- Áp dụng trực tiếp giải pháp trên để tránh thử sai gây tốn token.\\n\\n\` : '') + (typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)) }]
                }],`;

const oldPromptBuildCRLF = `contents: [{\r\n                    role: 'user',\r\n                    parts: [{ text: (payload?.context?.optimalStrategy ? \`⚡ [CHIẾN LƯỢC TỐI ƯU ĐÃ CHỨNG MINH - TIẾT KIỆM TOKEN]:\\n- Bài học kinh nghiệm: \${payload.context.optimalStrategy.bestRoute}\\n- Áp dụng trực tiếp giải pháp trên để tránh thử sai gây tốn token.\\n\\n\` : '') + (typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)) }]\r\n                }],`;

const newPromptBuild = `contents: [{
                    role: 'user',
                    parts: [{ 
                        text: (() => {
                            let txt = '';
                            if (payload?.context?.optimalStrategy?.bestRoute) {
                                txt += \`⚡ [CHIẾN LƯỢC TỐI ƯU]: \${payload.context.optimalStrategy.bestRoute}\\n\\n\`;
                            }
                            if (typeof payload === 'string') {
                                txt += payload;
                            } else if (payload && typeof payload === 'object') {
                                if (payload.task) txt += \`[NHIỆM VỤ]: \${payload.task}\\n\`;
                                if (payload.userRequest && payload.userRequest !== payload.task) txt += \`[YÊU CẦU GỐC]: \${payload.userRequest}\\n\`;
                                if (payload.directive) {
                                    const dir = typeof payload.directive === 'string' ? payload.directive : JSON.stringify(payload.directive);
                                    txt += \`[ĐỊNH HƯỚNG CHIẾN LƯỢC]: \${dir.slice(0, 1500)}\\n\`;
                                }
                                if (payload.allSpecialistResults) {
                                    txt += \`[KẾT QUẢ CHUYÊN VIÊN]: \${JSON.stringify(payload.allSpecialistResults).slice(0, 2000)}\\n\`;
                                }
                                if (payload.result) {
                                    const rStr = typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result);
                                    txt += \`[KẾT QUẢ CẦN THẨM ĐỊNH]: \${rStr.slice(0, 2500)}\\n\`;
                                }
                                if (!txt) {
                                    // Fallback without serializing bloated context.experiences
                                    const shallow = { ...payload };
                                    delete shallow.context;
                                    txt += JSON.stringify(shallow, null, 2).slice(0, 3000);
                                }
                            }
                            return txt;
                        })()
                    }]
                }],`;

if (orchContent.includes(oldPromptBuild)) {
    orchContent = orchContent.replace(oldPromptBuild, newPromptBuild);
    console.log('✅ Eliminated prompt payload bloat in AgentOrchestrator.js (LF)');
} else if (orchContent.includes(oldPromptBuildCRLF)) {
    orchContent = orchContent.replace(oldPromptBuildCRLF, newPromptBuild);
    console.log('✅ Eliminated prompt payload bloat in AgentOrchestrator.js (CRLF)');
} else {
    console.warn('⚠️ Could not match exact oldPromptBuild string, applying regex');
    orchContent = orchContent.replace(
        /contents:\s*\[\{\s*role:\s*'user',\s*parts:\s*\[\{\s*text:\s*\(payload\?\.context\?\.optimalStrategy[\s\S]*?\}\]\s*\}\],/,
        newPromptBuild
    );
    console.log('✅ Eliminated prompt payload bloat via regex');
}

fs.writeFileSync(orchFile, orchContent, 'utf8');
console.log('🎉 Done fixing bloat!');

