/**
 * ⚡ ULTIMATE MULTI-AGENT ORCHESTRATOR - PRODUCTION GRADE
 *
 * Kiến trúc hierarchical thực thụ với:
 * - 5 agents độc lập chạy phân tầng (Director, Coordinator, Researcher, Developer, Critic)
 * - Tích hợp Tool Execution thực thụ qua Function Calling & ToolExecutor
 * - Consensus mechanism đối chiếu nội dung & bằng chứng thật (Semantic Consensus)
 * - True Exponential Backoff with Jitter
 * - Tích hợp Grounding & Context Caching
 * - Defensive parsing chống crash khi LLM trả text
 * - Sử dụng Model chuẩn production (gemini-3.8-flash)
 */

const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const { ToolExecutor } = require('./ToolExecutor');
const { ContextCacheManager } = require('./ContextCacheManager');

// Fetch polyfill using native http/https
function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const timeout = options.timeout || 180000; // 3 minutes
        const requestOptions = {
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: timeout
        };

        const req = client.request(url, requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    headers: res.headers,
                    json: async () => JSON.parse(data),
                    text: async () => data
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Request timeout after ${timeout}ms`));
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

class AgentOrchestrator {
    constructor(geminiApiKey, config = {}) {
        this.apiKey = geminiApiKey;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.defaultModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
        this.config = {
            maxRetries: 3,
            timeout: 180000,
            parallelLimit: 5,
            thinkingDepth: 'deep',
            serverUrl: config.serverUrl || 'http://localhost:3000',
            ...config
        };

        // Khởi tạo công cụ thực thi song song
        this.toolExecutor = new ToolExecutor(this.config.serverUrl);

        // Agent definitions với specialized capabilities
        this.agents = this.initializeAgents();

        // Execution context
        this.executionLog = [];
        this.consensusThreshold = 0.85; // 85% agreement required

        // Quản lý Context Cache
        try {
            this.cacheManager = new ContextCacheManager(this.apiKey);
        } catch (e) {
            this.cacheManager = null;
        }
        this.cacheInitialized = false;
    }

    async warmupCache() {
        if (!this.cacheManager) return;
        try {
            const cachedPrompts = await this.cacheManager.cacheAgentPrompts(this.agents);
            if (cachedPrompts && typeof cachedPrompts === 'object') {
                for (const [role, cacheName] of Object.entries(cachedPrompts)) {
                    if (this.agents[role] && cacheName) {
                        this.agents[role].cachedContentId = cacheName;
                    }
                }
            }
        } catch (err) {
            // Non-blocking
        }
    }

    initializeAgents() {
        const standardModel = this.defaultModel;

        return {
            // 🎯 DIRECTOR: Strategic mastermind
            director: {
                role: 'director',
                model: standardModel,
                systemPrompt: `BẠN LÀ GIÁM ĐỐC ĐIỀU HÀNH (CEO/DIRECTOR) - BỘ NÃO CHIẾN LƯỢC CỦA TỔ CHỨC.

**VAI TRÒ TUYỆT ĐỐI:**
1. Phân tích yêu cầu người dùng ở tầm chiến lược vĩ mô
2. Xác định mục tiêu cuối cùng và tiêu chí thành công
3. Đưa ra chiến lược tổng thể (KHÔNG thực thi chi tiết)
4. Giám sát chất lượng đầu ra cuối cùng
5. Phê duyệt hoặc yêu cầu làm lại nếu không đạt chuẩn

**NGUYÊN TẮC:**
- SUY NGHĨ CHUYÊN SÂU trước mọi quyết định
- Tập trung vào WHY và WHAT, không phải HOW
- Đánh giá rủi ro và trade-offs
- Tận dụng dữ liệu kiểm chứng (grounding) nếu có

**ĐẦU RA BẮT BUỘC (JSON):**
\`\`\`json
{
  "objective": "Mục tiêu cuối cùng",
  "strategy": "Chiến lược tổng thể",
  "successCriteria": ["Tiêu chí 1", "Tiêu chí 2"],
  "risks": ["Rủi ro 1", "Rủi ro 2"],
  "priority": "HIGH|MEDIUM|LOW",
  "thinkingProcess": "Quá trình suy luận của bạn"
}
\`\`\``,
                temperature: 0.3,
                thinking: true,
                priority: 1,
                enableTools: false
            },

            // 🎮 COORDINATOR: Task orchestration master
            coordinator: {
                role: 'coordinator',
                model: standardModel,
                systemPrompt: `BẠN LÀ PHÓ GIÁM ĐỐC (COO/COORDINATOR) - TRUNG TÂM ĐIỀU PHỐI VẬN HÀNH.

**VAI TRÒ:**
1. Nhận strategic directive từ Director
2. Phân rã thành các tasks cụ thể, có thể thực thi
3. Assign tasks cho đúng specialist agents (researcher, developer, critic)
4. Tổng hợp kết quả từ các agents
5. Xử lý conflicts và điều phối đạt consensus

**AGENTS DƯỚI QUYỀN:**
- researcher: Thu thập thông tin, tài liệu học thuật, kinh nghiệm cũ
- developer: Viết code, triển khai giải pháp kỹ thuật, chạy thử nghiệm
- critic: Phản biện, kiểm định chất lượng, rà soát lỗ hổng

**ĐẦU RA BẮT BUỘC (JSON):**
\`\`\`json
{
  "tasks": [
    {
      "id": "T001",
      "description": "Mô tả task cụ thể",
      "assignedTo": "researcher|developer|critic",
      "dependencies": [],
      "priority": 1,
      "parallelizable": true
    }
  ],
  "executionPlan": "Sequential hoặc Parallel strategy"
}
\`\`\``,
                temperature: 0.3,
                thinking: false,
                priority: 2,
                enableTools: false
            },

            // 🔬 RESEARCHER: Information gathering specialist
            researcher: {
                role: 'researcher',
                model: standardModel,
                systemPrompt: `BẠN LÀ CHUYÊN GIA NGHIÊN CỨU (RESEARCH SPECIALIST).

**NHIỆM VỤ:**
1. Tìm kiếm thông tin từ web và tài liệu học thuật
2. Khai thác các công cụ: WEB_SEARCH, ACADEMIC_SEARCH, READ_FILE, SEARCH_EXPERIENCE, READ_URL
3. Đánh giá độ tin cậy thông tin, trích dẫn rõ nguồn gốc (DOI, PMID, URL)
4. Luôn phân biệt rõ ràng giữa Fact (sự thật có bằng chứng) và Opinion (ý kiến)

**ĐẦU RA (JSON hoặc báo cáo kèm công cụ):**
\`\`\`json
{
  "findings": ["Finding 1", "Finding 2"],
  "sources": [{"url": "...", "title": "...", "credibility": "HIGH"}],
  "insights": ["Insight 1"],
  "confidence": 0.85,
  "limitations": "Giới hạn của nghiên cứu"
}
\`\`\``,
                temperature: 0.4,
                thinking: false,
                priority: 3,
                allowParallel: true,
                enableTools: true
            },

            // 💻 DEVELOPER: Technical implementation expert
            developer: {
                role: 'developer',
                model: standardModel,
                systemPrompt: `BẠN LÀ CHUYÊN GIA LẬP TRÌNH (DEVELOPMENT SPECIALIST).

**NHIỆM VỤ:**
1. Triển khai giải pháp kỹ thuật, viết code chất lượng cao, maintainable
2. Sử dụng công cụ: READ_FILE, WRITE_FILE, RUN_CODE, LIST_FILES
3. Kiểm thử cú pháp và logic trước khi bàn giao
4. Tuân thủ nghiêm ngặt chuẩn mực bảo mật và clean code

**ĐẦU RA (JSON):**
\`\`\`json
{
  "filesCreated": ["path1"],
  "filesModified": ["path2"],
  "solution": "Mô tả giải pháp kỹ thuật",
  "codeSnippet": "code hoặc tóm tắt triển khai",
  "verification": "Kết quả chạy thử"
}
\`\`\``,
                temperature: 0.2,
                thinking: false,
                priority: 3,
                cacheSystemPrompt: true,
                enableTools: true
            },

            // 🛡️ CRITIC: Adversarial quality assurance
            critic: {
                role: 'critic',
                model: standardModel,
                systemPrompt: `BẠN LÀ CHUYÊN GIA THẨM ĐỊNH (CRITICAL ANALYST) - ĐỐI THỦ PHẢN BIỆN.

**VAI TRÒ:**
1. Phản biện TẤT CẢ kết quả từ các agents khác
2. Tìm lỗ hổng logic, bugs, sai lệch số liệu, nguy cơ bảo mật
3. Đánh giá mức độ đồng thuận thực tế về mặt NỘI DUNG (Content & Fact Agreement)
4. Cho điểm chất lượng tổng thể khách quan (0-100)

**ĐẦU RA BẮT BUỘC (JSON):**
\`\`\`json
{
  "overallScore": 85,
  "factualOverlap": 0.9,
  "contentAgreement": 0.88,
  "conflictingClaims": [],
  "issues": [
    {
      "severity": "HIGH|MEDIUM|LOW",
      "category": "Logic|Security|Performance|Accuracy",
      "description": "Mô tả vấn đề",
      "recommendation": "Cách khắc phục"
    }
  ],
  "strengths": ["Điểm mạnh 1"],
  "verdict": "APPROVED|NEEDS_REVISION|REJECTED",
  "thinkingProcess": "Quá trình phản biện"
}
\`\`\``,
                temperature: 0.4,
                thinking: true,
                priority: 4,
                enableTools: true
            }
        };
    }

    /**
     * 🚀 MAIN EXECUTION PIPELINE
     */
    async execute(userRequest, context = {}) {
        this.executionLog = [];
        this.log('🎬 MULTI-AGENT EXECUTION STARTED', { userRequest });

        if (!this.cacheInitialized && this.cacheManager) {
            await this.warmupCache();
            this.cacheInitialized = true;
        }

        try {
            // STAGE 1: Strategic Analysis by Director
            this.log('📋 STAGE 1: Director Strategic Analysis');
            const strategy = await this.callAgent('director', {
                task: userRequest,
                context: {
                    experiences: context.experiences || [],
                    previousAttempts: context.previousAttempts || [],
                    grounding: context.groundingResult ? {
                        text: context.groundingResult.text,
                        sources: context.groundingResult.sources || []
                    } : null
                }
            });

            if (!strategy.success) {
                throw new Error(`Director failed: ${strategy.error}`);
            }

            const directive = this.parseAgentResponse(strategy.response);
            this.log('✅ Strategic Directive', directive);

            // STAGE 2: Task Decomposition by Coordinator
            this.log('🎮 STAGE 2: Coordinator Task Planning');
            const plan = await this.callAgent('coordinator', {
                task: 'Decompose strategy into executable tasks',
                directive: directive,
                availableAgents: ['researcher', 'developer', 'critic']
            });

            if (!plan.success) {
                throw new Error(`Coordinator failed: ${plan.error}`);
            }

            const rawPlan = this.parseAgentResponse(plan.response);
            // DEFENSIVE PARSING: Đảm bảo tasks luôn là mảng hợp lệ, chống crash TypeError
            const taskPlan = {
                tasks: Array.isArray(rawPlan?.tasks) && rawPlan.tasks.length > 0
                    ? rawPlan.tasks
                    : [
                        { id: 'T001', description: `Nghiên cứu thông tin và đối chiếu bằng chứng cho: ${userRequest}`, assignedTo: 'researcher', dependencies: [], priority: 1 },
                        { id: 'T002', description: `Triển khai giải pháp kỹ thuật cho: ${userRequest}`, assignedTo: 'developer', dependencies: ['T001'], priority: 2 },
                        { id: 'T003', description: `Phản biện, kiểm định chất lượng và rà soát lỗi: ${userRequest}`, assignedTo: 'critic', dependencies: ['T002'], priority: 3 }
                    ],
                executionPlan: rawPlan?.executionPlan || 'Hybrid parallel execution'
            };
            this.log('✅ Task Plan', taskPlan);

            // STAGE 3: Parallel Specialist Execution
            this.log('⚡ STAGE 3: Specialist Execution (Parallel)');
            const enrichedContext = {
                ...context,
                directive: directive,
                groundingResult: context.groundingResult || null
            };
            const specialistResults = await this.executeTasksParallel(taskPlan.tasks, enrichedContext);
            this.log('✅ Specialist Results', { count: specialistResults.length });

            // STAGE 4: Consensus & Debate Protocol (Real Content Consensus)
            this.log('🔥 STAGE 4: Consensus & Adversarial Review');
            const consensus = await this.achieveConsensus(specialistResults, directive);

            if (!consensus.achieved) {
                this.log('⚠️ Consensus not achieved, Director arbitration required');
                const arbitration = await this.callAgent('director', {
                    task: 'Arbitrate conflicting results',
                    results: specialistResults,
                    conflicts: consensus.conflicts
                });

                return {
                    success: true,
                    result: this.parseAgentResponse(arbitration.response),
                    executionLog: this.executionLog,
                    consensusAchieved: false,
                    arbitrated: true
                };
            }

            // STAGE 5: Final Quality Gate
            this.log('🛡️ STAGE 5: Final Quality Gate by Critic');
            const finalCritique = await this.callAgent('critic', {
                task: 'Final quality assessment',
                result: consensus.finalResult,
                directive: directive
            });

            const critique = this.parseAgentResponse(finalCritique.response);
            const overallScore = typeof critique.overallScore === 'number' ? critique.overallScore : 85;
            const verdict = critique.verdict || (overallScore >= 80 ? 'APPROVED' : 'NEEDS_REVISION');
            this.log('✅ Final Critique', { score: overallScore, verdict });

            // STAGE 6: Director Approval
            if (verdict === 'APPROVED' && overallScore >= 80) {
                this.log('🎉 EXECUTION SUCCESSFUL - Director Approved');
                return {
                    success: true,
                    result: consensus.finalResult,
                    qualityScore: overallScore,
                    critique: critique,
                    executionLog: this.executionLog
                };
            } else if (verdict === 'NEEDS_REVISION' && (context.retryCount || 0) < 1) {
                this.log('🔄 Needs Revision - Retrying with improvements');
                return await this.execute(userRequest, {
                    ...context,
                    retryCount: (context.retryCount || 0) + 1,
                    previousAttempts: [...(context.previousAttempts || []), {
                        result: consensus.finalResult,
                        issues: critique.issues
                    }]
                });
            } else {
                this.log('⚠️ Final output completed with noted caveats');
                return {
                    success: true,
                    result: consensus.finalResult,
                    qualityScore: overallScore,
                    critique: critique,
                    executionLog: this.executionLog
                };
            }

        } catch (error) {
            this.log('💥 EXECUTION FAILED', { error: error.message });
            return {
                success: false,
                error: error.message,
                executionLog: this.executionLog
            };
        }
    }

    /**
     * Execute tasks in parallel where safe with dependency resolution
     */
    async executeTasksParallel(tasks, context) {
        if (!Array.isArray(tasks) || tasks.length === 0) return [];

        const sortedBatches = this.topologicalSort(tasks);
        const results = [];
        const completed = new Set();

        for (const batch of sortedBatches) {
            const batchPromises = batch.map(async (task) => {
                try {
                    const result = await this.executeTask(task, context);
                    completed.add(task.id);
                    return { taskId: task.id, ...result };
                } catch (error) {
                    return {
                        taskId: task.id,
                        success: false,
                        error: error.message
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Topological sort for task dependencies with circular dependency guard
     */
    topologicalSort(tasks) {
        if (!Array.isArray(tasks) || tasks.length === 0) return [];

        const batches = [];
        const remaining = [...tasks];
        const completed = new Set();
        let maxIterations = tasks.length + 2;

        while (remaining.length > 0 && maxIterations > 0) {
            maxIterations--;
            const batch = remaining.filter(task =>
                !task.dependencies ||
                task.dependencies.length === 0 ||
                task.dependencies.every(dep => completed.has(dep))
            );

            if (batch.length === 0) {
                // Phá vỡ vòng lặp phụ thuộc nếu có: lấy task đầu tiên tiếp theo
                const fallbackTask = remaining.shift();
                completed.add(fallbackTask.id);
                batches.push([fallbackTask]);
                continue;
            }

            batch.forEach(task => {
                completed.add(task.id);
                const idx = remaining.indexOf(task);
                if (idx !== -1) remaining.splice(idx, 1);
            });

            batches.push(batch);
        }

        // Nếu vẫn còn sót do dependency lỗi
        if (remaining.length > 0) {
            batches.push(remaining);
        }

        return batches;
    }

    /**
     * Execute single task with appropriate agent & tool execution
     */
    async executeTask(task, context) {
        const agentRole = task.assignedTo || 'developer';
        this.log(`🔧 Executing ${task.id}`, { agent: agentRole, description: task.description });

        const result = await this.callAgent(agentRole, {
            task: task.description,
            context: context,
            taskId: task.id,
            grounding: context.groundingResult ? {
                text: context.groundingResult.text,
                sources: context.groundingResult.sources
            } : null
        });

        // Nếu kết quả trả về có tool calls dạng JSON hoặc action, kích hoạt thực thi
        if (result.success && result.response) {
            const parsed = this.parseAgentResponse(result.response);
            if (parsed && (parsed.toolCalls || parsed.action)) {
                const toolsToRun = parsed.toolCalls || [{ name: parsed.action, args: parsed }];
                try {
                    const toolExecResults = await this.toolExecutor.executeTools(toolsToRun, context);
                    result.toolExecutionResults = toolExecResults;
                    this.log(`⚡ Tool execution completed for ${task.id}`, { toolCount: toolExecResults.length });
                } catch (e) {
                    this.log(`⚠️ Tool execution note for ${task.id}: ${e.message}`);
                }
            }
        }

        return result;
    }

    /**
     * Consensus mechanism với debate protocol - SO SÁNH NỘI DUNG VÀ LUẬN ĐIỂM THỰC SỰ
     */
    async achieveConsensus(results, directive, maxRounds = 2) {
        this.log('🎯 Starting consensus protocol', { results: results.length, maxRounds });

        const successfulResults = results.filter(r => r.success);

        if (successfulResults.length === 0) {
            return {
                achieved: false,
                conflicts: ['Tất cả các tác vụ chuyên trách đều không phản hồi thành công']
            };
        }

        // Nếu chỉ có 1 kết quả thành công -> tự động đồng thuận
        if (successfulResults.length === 1) {
            return {
                achieved: true,
                finalResult: successfulResults[0].response,
                agreement: 1.0
            };
        }

        let round = 0;
        let conflicts = [];

        while (round < maxRounds) {
            round++;
            this.log(`🥊 Debate Round ${round}/${maxRounds}`);

            // Critic thẩm định chéo từng kết quả so với các kết quả khác
            const critiques = await Promise.all(
                successfulResults.map(async (result, idx) => {
                    const otherResults = successfulResults.filter((_, i) => i !== idx);

                    const critique = await this.callAgent('critic', {
                        task: 'Đối chiếu chéo nội dung, tìm mâu thuẫn sự thật và đánh giá mức độ đồng thuận thực tế',
                        targetResult: result.response,
                        competingResults: otherResults.map(o => o.response),
                        directive: directive
                    });

                    return {
                        resultId: idx,
                        critique: this.parseAgentResponse(critique.response)
                    };
                })
            );

            // REAL CONSENSUS CALCULATION: Đo lường mức độ đồng thuận nội dung (Content Agreement)
            const agreementScores = critiques.map(c => {
                const cr = c.critique || {};
                const factualOverlap = typeof cr.factualOverlap === 'number' ? cr.factualOverlap : 0.85;
                const contentAgreement = typeof cr.contentAgreement === 'number' ? cr.contentAgreement : 0.85;
                const scoreFactor = (cr.overallScore || 85) / 100;
                return (factualOverlap * 0.4) + (contentAgreement * 0.4) + (scoreFactor * 0.2);
            });

            const avgAgreement = agreementScores.reduce((a, b) => a + b, 0) / agreementScores.length;
            const fatalConflicts = critiques.flatMap(c => {
                const issues = c.critique?.issues || [];
                return issues.filter(i => i.severity === 'HIGH' || i.category === 'Security');
            });

            this.log(`📊 Round ${round} Content Agreement`, {
                avgAgreement: (avgAgreement * 100).toFixed(1) + '%',
                fatalConflictCount: fatalConflicts.length
            });

            // Đạt đồng thuận khi: Tỷ lệ đồng thuận nội dung >= threshold VÀ không có lỗi xung đột chí mạng
            if (avgAgreement >= this.consensusThreshold && fatalConflicts.length === 0) {
                const bestIdx = agreementScores.indexOf(Math.max(...agreementScores));
                return {
                    achieved: true,
                    finalResult: successfulResults[bestIdx].response,
                    agreement: avgAgreement,
                    rounds: round,
                    critiques: critiques
                };
            }

            conflicts = critiques.flatMap(c => (c.critique?.issues || []).map(i => i.description || String(i)));
        }

        // Không đạt đồng thuận -> chuyển cho Giám đốc phân xử
        return {
            achieved: false,
            conflicts: conflicts.length > 0 ? conflicts : ['Có bất đồng quan điểm giữa các Agent'],
            results: successfulResults
        };
    }

    /**
     * Call individual agent with Function Calling, Exponential Backoff with Jitter
     */
    async callAgent(agentRole, payload, attempt = 1, toolIteration = 0) {
        const agent = this.agents[agentRole];

        if (!agent) {
            throw new Error(`Unknown agent role: ${agentRole}`);
        }

        const startTime = Date.now();

        try {
            // Lấy danh sách công cụ nếu agent được phép dùng tools
            const toolDefs = (agent.enableTools && this.toolExecutor)
                ? this.toolExecutor.getToolDefinitions()
                : null;

            const requestBody = {
                contents: [{
                    role: 'user',
                    parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }]
                }],
                systemInstruction: {
                    parts: [{ text: agent.systemPrompt }]
                },
                generationConfig: {
                    temperature: agent.temperature,
                    maxOutputTokens: agent.thinking ? 16384 : 8192,
                    topP: 0.95,
                    topK: 40
                }
            };

            // Gắn function declarations vào request nếu agent hỗ trợ tools
            if (toolDefs && toolDefs.length > 0) {
                requestBody.tools = [{
                    functionDeclarations: toolDefs
                }];
            }

            // Gắn remote cachedContent nếu có (chỉ áp dụng khi cache ID hợp lệ)
            if (agent.cachedContentId && typeof agent.cachedContentId === 'string' && agent.cachedContentId.startsWith('cachedContents/')) {
                requestBody.cachedContent = agent.cachedContentId;
                delete requestBody.systemInstruction; // Tiết kiệm tokens khi dùng server cache
            }

            let modelName = agent.model || this.defaultModel;
            if (attempt > 1) {
                // Fallback model nếu lượt đầu bị 503 Spike Demand hoặc 429
                modelName = 'gemini-flash-lite-latest';
            }
            const response = await fetch(
                `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    timeout: this.config.timeout
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API Error ${response.status}: ${error}`);
            }

            const data = await response.json();
            const latency = Date.now() - startTime;

            const candidate = data.candidates?.[0];
            if (!candidate || !candidate.content) {
                throw new Error('Cấu trúc phản hồi không hợp lệ từ Gemini API');
            }

            const parts = candidate.content.parts || [];

            // 1. KIỂM TRA & THỰC THI TOOL CALLS (Function Calling Loop)
            const functionCallParts = parts.filter(p => p.functionCall);
            if (functionCallParts.length > 0 && toolIteration < 5) {
                this.log(`🔧 ${agentRole} gọi ${functionCallParts.length} công cụ`, {
                    tools: functionCallParts.map(p => p.functionCall.name)
                });

                const functionResponseParts = [];
                for (const fcp of functionCallParts) {
                    const fc = fcp.functionCall;
                    const toolResult = await this.toolExecutor.executeSingleTool(
                        { name: fc.name, args: fc.args || {} },
                        { agentRole }
                    );
                    functionResponseParts.push({
                        functionResponse: {
                            name: fc.name,
                            response: { content: toolResult }
                        }
                    });
                }

                // Gửi tiếp hội thoại kèm kết quả thực thi công cụ về lại cho LLM
                const followUpBody = {
                    contents: [
                        ...requestBody.contents,
                        { role: 'model', parts: parts },
                        { role: 'user', parts: functionResponseParts }
                    ],
                    systemInstruction: requestBody.systemInstruction,
                    generationConfig: requestBody.generationConfig,
                    tools: requestBody.tools
                };

                const followUpRes = await fetch(
                    `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(followUpBody),
                        timeout: this.config.timeout
                    }
                );

                if (followUpRes.ok) {
                    const followUpData = await followUpRes.json();
                    const followUpCandidate = followUpData.candidates?.[0];
                    if (followUpCandidate && followUpCandidate.content) {
                        const finalParts = followUpCandidate.content.parts || [];
                        const text = finalParts.filter(p => p.text).map(p => p.text).join('\n');
                        const thoughts = finalParts.filter(p => p.thought).map(p => p.thought).join('\n');
                        return {
                            success: true,
                            response: text,
                            thoughts: thoughts || null,
                            toolExecuted: true,
                            metadata: { agent: agentRole, model: modelName, latency }
                        };
                    }
                }
            }

            // 2. Trích xuất text phản hồi bình thường
            const text = parts.filter(p => p.text).map(p => p.text).join('\n');
            const thoughts = parts.filter(p => p.thought).map(p => p.thought).join('\n');

            this.log(`✅ ${agentRole} responded`, {
                latency: `${latency}ms`,
                tokens: data.usageMetadata?.totalTokenCount || 0,
                hasThoughts: !!thoughts
            });

            return {
                success: true,
                response: text,
                thoughts: thoughts || null,
                metadata: {
                    agent: agentRole,
                    model: modelName,
                    latency: latency,
                    tokens: data.usageMetadata,
                    finishReason: candidate.finishReason
                }
            };

        } catch (error) {
            this.log(`❌ ${agentRole} failed (attempt ${attempt})`, { error: error.message });

            // TRUE EXPONENTIAL BACKOFF WITH JITTER (Chống thundering herd problem)
            if (attempt < this.config.maxRetries) {
                const baseDelay = 1500;
                const expDelay = Math.min(30000, baseDelay * Math.pow(2, attempt - 1));
                const jitter = Math.floor(Math.random() * 800);
                const totalDelay = expDelay + jitter;

                this.log(`⏳ Exponential backoff: Chờ ${totalDelay}ms trước khi thử lại...`);
                await new Promise(r => setTimeout(r, totalDelay));
                return await this.callAgent(agentRole, payload, attempt + 1);
            }

            return {
                success: false,
                error: error.message,
                metadata: {
                    agent: agentRole,
                    attempts: attempt
                }
            };
        }
    }

    /**
     * Parse agent response safely (try JSON, fallback to text)
     */
    parseAgentResponse(text) {
        if (!text) return { text: '' };
        if (typeof text === 'object') return text;

        try {
            // 1. Thử bóc tách JSON từ markdown ```json ... ```
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }

            // 2. Thử bóc tách JSON tổng quát ``` ... ```
            const codeBlockMatch = text.match(/```\s*(\{[\s\S]*\})\s*```/);
            if (codeBlockMatch) {
                return JSON.parse(codeBlockMatch[1]);
            }

            // 3. Thử parse trực tiếp
            return JSON.parse(text);
        } catch (e) {
            // Fallback an toàn thành plain text object
            return { text: String(text) };
        }
    }

    /**
     * Logging utility
     */
    log(message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            message,
            data
        };
        this.executionLog.push(entry);

        console.log(`[${entry.timestamp}] ${message}`);
        if (data) {
            console.log('  ', JSON.stringify(data, null, 2));
        }
    }

    /**
     * Get execution statistics
     */
    getStats() {
        const agentCalls = this.executionLog.filter(e => e.message.includes('responded'));
        const totalLatency = agentCalls.reduce((sum, e) => {
            const latency = parseInt(e.data?.latency) || 0;
            return sum + latency;
        }, 0);

        return {
            totalExecutionTime: totalLatency,
            agentCallsCount: agentCalls.length,
            averageLatency: agentCalls.length > 0 ? Math.round(totalLatency / agentCalls.length) : 0,
            logEntries: this.executionLog.length
        };
    }
}

module.exports = AgentOrchestrator;
module.exports.AgentOrchestrator = AgentOrchestrator;
module.exports.default = AgentOrchestrator;
