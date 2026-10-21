/**
 * ⚡ ULTIMATE MULTI-AGENT ORCHESTRATOR - 10/10 ARCHITECTURE
 *
 * Kiến trúc hierarchical thực sự với:
 * - 5 agents độc lập chạy song song
 * - Consensus mechanism với debate protocol
 * - Thinking mode cho reasoning tasks
 * - Context caching để tối ưu latency
 * - Parallel tool execution
 * - Self-healing với retry strategies
 */

const fetch = require('node:fetch');
const fs = require('fs').promises;
const path = require('path');

class AgentOrchestrator {
    constructor(geminiApiKey, config = ) {
        this.apiKey = geminiApiKey;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.config = {
            maxRetries: 3,
            timeout: 180000,
            parallelLimit: 5,
            thinkingDepth: 'deep',
            ...config
        };

        // Agent definitions với specialized capabilities
        this.agents = this.initializeAgents();

        // Execution context
        this.executionLog = [];
        this.consensusThreshold = 0.85; // 85% agreement required
    }

    initializeAgents() {
        return {
            // 🎯 DIRECTOR: Strategic mastermind
            director: {
                role: 'director',
                model: 'gemini-2.0-flash-thinking-exp',
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
- Đảm bảo alignment với mục tiêu người dùng

**ĐẦU RA:** Strategic directive JSON với structure:
{
  "objective": "Mục tiêu cuối cùng",
  "strategy": "Chiến lược tổng thể",
  "successCriteria": ["Tiêu chí 1", "Tiêu chí 2"],
  "risks": ["Rủi ro 1", "Rủi ro 2"],
  "priority": "HIGH|MEDIUM|LOW",
  "thinkingProcess": "Quá trình suy luận của bạn"
}`,
                temperature: 0.3,
                thinking: true,
                priority: 1
            },

            // 🎮 COORDINATOR: Task orchestration master
            coordinator: {
                role: 'coordinator',
                model: 'gemini-1.5-pro',
                systemPrompt: `BẠN LÀ PHÓ GIÁM ĐỐC (COO/COORDINATOR) - TRUNG TÂM ĐIỀU PHỐI VẬN HÀNH.

**VAI TRÒ:**
1. Nhận strategic directive từ Director
2. Phân rã thành các tasks cụ thể, có thể thực thi
3. Assign tasks cho đúng specialist agents
4. Tổng hợp kết quả từ các agents
5. Xử lý conflicts và đạt consensus
6. Báo cáo lên Director

**AGENTS DƯỚI QUYỀN:**
- researcher: Thu thập thông tin, nghiên cứu
- developer: Viết code, technical implementation
- critic: Phản biện, quality assurance

**CHIẾN LƯỢC PHÂN CÔNG:**
- Research tasks → researcher
- Code/Technical → developer
- Quality check → critic (ALWAYS cuối cùng)
- Complex tasks → chia nhỏ và assign parallel

**ĐẦU RA:** Task allocation JSON:
{
  "tasks": [
    {
      "id": "T001",
      "description": "Mô tả task",
      "assignedTo": "researcher|developer|critic",
      "dependencies": ["T000"],
      "priority": 1,
      "parallelizable": true
    }
  ],
  "executionPlan": "Sequential hoặc Parallel strategy"
}`,
                temperature: 0.4,
                thinking: false,
                priority: 2
            },

            // 🔬 RESEARCHER: Information gathering specialist
            researcher: {
                role: 'researcher',
                model: 'gemini-1.5-flash-8b',
                systemPrompt: `BẠN LÀ CHUYÊN GIA NGHIÊN CỨU (RESEARCH SPECIALIST).

**NHIỆM VỤ:**
1. Tìm kiếm thông tin từ web, academic sources
2. Phân tích và tổng hợp dữ liệu
3. Trích xuất insights quan trọng
4. Cross-verify từ nhiều nguồn
5. Đánh giá độ tin cậy thông tin

**CÔNG CỤ ƯU TIÊN:**
- WEB_SEARCH: Tìm kiếm đa nguồn
- ACADEMIC_SEARCH: Tài liệu học thuật
- READ_URL: Đọc nội dung trang web
- SEARCH_EXPERIENCE: Tra cứu kinh nghiệm cũ

**NGUYÊN TẮC:**
- Luôn verify từ 2+ nguồn độc lập
- Ưu tiên nguồn uy tín (academic, official)
- Trích dẫn rõ ràng nguồn gốc
- Phân biệt fact vs opinion

**ĐẦU RA:** Research report JSON:
{
  "findings": ["Finding 1", "Finding 2"],
  "sources": [{"url": "...", "title": "...", "credibility": "HIGH"}],
  "insights": ["Insight 1"],
  "confidence": 0.85,
  "limitations": "Giới hạn của nghiên cứu"
}`,
                temperature: 0.5,
                thinking: false,
                priority: 3,
                allowParallel: true
            },

            // 💻 DEVELOPER: Technical implementation expert
            developer: {
                role: 'developer',
                model: 'gemini-1.5-pro',
                systemPrompt: `BẠN LÀ CHUYÊN GIA LÂP TRÌNH (DEVELOPMENT SPECIALIST).

**NHIỆM VỤ:**
1. Implement technical solutions
2. Viết code chất lượng cao, maintainable
3. Debug và optimize performance
4. Áp dụng best practices & design patterns
5. Test code trước khi submit

**CÔNG CỤ:**
- WRITE_FILE: Tạo/ghi file code
- READ_FILE: Đọc code hiện tại
- RUN_CODE: Test execution
- LIST_FILES: Survey codebase

**CODING STANDARDS:**
- Clean code principles
- Proper error handling
- Security best practices
- Performance optimization
- Comprehensive comments

**QUY TRÌNH:**
1. Đọc code hiện tại (nếu có)
2. Design solution architecture
3. Implement incrementally
4. Test từng component
5. Integration test

**ĐẦU RA:** Implementation report JSON:
{
  "filesCreated": ["path1", "path2"],
  "filesModified": ["path3"],
  "testResults": {"passed": 5, "failed": 0},
  "performance": {"executionTime": "120ms"},
  "documentation": "Hướng dẫn sử dụng"
}`,
                temperature: 0.2,
                thinking: false,
                priority: 3,
                cacheSystemPrompt: true
            },

            // 🛡️ CRITIC: Adversarial quality assurance
            critic: {
                role: 'critic',
                model: 'gemini-2.0-flash-thinking-exp',
                systemPrompt: `BẠN LÀ CHUYÊN GIA THẨM ĐỊNH (CRITICAL ANALYST) - ĐỐI THỦ PHẢN BIỆN.

**VAI TRÒ:**
1. Phản biện TẤT CẢ kết quả từ các agents khác
2. Tìm lỗ hổng logic, bugs, security issues
3. Đánh giá độ tin cậy và completeness
4. Đề xuất cải tiến cụ thể
5. Cho điểm chất lượng (0-100)

**CHIẾN THUẬT PHẢN BIỆN:**
- Red team thinking: Tìm cách phá vỡ
- Edge cases: Xử lý trường hợp biên
- Security audit: Tìm vulnerabilities
- Logic verification: Kiểm tra reasoning
- Data validation: Verify accuracy

**TIÊU CHÍ ĐÁNH GIÁ:**
- Correctness (30%): Đúng/sai
- Completeness (25%): Đầy đủ/thiếu sót
- Quality (20%): Code quality, writing quality
- Security (15%): Bảo mật
- Performance (10%): Hiệu suất

**ĐẦU RA:** Critique report JSON:
{
  "overallScore": 85,
  "issues": [
    {
      "severity": "HIGH|MEDIUM|LOW",
      "category": "Logic|Security|Performance|Quality",
      "description": "Mô tả vấn đề",
      "location": "File/function cụ thể",
      "recommendation": "Cách khắc phục"
    }
  ],
  "strengths": ["Điểm mạnh 1"],
  "verdict": "APPROVED|NEEDS_REVISION|REJECTED",
  "thinkingProcess": "Quá trình phản biện"
}`,
                temperature: 0.6,
                thinking: true,
                priority: 4
            }
        };
    }

    /**
     * 🚀 MAIN EXECUTION PIPELINE
     */
    async execute(userRequest, context = {}) {
        this.executionLog = [];
        this.log('🎬 MULTI-AGENT EXECUTION STARTED', { userRequest });

        try {
            // STAGE 1: Strategic Analysis by Director
            this.log('📋 STAGE 1: Director Strategic Analysis');
            const strategy = await this.callAgent('director', {
                task: userRequest,
                context: {
                    experiences: context.experiences || [],
                    previousAttempts: context.previousAttempts || []
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

            const taskPlan = this.parseAgentResponse(plan.response);
            this.log('✅ Task Plan', taskPlan);

            // STAGE 3: Parallel Specialist Execution
            this.log('⚡ STAGE 3: Specialist Execution (Parallel)');
            const specialistResults = await this.executeTasksParallel(taskPlan.tasks, context);
            this.log('✅ Specialist Results', { count: specialistResults.length });

            // STAGE 4: Consensus & Debate Protocol
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
            this.log('✅ Final Critique', { score: critique.overallScore, verdict: critique.verdict });

            // STAGE 6: Director Approval
            if (critique.verdict === 'APPROVED' && critique.overallScore >= 85) {
                this.log('🎉 EXECUTION SUCCESSFUL - Director Approved');
                return {
                    success: true,
                    result: consensus.finalResult,
                    qualityScore: critique.overallScore,
                    critique: critique,
                    executionLog: this.executionLog
                };
            } else if (critique.verdict === 'NEEDS_REVISION' && context.retryCount < 2) {
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
                this.log('❌ Quality threshold not met');
                return {
                    success: false,
                    error: 'Quality standards not achieved',
                    result: consensus.finalResult,
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
     * Execute tasks in parallel where possible
     */
    async executeTasksParallel(tasks, context) {
        const sortedTasks = this.topologicalSort(tasks);
        const results = [];
        const completed = new Set();

        for (const batch of sortedTasks) {
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
     * Topological sort for task dependencies
     */
    topologicalSort(tasks) {
        const batches = [];
        const remaining = [...tasks];
        const completed = new Set();

        while (remaining.length > 0) {
            const batch = remaining.filter(task =>
                !task.dependencies ||
                task.dependencies.every(dep => completed.has(dep))
            );

            if (batch.length === 0) {
                throw new Error('Circular dependency detected in task graph');
            }

            batch.forEach(task => {
                completed.add(task.id);
                remaining.splice(remaining.indexOf(task), 1);
            });

            batches.push(batch);
        }

        return batches;
    }

    /**
     * Execute single task with appropriate agent
     */
    async executeTask(task, context) {
        const agentRole = task.assignedTo;
        this.log(`🔧 Executing ${task.id}`, { agent: agentRole, description: task.description });

        const result = await this.callAgent(agentRole, {
            task: task.description,
            context: context,
            taskId: task.id
        });

        return result;
    }

    /**
     * Consensus mechanism with debate protocol
     */
    async achieveConsensus(results, directive, maxRounds = 2) {
        this.log('🎯 Starting consensus protocol', { results: results.length, maxRounds });

        // Filter successful results
        const successfulResults = results.filter(r => r.success);

        if (successfulResults.length === 0) {
            return {
                achieved: false,
                conflicts: ['All specialist executions failed']
            };
        }

        // Single result - automatic consensus
        if (successfulResults.length === 1) {
            return {
                achieved: true,
                finalResult: successfulResults[0].response,
                agreement: 1.0
            };
        }

        // Multi-round debate for consensus
        let round = 0;
        let conflicts = [];

        while (round < maxRounds) {
            round++;
            this.log(`🥊 Debate Round ${round}/${maxRounds}`);

            // Each agent critiques others' work
            const critiques = await Promise.all(
                successfulResults.map(async (result, idx) => {
                    const otherResults = successfulResults.filter((_, i) => i !== idx);

                    const critique = await this.callAgent('critic', {
                        task: 'Compare and critique these results',
                        targetResult: result,
                        competingResults: otherResults,
                        directive: directive
                    });

                    return {
                        resultId: idx,
                        critique: this.parseAgentResponse(critique.response)
                    };
                })
            );

            // Calculate agreement scores
            const scores = critiques.map(c => c.critique.overallScore || 0);
            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            const maxScore = Math.max(...scores);
            const agreement = scores.filter(s => Math.abs(s - maxScore) < 10).length / scores.length;

            this.log(`📊 Round ${round} Scores`, { avgScore, maxScore, agreement });

            // Consensus achieved
            if (agreement >= this.consensusThreshold) {
                const bestIdx = scores.indexOf(maxScore);
                return {
                    achieved: true,
                    finalResult: successfulResults[bestIdx].response,
                    agreement: agreement,
                    rounds: round,
                    critiques: critiques
                };
            }

            // Collect conflicts for next round
            conflicts = critiques.flatMap(c => c.critique.issues || []);
        }

        // Consensus not achieved - return conflicts for arbitration
        return {
            achieved: false,
            conflicts: conflicts,
            results: successfulResults
        };
    }

    /**
     * Call individual agent with retries and error handling
     */
    async callAgent(agentRole, payload, attempt = 1) {
        const agent = this.agents[agentRole];

        if (!agent) {
            throw new Error(`Unknown agent role: ${agentRole}`);
        }

        const startTime = Date.now();

        try {
            const requestBody = {
                contents: [{
                    role: 'user',
                    parts: [{ text: JSON.stringify(payload, null, 2) }]
                }],
                systemInstruction: {
                    parts: [{ text: agent.systemPrompt }]
                },
                generationConfig: {
                    temperature: agent.temperature,
                    maxOutputTokens: 8192,
                    topP: 0.95,
                    topK: 40
                }
            };

            // Add thinking config for thinking agents
            if (agent.thinking) {
                requestBody.generationConfig.thinkingConfig = {
                    thinkingMode: 1, // THINKING_MODE_ENABLED
                    includeThoughts: true
                };
            }

            const response = await fetch(
                `${this.baseUrl}/models/${agent.model}:generateContent?key=${this.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: AbortSignal.timeout(this.config.timeout)
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API Error ${response.status}: ${error}`);
            }

            const data = await response.json();
            const latency = Date.now() - startTime;

            // Extract response text
            const candidate = data.candidates?.[0];
            if (!candidate || !candidate.content) {
                throw new Error('Invalid response structure from API');
            }

            const text = candidate.content.parts
                .filter(p => p.text)
                .map(p => p.text)
                .join('\n');

            // Extract thinking process if available
            const thoughts = candidate.content.parts
                .filter(p => p.thought)
                .map(p => p.thought)
                .join('\n');

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
                    model: agent.model,
                    latency: latency,
                    tokens: data.usageMetadata,
                    finishReason: candidate.finishReason
                }
            };

        } catch (error) {
            this.log(`❌ ${agentRole} failed (attempt ${attempt})`, { error: error.message });

            // Retry logic
            if (attempt < this.config.maxRetries) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
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
     * Parse agent response (try JSON, fallback to text)
     */
    parseAgentResponse(text) {
        try {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }

            // Try direct parse
            return JSON.parse(text);
        } catch (e) {
            // Return as plain text if not JSON
            return { text: text };
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
            averageLatency: Math.round(totalLatency / agentCalls.length),
            logEntries: this.executionLog.length
        };
    }
}

module.exports = { AgentOrchestrator };
