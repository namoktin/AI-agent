const fs = require('fs');
const path = require('path');

// 1. Patch ToolExecutor.js
const toolExecutorPath = path.join(__dirname, 'agents', 'ToolExecutor.js');
let teContent = fs.readFileSync(toolExecutorPath, 'utf8');

if (!teContent.includes("'SCRAPE_SOCIAL_MEDIA': '/api/scrape-social'")) {
    teContent = teContent.replace(
        "'BROWSE_WEB': '/api/browse-web',",
        "'BROWSE_WEB': '/api/browse-web',\r\n            'SCRAPE_SOCIAL_MEDIA': '/api/scrape-social',"
    );
    
    const socialToolDef = `            {
                name: 'SCRAPE_SOCIAL_MEDIA',
                description: 'Bóc tách dữ liệu đa mạng xã hội chuyên sâu: lấy chuẩn xác Caption, Lượt xem, Lượt thích, Bình luận, Tác giả cho 10+ mạng xã hội (Facebook, TikTok, YouTube, Instagram, X/Twitter, Reddit, Threads, LinkedIn, Pinterest, Bluesky).',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        url: {
                            type: 'STRING',
                            description: 'Đường dẫn URL bài viết/video mạng xã hội cần bóc tách'
                        },
                        headless: {
                            type: 'BOOLEAN',
                            description: 'Chạy ngầm (mặc định true)'
                        }
                    },
                    required: ['url']
                }
            },
`;
    teContent = teContent.replace("name: 'BROWSE_WEB',", socialToolDef + "            {\r\n                name: 'BROWSE_WEB',");
    fs.writeFileSync(toolExecutorPath, teContent, 'utf8');
    console.log('✓ Patched ToolExecutor.js with SCRAPE_SOCIAL_MEDIA');
}

// 2. Patch AgentOrchestrator.js with OptimalStrategyCache token saver
const orchPath = path.join(__dirname, 'agents', 'AgentOrchestrator.js');
let orchContent = fs.readFileSync(orchPath, 'utf8');

const hookSkill = `        const matchingSkill = this.skillLibrary.findMatchingSkill(userRequest);
        if (matchingSkill) {
            this.log(\`💡 [SkillLibrary] Found procedural skill match: [\${matchingSkill.name}] (Match: \${Math.round(matchingSkill.matchScore * 100)}%)\`);
            context.matchedSkill = matchingSkill;
        }`;

const newHookSkill = `        const matchingSkill = this.skillLibrary.findMatchingSkill(userRequest);
        if (matchingSkill) {
            this.log(\`💡 [SkillLibrary] Found procedural skill match: [\${matchingSkill.name}] (Match: \${Math.round(matchingSkill.matchScore * 100)}%)\`);
            context.matchedSkill = matchingSkill;
        }

        // 2.1 ZERO-TRIAL OPTIMAL STRATEGY (Tiết kiệm Token & Chống Thử-Sai Lặp Lại)
        const optimalStrategy = this.skillLibrary.getOptimalStrategy(userRequest);
        if (optimalStrategy) {
            this.log(\`⚡ [OptimalStrategyCache] Zero-Trial Route detected for [\${optimalStrategy.key}]: Tiết kiệm ~\${optimalStrategy.tokensSaved || 1500} tokens\`);
            context.optimalStrategy = optimalStrategy;
        }`;

if (!orchContent.includes('// 2.1 ZERO-TRIAL OPTIMAL STRATEGY')) {
    orchContent = orchContent.replace(hookSkill.replace(/\n/g, '\r\n'), newHookSkill.replace(/\n/g, '\r\n'));
    console.log('✓ Injected OptimalStrategy retrieval into AgentOrchestrator.js');
}

// In callAgent, prepend optimal strategy
const callAgentPromptHook = "parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }]";
const newCallAgentPrompt = `parts: [{ text: (payload?.context?.optimalStrategy ? \`⚡ [CHIẾN LƯỢC TỐI ƯU ĐÃ CHỨNG MINH - TIẾT KIỆM TOKEN]:\\n- Bài học kinh nghiệm: \${payload.context.optimalStrategy.bestRoute}\\n- Áp dụng trực tiếp giải pháp trên để tránh thử sai gây tốn token.\\n\\n\` : '') + (typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)) }]`;

if (!orchContent.includes('⚡ [CHIẾN LƯỢC TỐI ƯU ĐÃ CHỨNG MINH')) {
    orchContent = orchContent.replace(callAgentPromptHook, newCallAgentPrompt);
    console.log('✓ Injected OptimalStrategy prompt optimization in callAgent');
}

fs.writeFileSync(orchPath, orchContent, 'utf8');
console.log('Done patching AgentOrchestrator & ToolExecutor!');

