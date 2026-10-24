/**
 * AdaptivePlanner.js - Adaptive Multi-Mode Task Planner & Task Graph Engine
 * Cyber Agent Pro v3.5 Ultimate
 */

class AdaptivePlanner {
    constructor() {}

    /**
     * Determine optimal execution mode based on user request complexity
     */
    determineMode(userRequest, options = {}) {
        if (options.mode) {
            return options.mode;
        }

        const text = (userRequest || '').trim().toLowerCase();

        // 1. FAST MODE: simple questions, calculations, translations, quick definitions
        const isQuickQuestion = text.length < 80 && (
            /^what is|hãy cho biết|giải thích ngắn|2\+2|dịch câu|tính /i.test(text)
        ) && !/viết script|lưu vào|tạo file|vào web|cào|crawl|tự động|phân tích sâu/i.test(text);

        if (isQuickQuestion) {
            return 'fast';
        }

        // 2. DEEP RESEARCH MODE: scientific, academic, citations, fact-checking
        const isDeepResearch = /nghiên cứu|y học|chứng cứ|doi|pubmed|crossref|tỷ giá|chứng khoán|vĩ mô|báo cáo phân tích|luận điểm/i.test(text);
        if (isDeepResearch) {
            return 'deep_research';
        }

        // 3. AUTONOMOUS MODE: multi-step coding, web interaction, charts, complex projects
        const isAutonomous = /vào web|bấm|click|tự động|kịch bản|viết script|chạy script|xuất ra|lưu file|tạo file|vẽ biểu đồ|khảo sát|thu thập/i.test(text);
        if (isAutonomous) {
            return 'autonomous';
        }

        // 4. STANDARD MODE: default
        return 'standard';
    }

    /**
     * Generate adaptive task graph tailored to the selected mode, directive, and matched skill
     */
    generatePlan(mode, userRequest, strategicDirective = {}, matchedSkill = null) {
        // If a verified procedural skill exists, generate task graph bound to the skill recipe
        if (matchedSkill && matchedSkill.actionGraph) {
            return {
                mode: mode || 'autonomous',
                source: 'skill_library',
                skillName: matchedSkill.name,
                description: `Thực thi quy trình kỹ năng thủ tục đã kiểm chứng: [${matchedSkill.name}]`,
                tasks: [
                    {
                        id: 'S001',
                        description: `Áp dụng quy trình kỹ năng [${matchedSkill.name}]: ${matchedSkill.description}. Thực hiện các bước: ${JSON.stringify(matchedSkill.actionGraph)}`,
                        assignedTo: 'developer',
                        priority: 1,
                        parallelizable: false,
                        skillRef: matchedSkill.id
                    },
                    {
                        id: 'S002',
                        description: `Kiểm định độc lập kết quả đầu ra theo tiêu chí thành công của kỹ năng [${matchedSkill.name}]`,
                        assignedTo: 'critic',
                        dependencies: ['S001'],
                        priority: 2,
                        parallelizable: false
                    }
                ],
                skipConsensus: false,
                skipCritic: false
            };
        }

        switch (mode) {
            case 'fast':
                return {
                    mode: 'fast',
                    description: 'Fast single-agent execution without planning overhead',
                    tasks: [
                        {
                            id: 'F001',
                            description: userRequest,
                            assignedTo: 'researcher',
                            priority: 1,
                            parallelizable: false
                        }
                    ],
                    skipConsensus: true,
                    skipCritic: true
                };

            case 'deep_research':
                return {
                    mode: 'deep_research',
                    description: 'Deep factual research with multi-source verification and citation auditing',
                    tasks: [
                        {
                            id: 'DR001',
                            description: `Thu thập dữ liệu chuyên sâu, tài liệu học thuật và dẫn chứng thực tế cho: ${userRequest}`,
                            assignedTo: 'researcher',
                            priority: 1,
                            parallelizable: false,
                            requirements: ['citations', 'quantitative_data', 'peer_reviewed_sources']
                        },
                        {
                            id: 'DR002',
                            description: `Kiểm định nguồn trích dẫn, phản biện các luận điểm và tổng hợp báo cáo toàn diện`,
                            assignedTo: 'critic',
                            dependencies: ['DR001'],
                            priority: 2,
                            parallelizable: false,
                            requirements: ['fact_check', 'source_verification']
                        }
                    ],
                    skipConsensus: false,
                    skipCritic: false
                };

            case 'autonomous':
                return {
                    mode: 'autonomous',
                    description: 'Autonomous multi-step execution with environment actions, coding and physical verification',
                    tasks: [
                        {
                            id: 'A001',
                            description: `Triển khai giải pháp kỹ thuật, viết code/script hoặc tương tác web theo yêu cầu: ${userRequest}`,
                            assignedTo: 'developer',
                            priority: 1,
                            parallelizable: false,
                            requirements: ['executable_code', 'physical_output', 'error_handling']
                        },
                        {
                            id: 'A002',
                            description: `Xác thực tính toàn vẹn kỹ thuật, kiểm tra syntax và chạy thử nghiệm độc lập`,
                            assignedTo: 'critic',
                            dependencies: ['A001'],
                            priority: 2,
                            parallelizable: false,
                            requirements: ['syntax_check', 'acceptance_criteria']
                        }
                    ],
                    skipConsensus: false,
                    skipCritic: false
                };

            case 'standard':
            default:
                return {
                    mode: 'standard',
                    description: 'Standard multi-agent collaboration with strategic alignment',
                    tasks: [
                        {
                            id: 'T001',
                            description: `Thu thập thông tin và phân tích dữ liệu cho: ${userRequest}`,
                            assignedTo: 'researcher',
                            priority: 1,
                            parallelizable: true
                        },
                        {
                            id: 'T002',
                            description: `Triển khai giải pháp chi tiết hoặc nội dung kỹ thuật cho: ${userRequest}`,
                            assignedTo: 'developer',
                            priority: 2,
                            parallelizable: true
                        },
                        {
                            id: 'T003',
                            description: `Thẩm định chất lượng, rà soát lỗ hổng và tối ưu kết quả`,
                            assignedTo: 'critic',
                            dependencies: ['T001', 'T002'],
                            priority: 3,
                            parallelizable: false
                        }
                    ],
                    skipConsensus: false,
                    skipCritic: false
                };
        }
    }

    /**
     * Dynamic replanning when a task fails, times out, or produces invalid output
     */
    replan(failedTask, failureReason, currentPlan, userRequest, directive = {}) {
        console.warn(`🔄 [AdaptivePlanner] Replanning triggered due to task failure: [${failedTask?.id || 'unknown'}] - Reason: ${failureReason}`);

        const remainingTasks = (currentPlan?.tasks || []).filter(t => t.id !== failedTask?.id);
        const recoveryTaskId = `REC_${Date.now().toString().slice(-4)}`;

        const recoveryTask = {
            id: recoveryTaskId,
            description: `[RECOVERY] Thực hiện giải pháp thay thế cho nhiệm vụ lỗi [${failedTask?.id || ''}]. Nguyên nhân lỗi: ${failureReason}. Mục tiêu gốc: ${failedTask?.description || userRequest}`,
            assignedTo: failedTask?.assignedTo === 'developer' ? 'researcher' : 'developer',
            priority: 1,
            isRecovery: true,
            fallbackStrategy: 'alternative_approach',
            parallelizable: false
        };

        return {
            mode: currentPlan?.mode || 'adaptive_recovery',
            description: `Adapted plan after recovering from [${failedTask?.id || 'task failure'}]`,
            tasks: [recoveryTask, ...remainingTasks],
            replanCount: (currentPlan?.replanCount || 0) + 1,
            skipConsensus: false,
            skipCritic: false
        };
    }
}

module.exports = { AdaptivePlanner };
