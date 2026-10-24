/**
 * AdaptivePlanner.js - Adaptive Multi-Mode Task Planner
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
        const isAutonomous = /vào web|bấm|click|tự động|kịch bản|viết script|chạy script|xuất ra|lưu file|tạo file|vẽ biểu đồ|khảo sát/i.test(text);
        if (isAutonomous) {
            return 'autonomous';
        }

        // 4. STANDARD MODE: default
        return 'standard';
    }

    /**
     * Generate adaptive plan tailored to the selected mode
     */
    generatePlan(mode, userRequest, strategicDirective = {}) {
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
                    description: 'Deep factual research with multi-source verification',
                    tasks: [
                        {
                            id: 'R001',
                            description: `Thu thập dữ liệu học thuật và bằng chứng xác thực cho yêu cầu: ${userRequest}`,
                            assignedTo: 'researcher',
                            priority: 1,
                            parallelizable: false
                        },
                        {
                            id: 'R002',
                            description: `Tổng hợp báo cáo, kiểm định luận điểm và bảo đảm trích dẫn nguồn`,
                            assignedTo: 'critic',
                            dependencies: ['R001'],
                            priority: 2,
                            parallelizable: false
                        }
                    ],
                    skipConsensus: false,
                    skipCritic: false
                };

            case 'autonomous':
            case 'standard':
            default:
                return {
                    mode: mode,
                    description: 'Comprehensive autonomous multi-agent plan with verification',
                    tasks: null, // Let Coordinator generate detailed task graph dynamically
                    skipConsensus: false,
                    skipCritic: false
                };
        }
    }
}

module.exports = { AdaptivePlanner };
