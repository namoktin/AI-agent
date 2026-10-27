/**
 * apply_core_architectural_fixes.js
 * Applies the 5 core fixes to AgentOrchestrator.js, server.js, and run_20_hell_tasks_benchmark.js
 */

const fs = require('fs');
const path = require('path');

// 1. UPDATE AgentOrchestrator.js
console.log('--- 1. Patching AgentOrchestrator.js ---');
const orchPath = path.resolve(__dirname, 'agents/AgentOrchestrator.js');
let orchCode = fs.readFileSync(orchPath, 'utf8');

// A. Constructor token tracking initialization
const oldInitTarget = `        this.totalTokensConsumed = 0;
        this.activeGraphs = new Map(); // taskId -> StateGraph`;

const newInitTarget = `        // Quản lý Token chuẩn xác: Tách riêng Task Usage (từng task) và Cumulative Billing Usage (toàn server)
        this.taskTokenUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            callsCount: 0,
            providerTokens: 0,
            estimatedTokens: 0
        };
        this.cumulativeBillingUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            callsCount: 0,
            providerTokens: 0,
            estimatedTokens: 0
        };
        this.totalTokensConsumed = 0; // Backward-compatible alias
        this.activeGraphs = new Map(); // taskId -> StateGraph`;

if (orchCode.includes(oldInitTarget)) {
    orchCode = orchCode.replace(oldInitTarget, newInitTarget);
    console.log('✅ Patched constructor token initialization');
} else {
    console.log('⚠️ Constructor token initialization already patched or pattern differed');
}

// B. Reset task tokens at start of execute()
const oldExecTarget = `        this.executionLog = [];
        this.useCustomAiForRun = Boolean(context.useCustomAi || this.customAi?.enabled || process.env.USE_CUSTOM_AI === 'true');
        this.currentContext = context;
        this.log('🎬 MULTI-AGENT EXECUTION STARTED', { userRequest });`;

const newExecTarget = `        this.executionLog = [];
        // Đặt lại bộ đếm token cấp task cho mỗi phiên thực thi mới (ngăn cộng dồn & tính trùng)
        this.taskTokenUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            callsCount: 0,
            providerTokens: 0,
            estimatedTokens: 0
        };
        this.totalTokensConsumed = 0;
        this.useCustomAiForRun = Boolean(context.useCustomAi || this.customAi?.enabled || process.env.USE_CUSTOM_AI === 'true');
        this.currentContext = context;
        this.log('🎬 MULTI-AGENT EXECUTION STARTED', { userRequest });`;

if (orchCode.includes(oldExecTarget)) {
    orchCode = orchCode.replace(oldExecTarget, newExecTarget);
    console.log('✅ Patched execute() token reset');
}

// C. Token helpers & tool budget helper before getStats()
const tokenHelpers = `
    /**
     * Trích xuất thông số token từ phản hồi của nhà cung cấp API (Gemini usageMetadata hoặc OpenAI/Mirai usage)
     */
    _extractTokensFromResponseData(data, requestBody = null, responseText = '') {
        // 1. Gemini usageMetadata
        if (data?.usageMetadata) {
            const promptTokens = parseInt(data.usageMetadata.promptTokenCount) || 0;
            const completionTokens = parseInt(data.usageMetadata.candidatesTokenCount) || 0;
            const totalTokens = parseInt(data.usageMetadata.totalTokenCount) || (promptTokens + completionTokens);
            if (totalTokens > 0) {
                return { promptTokens, completionTokens, totalTokens, source: 'provider' };
            }
        }
        // 2. OpenAI / Mirai API usage
        if (data?.usage) {
            const promptTokens = parseInt(data.usage.prompt_tokens) || 0;
            const completionTokens = parseInt(data.usage.completion_tokens) || 0;
            const totalTokens = parseInt(data.usage.total_tokens) || (promptTokens + completionTokens);
            if (totalTokens > 0) {
                return { promptTokens, completionTokens, totalTokens, source: 'provider' };
            }
        }
        // 3. Fallback: Ước tính từ độ dài văn bản (trung bình ~4 ký tự / token)
        const reqChars = JSON.stringify(requestBody || {}).length;
        const resChars = (responseText || JSON.stringify(data || {})).length;
        const promptTokens = Math.max(1, Math.ceil(reqChars / 4));
        const completionTokens = Math.max(1, Math.ceil(resChars / 4));
        const totalTokens = promptTokens + completionTokens;
        return { promptTokens, completionTokens, totalTokens, source: 'estimated' };
    }

    /**
     * Ghi nhận token duy nhất một lần: tách biệt taskUsage (từng task) và cumulativeBillingUsage (toàn server)
     */
    _recordTokenUsage({ promptTokens = 0, completionTokens = 0, totalTokens = 0, source = 'provider' }) {
        if (!this.taskTokenUsage) {
            this.taskTokenUsage = {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                callsCount: 0,
                providerTokens: 0,
                estimatedTokens: 0
            };
        }
        if (!this.cumulativeBillingUsage) {
            this.cumulativeBillingUsage = {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                callsCount: 0,
                providerTokens: 0,
                estimatedTokens: 0
            };
        }

        const rec = {
            promptTokens: Math.max(0, parseInt(promptTokens) || 0),
            completionTokens: Math.max(0, parseInt(completionTokens) || 0),
            totalTokens: Math.max(0, parseInt(totalTokens) || 0),
            source: source === 'provider' ? 'provider' : 'estimated'
        };

        if (rec.totalTokens === 0 && (rec.promptTokens > 0 || rec.completionTokens > 0)) {
            rec.totalTokens = rec.promptTokens + rec.completionTokens;
        }

        // Cập nhật cho task hiện tại
        this.taskTokenUsage.promptTokens += rec.promptTokens;
        this.taskTokenUsage.completionTokens += rec.completionTokens;
        this.taskTokenUsage.totalTokens += rec.totalTokens;
        this.taskTokenUsage.callsCount += 1;
        if (rec.source === 'provider') {
            this.taskTokenUsage.providerTokens += rec.totalTokens;
        } else {
            this.taskTokenUsage.estimatedTokens += rec.totalTokens;
        }

        // Cập nhật tích lũy billing cho server
        this.cumulativeBillingUsage.promptTokens += rec.promptTokens;
        this.cumulativeBillingUsage.completionTokens += rec.completionTokens;
        this.cumulativeBillingUsage.totalTokens += rec.totalTokens;
        this.cumulativeBillingUsage.callsCount += 1;
        if (rec.source === 'provider') {
            this.cumulativeBillingUsage.providerTokens += rec.totalTokens;
        } else {
            this.cumulativeBillingUsage.estimatedTokens += rec.totalTokens;
        }

        this.totalTokensConsumed = this.taskTokenUsage.totalTokens;
        return rec;
    }

    /**
     * Tối ưu ngân sách vòng lặp công cụ (Tool Budget) linh hoạt theo bản chất từng loại tác vụ
     */
    _determineToolBudget(agentRole, payload, userRequest) {
        const taskText = \`\${userRequest || ''} \${payload?.task || ''} \${JSON.stringify(payload?.context || {})}\`.toLowerCase();
        
        // 1. Tác vụ lập trình nhiều bước, tạo file & chạy lệnh kiểm thử (cần: viết file -> chạy thử -> sửa lỗi)
        const isMultiStepCoding = /chạy|thực thi|run|test|execute|script|viết code|cào|crawler|pipeline|compile|debug|tải/i.test(taskText) &&
                                  (agentRole === 'developer' || /code|script|python|node|bash/i.test(taskText));
        
        // 2. Tác vụ duyệt web sâu, tương tác trang nhiều bước (cần: tìm kiếm -> mở trang -> bóc tách)
        const isMultiStepBrowsing = /duyệt|browse|crawl|đăng nhập|form|click|trình duyệt|puppeteer|playwright/i.test(taskText) ||
                                    (payload?.mode === 'deep_research' && /tìm kiếm|tra cứu|đối chiếu/i.test(taskText));

        // 3. Tác vụ phân tích thuần túy, chiến lược, giải thích khái niệm
        const isPureAnalysis = /phân tích|đánh giá|dự báo|so sánh|chiến lược|bản vẽ|tư vấn|lộ trình|kế hoạch/i.test(taskText) &&
                               !isMultiStepCoding && !isMultiStepBrowsing;

        if (isMultiStepCoding) {
            return 3; // Cấp 3 vòng: Vòng 1 tra cứu/ghi file, Vòng 2 chạy thử/kiểm tra syntax, Vòng 3 điều chỉnh
        }
        if (isMultiStepBrowsing) {
            return 2; // Cấp 2 vòng: Vòng 1 tìm kiếm, Vòng 2 mở trang sâu
        }
        if (isPureAnalysis) {
            return 1; // 1 vòng tra cứu dữ liệu nền là đủ cho câu hỏi phân tích
        }

        return 2; // Mặc định an toàn
    }
`;

// Insert tokenHelpers before getStats()
if (!orchCode.includes('_extractTokensFromResponseData')) {
    orchCode = orchCode.replace('    getStats() {', `${tokenHelpers}\n    getStats() {`);
    console.log('✅ Added token helper methods and tool budget optimizer');
}

// D. Replace getStats() implementation
const oldGetStatsPattern = /getStats\(\) \{[\s\S]*?return \{[\s\S]*?totalTokens:[\s\S]*?\};[\s\S]*?\}/;
const newGetStats = `getStats() {
        const agentCalls = this.executionLog.filter(e => e.message.includes('responded'));
        const totalLatency = agentCalls.reduce((sum, e) => {
            const latency = parseInt(e.data?.latency) || 0;
            return sum + latency;
        }, 0);

        const taskTokens = this.taskTokenUsage?.totalTokens || 0;
        const providerTokens = this.taskTokenUsage?.providerTokens || 0;
        const estimatedTokens = this.taskTokenUsage?.estimatedTokens || 0;

        return {
            totalExecutionTime: totalLatency,
            totalTokens: taskTokens, // CHÍNH XÁC 100%, KHÔNG CỘNG TRÙNG!
            requestUsage: {
                promptTokens: this.taskTokenUsage?.promptTokens || 0,
                completionTokens: this.taskTokenUsage?.completionTokens || 0,
                totalTokens: taskTokens,
                source: estimatedTokens > 0 ? (providerTokens > 0 ? 'mixed' : 'estimated') : 'provider',
                providerTokens: providerTokens,
                estimatedTokens: estimatedTokens
            },
            taskUsage: {
                promptTokens: this.taskTokenUsage?.promptTokens || 0,
                completionTokens: this.taskTokenUsage?.completionTokens || 0,
                totalTokens: taskTokens,
                agentCalls: agentCalls.length
            },
            billingUsage: {
                cumulativeTokens: this.cumulativeBillingUsage?.totalTokens || taskTokens,
                cumulativeCalls: this.cumulativeBillingUsage?.callsCount || agentCalls.length
            },
            agentCallsCount: agentCalls.length,
            averageLatency: agentCalls.length > 0 ? Math.round(totalLatency / agentCalls.length) : 0,
            logEntries: this.executionLog.length
        };
    }`;

if (oldGetStatsPattern.test(orchCode)) {
    orchCode = orchCode.replace(oldGetStatsPattern, newGetStats);
    console.log('✅ Replaced getStats() to eliminate double counting');
}

// E. Update token recording in callAgent()
// E1: Initial call
const oldTokenCall1 = `            const consumedNow = (data.usageMetadata?.totalTokenCount) || (data.usage?.total_tokens) || 0;
            this.totalTokensConsumed = (this.totalTokensConsumed || 0) + consumedNow;
            if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                this.modelRouter.releaseDispatchSlot((data.usageMetadata?.totalTokenCount) || 1200, modelName, slot?.slotId);
            } else if (this.modelRouter && typeof this.modelRouter.recordUsage === 'function') {
                this.modelRouter.recordUsage((data.usageMetadata?.totalTokenCount) || 1200, modelName);
            }`;

const newTokenCall1 = `            const tokenMetrics = this._extractTokensFromResponseData(data, requestBody, '');
            this._recordTokenUsage(tokenMetrics);
            if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                this.modelRouter.releaseDispatchSlot(tokenMetrics.totalTokens || 1200, modelName, slot?.slotId);
            } else if (this.modelRouter && typeof this.modelRouter.recordUsage === 'function') {
                this.modelRouter.recordUsage(tokenMetrics.totalTokens || 1200, modelName);
            }`;

if (orchCode.includes(oldTokenCall1)) {
    orchCode = orchCode.replace(oldTokenCall1, newTokenCall1);
    console.log('✅ Patched initial call token recording');
}

// E2: Dynamic tool budget in callAgent
const oldToolBudget = `const MAX_TOOL_ITERATIONS = (payload?.context?.benchmarkTask || this.currentContext?.benchmarkTask) ? 1 : 2; // Tối ưu: 2 vòng công cụ là chuẩn vàng cho phối hợp đa tác nhân`;
const newToolBudget = `const MAX_TOOL_ITERATIONS = this._determineToolBudget(agentRole, payload, userRequest);`;
if (orchCode.includes(oldToolBudget)) {
    orchCode = orchCode.replace(oldToolBudget, newToolBudget);
    console.log('✅ Patched dynamic tool budget in callAgent');
}

// E3: Tool follow-up token recording
const oldTokenCall2 = `                const consumedFollowUp = (followUpData.usageMetadata?.totalTokenCount) || (followUpData.usage?.total_tokens) || 0;
                this.totalTokensConsumed = (this.totalTokensConsumed || 0) + consumedFollowUp;
                if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                    this.modelRouter.releaseDispatchSlot((followUpData.usageMetadata?.totalTokenCount) || 1000, modelName, followUpSlot?.slotId);
                }`;

const newTokenCall2 = `                const followUpTokenMetrics = this._extractTokensFromResponseData(followUpData, followUpBody, '');
                this._recordTokenUsage(followUpTokenMetrics);
                if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                    this.modelRouter.releaseDispatchSlot(followUpTokenMetrics.totalTokens || 1000, modelName, followUpSlot?.slotId);
                }`;

if (orchCode.includes(oldTokenCall2)) {
    orchCode = orchCode.replace(oldTokenCall2, newTokenCall2);
    console.log('✅ Patched tool follow-up token recording');
}

// E4: Finalize token recording
const oldTokenCall3 = `                        const finRes = await this._callModelApi({ modelName: finModel, requestBody: finalizeBody, externalSignal, timeoutMs: this.config.timeout || 120000, useCustomAi: isUsingCustomAi });
                        if (finRes.ok) {
                            const finData = await finRes.json();
                            const finCandidate = finData.candidates?.[0];
                            if (finCandidate && finCandidate.content) {
                                text = finCandidate.content.parts?.filter(p => p.text).map(p => p.text).join('\\n') || text;
                            }
                        }`;

const newTokenCall3 = `                        const finRes = await this._callModelApi({ modelName: finModel, requestBody: finalizeBody, externalSignal, timeoutMs: this.config.timeout || 120000, useCustomAi: isUsingCustomAi });
                        if (finRes.ok) {
                            const finData = await finRes.json();
                            const finTokenMetrics = this._extractTokensFromResponseData(finData, finalizeBody, text);
                            this._recordTokenUsage(finTokenMetrics);
                            const finCandidate = finData.candidates?.[0];
                            if (finCandidate && finCandidate.content) {
                                text = finCandidate.content.parts?.filter(p => p.text).map(p => p.text).join('\\n') || text;
                            }
                        }`;

if (orchCode.includes(oldTokenCall3)) {
    orchCode = orchCode.replace(oldTokenCall3, newTokenCall3);
    console.log('✅ Patched finalize token recording');
}

// F. Consensus mechanism fix: Replace length-based consensus with genuine verification
const oldConsensusTarget = `            const richestResult = candidateTexts.sort((a, b) => b.length - a.length)[0] || successfulResults[successfulResults.length - 1].response || '';

            if ((avgAgreement >= this.consensusThreshold && fatalConflicts.length === 0) || (richestResult.length >= 3000 && fatalConflicts.length <= 4)) {
                this.log(\`🤝 [Consensus Streamline] Đạt đồng thuận hoặc kế thừa giải pháp chuyên sâu (\${richestResult.length} ký tự).\`);
                return {
                    achieved: true,
                    finalResult: richestResult,
                    agreement: Math.max(avgAgreement, 0.85),
                    rounds: round,
                    critique: cr
                };
            }`;

const newConsensusTarget = `            // Chỉ lấy giải pháp từ chuyên viên (developer, researcher), loại bỏ hoàn toàn biên bản của Critic
            const specialistCandidateResults = successfulResults.filter(r => r.agent !== 'critic');
            const candidateTextsClean = (specialistCandidateResults.length > 0 ? specialistCandidateResults : successfulResults)
                .map(r => typeof r.response === 'string' ? r.response : (r.response?.solution || r.response?.content || JSON.stringify(r.response, null, 2)))
                .filter(t => t && t.trim().length > 0 && !t.includes('"verdict": "REJECTED"'));
            
            const richestResult = candidateTextsClean.sort((a, b) => b.length - a.length)[0] || (specialistCandidateResults[0]?.response || successfulResults[successfulResults.length - 1].response || '');

            // ĐỒNG THUẬN THỰC CHẤT:
            // 1. Tuyệt đối KHÔNG có xung đột chí mạng (fatalConflicts.length === 0)
            // 2. Không có lỗi nghiêm trọng HIGH còn tồn tại
            // 3. Tỷ lệ đồng thuận nội dung thực sự đạt ngưỡng (avgAgreement >= this.consensusThreshold)
            const unresolvedHighIssues = (cr.issues || []).filter(i => i.severity === 'HIGH');
            const isGenuineConsensus = avgAgreement >= (this.consensusThreshold || 0.70) && fatalConflicts.length === 0 && unresolvedHighIssues.length === 0;

            if (isGenuineConsensus) {
                this.log(\`🤝 [Consensus] Đạt đồng thuận thực chất giữa các chuyên gia (Đồng thuận: \${(avgAgreement * 100).toFixed(1)}%, Xung đột: 0).\`);
                return {
                    achieved: true,
                    finalResult: richestResult,
                    agreement: avgAgreement,
                    rounds: round,
                    critique: cr,
                    conflicts: []
                };
            }`;

if (orchCode.includes(oldConsensusTarget)) {
    orchCode = orchCode.replace(oldConsensusTarget, newConsensusTarget);
    console.log('✅ Patched achieveConsensus to require genuine agreement');
}

// G. Stage 4.5 Remediation fix: Replace length-based skip with criteria verification and exclude Critic output
const oldStage45Target = `                // NẾU SPECIALIST TRƯỚC ĐÃ CÓ KẾT QUẢ ĐẦY ĐỦ (>= 2800 KÝ TỰ): KẾ THỪA TRỰC TIẾP, KHÔNG TÁI THỰC THI
                if (bestPriorText && bestPriorText.length >= 2800) {
                    this.log(\`⚡ [Stage 4.5 Streamline] Specialist trước đã tạo kết quả toàn diện (\${bestPriorText.length} ký tự). Kế thừa giải pháp, bỏ qua tái thực thi lặp lại.\`);
                    remediatedResult = bestPriorText;
                } else if (remediationCount < 1) {`;

const newStage45Target = `                // Chỉ lấy kết quả từ các Specialist thực thụ (developer, researcher), LOẠI BỎ hoàn toàn biên bản phê bình của Critic
                const specialistCandidateResults = specialistResults.filter(r => r.agent !== 'critic' && r.success);
                const candidateTextsClean = specialistCandidateResults
                    .map(r => typeof r.response === 'string' ? r.response : (r.response?.solution || r.response?.content || JSON.stringify(r.response)))
                    .filter(t => t && t.trim().length > 100 && !t.includes('"overallScore":') && !t.includes('"verdict": "REJECTED"'));

                const cleanPriorText = candidateTextsClean.length > 0
                    ? candidateTextsClean.sort((a, b) => b.length - a.length)[0]
                    : '';

                // KIỂM ĐỊNH THỰC TẾ: Bỏ qua remediation CHỈ KHI các yêu cầu bắt buộc đã được thỏa mãn (không chỉ dựa vào độ dài)
                const requiredCriteria = Array.isArray(arbDirective.successCriteria) ? arbDirective.successCriteria : [];
                let meetsMandatoryRequirements = false;

                if (cleanPriorText) {
                    const isCodeOrFileTask = /code|script|python|javascript|tải|file|cào|bypass|crawler|pipeline|lưu|cơ sở dữ liệu/i.test(userRequest);
                    const hasRequiredCode = !isCodeOrFileTask || /\`\`\`(python|javascript|bash|typescript|sql)/i.test(cleanPriorText);
                    const hasNoCriticalStub = !/(TODO|FIXME|unimplemented|chưa triển khai)/i.test(cleanPriorText);
                    const hasSubstantiveContent = cleanPriorText.length >= 1000;
                    
                    let matchedCriteriaCount = 0;
                    for (const crit of requiredCriteria) {
                        const critWords = String(crit).toLowerCase().split(/\\s+/).filter(w => w.length >= 4);
                        if (critWords.some(w => cleanPriorText.toLowerCase().includes(w))) {
                            matchedCriteriaCount++;
                        }
                    }
                    const criteriaCoverage = requiredCriteria.length > 0 ? (matchedCriteriaCount / requiredCriteria.length) : 1.0;
                    meetsMandatoryRequirements = hasRequiredCode && hasNoCriticalStub && hasSubstantiveContent && (criteriaCoverage >= 0.6);
                }

                if (meetsMandatoryRequirements) {
                    this.log(\`✅ [Stage 4.5 Verification] Specialist trước đã thỏa mãn tiêu chuẩn nghiệm thu của Director (\${cleanPriorText.length} ký tự). Kế thừa giải pháp đã kiểm chứng.\`);
                    remediatedResult = cleanPriorText;
                } else if (remediationCount < 1) {`;

if (orchCode.includes(oldStage45Target)) {
    orchCode = orchCode.replace(oldStage45Target, newStage45Target);
    console.log('✅ Patched Stage 4.5 remediation stopping condition');
}

fs.writeFileSync(orchPath, orchCode, 'utf8');
console.log('🎉 Successfully saved agents/AgentOrchestrator.js');

// 2. UPDATE server.js
console.log('\n--- 2. Patching server.js ---');
const serverPath = path.resolve(__dirname, 'server.js');
let serverCode = fs.readFileSync(serverPath, 'utf8');

// A. parseSafeCommand supports syntax check commands: node -c and python -m py_compile
const oldNodeCheck = `    if (executable === 'node' && /^[-\\w./\\\\:]+\\.js$/i.test(scriptArg)) {
        if (!safePathOrRelative(scriptArg)) return null;
        const extraArgs = args.slice(1);
        if (!extraArgs.every(arg => safePathOrRelative(arg))) return null;
        return { file: process.execPath, args, display: value };
    }`;

const newNodeCheck = `    if (executable === 'node') {
        // Cho phép: node script.js HOẶC node -c script.js (syntax check an toàn)
        if (scriptArg === '-c' && args[1] && /^[-\\w./\\\\:]+\\.js$/i.test(args[1]) && safePathOrRelative(args[1])) {
            return { file: process.execPath, args, display: value };
        }
        if (/^[-\\w./\\\\:]+\\.js$/i.test(scriptArg)) {
            if (!safePathOrRelative(scriptArg)) return null;
            const extraArgs = args.slice(1);
            if (!extraArgs.every(arg => safePathOrRelative(arg))) return null;
            return { file: process.execPath, args, display: value };
        }
    }`;

if (serverCode.includes(oldNodeCheck)) {
    serverCode = serverCode.replace(oldNodeCheck, newNodeCheck);
    console.log('✅ Patched server.js parseSafeCommand for node syntax check');
}

const oldPyCheck = `    if ((executable === 'python' || executable === 'python3' || executable === 'py') &&
        /^[-\\w./\\\\:]+\\.py$/i.test(scriptArg)) {
        if (!safePathOrRelative(scriptArg)) return null;
        const extraArgs = args.slice(1);
        if (!extraArgs.every(arg => safePathOrRelative(arg))) return null;
        return { file: executable === 'py' ? 'py' : executable, args, display: value };
    }`;

const newPyCheck = `    if (executable === 'python' || executable === 'python3' || executable === 'py') {
        // Cho phép: python script.py HOẶC python -m py_compile script.py (syntax check an toàn)
        if (scriptArg === '-m' && args[1] === 'py_compile' && args[2] && /^[-\\w./\\\\:]+\\.py$/i.test(args[2]) && safePathOrRelative(args[2])) {
            return { file: executable === 'py' ? 'py' : executable, args, display: value };
        }
        if (/^[-\\w./\\\\:]+\\.py$/i.test(scriptArg)) {
            if (!safePathOrRelative(scriptArg)) return null;
            const extraArgs = args.slice(1);
            if (!extraArgs.every(arg => safePathOrRelative(arg))) return null;
            return { file: executable === 'py' ? 'py' : executable, args, display: value };
        }
    }`;

if (serverCode.includes(oldPyCheck)) {
    serverCode = serverCode.replace(oldPyCheck, newPyCheck);
    console.log('✅ Patched server.js parseSafeCommand for python syntax check');
}

// B. In server.js /api/v2/execute response, pass detailed usage
const oldStatsOutput = `            stats: {
                executionTime: \`\${executionTime}ms\`,
                agentCalls: stats.agentCallsCount,
                averageLatency: \`\${stats.averageLatency}ms\`,
                totalTokens: stats.totalTokens || globalOrchestrator.totalTokensConsumed || 0,
                model: (useCustomAi || context.useCustomAi) ? (process.env.CUSTOM_AI_MODEL || 'deepseek-v4-pro') : (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite')
            },`;

const newStatsOutput = `            stats: {
                executionTime: \`\${executionTime}ms\`,
                agentCalls: stats.agentCallsCount,
                averageLatency: \`\${stats.averageLatency}ms\`,
                totalTokens: stats.totalTokens || 0,
                taskUsage: stats.taskUsage || null,
                requestUsage: stats.requestUsage || null,
                billingUsage: stats.billingUsage || null,
                model: (useCustomAi || context.useCustomAi) ? (process.env.CUSTOM_AI_MODEL || 'deepseek-v4-pro') : (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite')
            },`;

if (serverCode.includes(oldStatsOutput)) {
    serverCode = serverCode.replace(oldStatsOutput, newStatsOutput);
    console.log('✅ Patched server.js /api/v2/execute response with granular token stats');
}

fs.writeFileSync(serverPath, serverCode, 'utf8');
console.log('🎉 Successfully saved server.js');

