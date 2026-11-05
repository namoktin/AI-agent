const fs = require('fs');
const path = require('path');

// 1. Update agents/AdaptivePlanner.js - remove redundant T003 in standard mode
const plannerFile = path.join(__dirname, 'agents', 'AdaptivePlanner.js');
let plannerContent = fs.readFileSync(plannerFile, 'utf8');

const oldStandardTasks = `tasks: [
                        {
                            id: 'T001',
                            description: \`Thu thập thông tin và phân tích dữ liệu cho: \${userRequest}\`,
                            assignedTo: 'researcher',
                            priority: 1,
                            parallelizable: true
                        },
                        {
                            id: 'T002',
                            description: \`Triển khai giải pháp chi tiết hoặc nội dung kỹ thuật cho: \${userRequest}\`,
                            assignedTo: 'developer',
                            priority: 2,
                            parallelizable: true
                        },
                        {
                            id: 'T003',
                            description: \`Thẩm định chất lượng, rà soát lỗ hổng và tối ưu kết quả\`,
                            assignedTo: 'critic',
                            dependencies: ['T001', 'T002'],
                            priority: 3,
                            parallelizable: false
                        }
                    ],`;

const oldStandardTasksCRLF = `tasks: [\r\n                        {\r\n                            id: 'T001',\r\n                            description: \`Thu thập thông tin và phân tích dữ liệu cho: \${userRequest}\`,\r\n                            assignedTo: 'researcher',\r\n                            priority: 1,\r\n                            parallelizable: true\r\n                        },\r\n                        {\r\n                            id: 'T002',\r\n                            description: \`Triển khai giải pháp chi tiết hoặc nội dung kỹ thuật cho: \${userRequest}\`,\r\n                            assignedTo: 'developer',\r\n                            priority: 2,\r\n                            parallelizable: true\r\n                        },\r\n                        {\r\n                            id: 'T003',\r\n                            description: \`Thẩm định chất lượng, rà soát lỗ hổng và tối ưu kết quả\`,\r\n                            assignedTo: 'critic',\r\n                            dependencies: ['T001', 'T002'],\r\n                            priority: 3,\r\n                            parallelizable: false\r\n                        }\r\n                    ],`;

const newStandardTasks = `tasks: [
                        {
                            id: 'T001',
                            description: \`Thu thập thông tin, nghiên cứu thị trường và phân tích dữ liệu cho: \${userRequest}\`,
                            assignedTo: 'researcher',
                            priority: 1,
                            parallelizable: true
                        },
                        {
                            id: 'T002',
                            description: \`Triển khai giải pháp kỹ thuật, code/script và nội dung hoàn chỉnh cho: \${userRequest}\`,
                            assignedTo: 'developer',
                            priority: 1,
                            parallelizable: true
                        }
                    ],`;

if (plannerContent.includes(oldStandardTasks)) {
    plannerContent = plannerContent.replace(oldStandardTasks, newStandardTasks);
    console.log('✅ Removed redundant T003 from standard mode in AdaptivePlanner.js (LF)');
} else if (plannerContent.includes(oldStandardTasksCRLF)) {
    plannerContent = plannerContent.replace(oldStandardTasksCRLF, newStandardTasks);
    console.log('✅ Removed redundant T003 from standard mode in AdaptivePlanner.js (CRLF)');
}

fs.writeFileSync(plannerFile, plannerContent, 'utf8');

// 2. Update agents/AgentOrchestrator.js
const orchFile = path.join(__dirname, 'agents', 'AgentOrchestrator.js');
let orchContent = fs.readFileSync(orchFile, 'utf8');

// 2.1 disableTools support in callAgent
const oldToolDefs = `const toolDefs = (agent.enableTools && this.toolExecutor)
                ? this.toolExecutor.getToolDefinitions()
                : null;`;
const oldToolDefsCRLF = `const toolDefs = (agent.enableTools && this.toolExecutor)\r\n                ? this.toolExecutor.getToolDefinitions()\r\n                : null;`;

const newToolDefs = `const toolDefs = (agent.enableTools && this.toolExecutor && !payload?.disableTools)
                ? this.toolExecutor.getToolDefinitions()
                : null;`;

if (orchContent.includes(oldToolDefs)) {
    orchContent = orchContent.replace(oldToolDefs, newToolDefs);
    console.log('✅ Added disableTools flag check in callAgent (LF)');
} else if (orchContent.includes(oldToolDefsCRLF)) {
    orchContent = orchContent.replace(oldToolDefsCRLF, newToolDefs);
    console.log('✅ Added disableTools flag check in callAgent (CRLF)');
}

// 2.2 Disable tools in Stage 4 Consensus Debate
const oldDebateCritique = `const critique = await this.callAgent('critic', {
                task: 'Đối chiếu chéo nội dung, tìm mâu thuẫn sự thật và đánh giá mức độ đồng thuận thực tế của các kết quả',
                allSpecialistResults: allSummaries,
                userRequest: userRequest
            });`;

const oldDebateCritiqueCRLF = `const critique = await this.callAgent('critic', {\r\n                task: 'Đối chiếu chéo nội dung, tìm mâu thuẫn sự thật và đánh giá mức độ đồng thuận thực tế của các kết quả',\r\n                allSpecialistResults: allSummaries,\r\n                userRequest: userRequest\r\n            });`;

const newDebateCritique = `const critique = await this.callAgent('critic', {
                task: 'Đối chiếu chéo nội dung, tìm mâu thuẫn sự thật và đánh giá mức độ đồng thuận thực tế của các kết quả',
                allSpecialistResults: allSummaries,
                userRequest: userRequest,
                disableTools: true
            });`;

if (orchContent.includes(oldDebateCritique)) {
    orchContent = orchContent.replace(oldDebateCritique, newDebateCritique);
    console.log('✅ Disabled tools for Stage 4 debate critique in AgentOrchestrator.js (LF)');
} else if (orchContent.includes(oldDebateCritiqueCRLF)) {
    orchContent = orchContent.replace(oldDebateCritiqueCRLF, newDebateCritique);
    console.log('✅ Disabled tools for Stage 4 debate critique in AgentOrchestrator.js (CRLF)');
}

// 2.3 Disable tools in Stage 4.5 Remediation call
const oldRemediationCall = `const remediationExec = await this.callAgent(remediationRole, {
                            task: remediationPrompt,
                            userRequest: userRequest,
                            directive: arbDirective,
                            priorBestContent: bestPriorText.slice(0, 3000)
                        }, 'autonomous');`;

const oldRemediationCallCRLF = `const remediationExec = await this.callAgent(remediationRole, {\r\n                            task: remediationPrompt,\r\n                            userRequest: userRequest,\r\n                            directive: arbDirective,\r\n                            priorBestContent: bestPriorText.slice(0, 3000)\r\n                        }, 'autonomous');`;

const newRemediationCall = `const remediationExec = await this.callAgent(remediationRole, {
                            task: remediationPrompt,
                            userRequest: userRequest,
                            directive: arbDirective,
                            priorBestContent: bestPriorText.slice(0, 3000),
                            disableTools: true
                        }, 1);`;

if (orchContent.includes(oldRemediationCall)) {
    orchContent = orchContent.replace(oldRemediationCall, newRemediationCall);
    console.log('✅ Streamlined Stage 4.5 remediation call (LF)');
} else if (orchContent.includes(oldRemediationCallCRLF)) {
    orchContent = orchContent.replace(oldRemediationCallCRLF, newRemediationCall);
    console.log('✅ Streamlined Stage 4.5 remediation call (CRLF)');
}

// 2.4 Disable tools in Stage 6 Final Quality Gate
const oldFinalCritique = `const finalCritique = await this.callAgent('critic', {
                task: 'Final quality assessment',
                result: consensus.finalResult,
                audit: audit,
                userRequest: userRequest
            });`;

const oldFinalCritiqueCRLF = `const finalCritique = await this.callAgent('critic', {\r\n                task: 'Final quality assessment',\r\n                result: consensus.finalResult,\r\n                audit: audit,\r\n                userRequest: userRequest\r\n            });`;

const newFinalCritique = `const finalCritique = await this.callAgent('critic', {
                task: 'Final quality assessment',
                result: consensus.finalResult,
                audit: audit,
                userRequest: userRequest,
                disableTools: true
            });`;

if (orchContent.includes(oldFinalCritique)) {
    orchContent = orchContent.replace(oldFinalCritique, newFinalCritique);
    console.log('✅ Disabled tools for Stage 6 final critique (LF)');
} else if (orchContent.includes(oldFinalCritiqueCRLF)) {
    orchContent = orchContent.replace(oldFinalCritiqueCRLF, newFinalCritique);
    console.log('✅ Disabled tools for Stage 6 final critique (CRLF)');
}

fs.writeFileSync(orchFile, orchContent, 'utf8');
console.log('🎉 All streamline optimizations applied successfully!');

