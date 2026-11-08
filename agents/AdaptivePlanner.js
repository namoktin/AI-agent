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

        // 3. AUTONOMOUS MODE: multi-step coding, web interaction, charts, complex projects, media download/scraping
        const isAutonomous = /vào web|bấm|click|tự động|kịch bản|viết script|chạy script|xuất ra|lưu file|tạo file|vẽ biểu đồ|khảo sát|thu thập|tải|download|cào|crawl|scrape|reel|reels|video|shorts/i.test(text);
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
                            description: `Thực thi trực tiếp bằng công cụ (BẮT BUỘC gọi DOWNLOAD_VIDEO, BROWSE_WEB, SCRAPE_SOCIAL_MEDIA khi cào/tải/duyệt; hoặc gọi WRITE_FILE và RUN_CMD khi cần chạy script tạo file vật lý): ${userRequest}`,
                            assignedTo: 'developer',
                            priority: 1,
                            parallelizable: false,
                            requirements: ['tool_execution', 'executable_code', 'physical_output', 'error_handling']
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
            default: {
                // Tier 4 Dynamic Task Decomposition: Phân tích ngữ cảnh tệp đính kèm và miền bài toán
                const reqLower = (userRequest || '').toLowerCase();
                const isBenchmarkOrFactual = /FINAL ANSWER:|gaia|benchmark|how many|which|what|who|calculate|tính|cho biết|in what/i.test(userRequest);

                // Phát hiện tệp đính kèm và loại bài toán
                const isSpreadsheet = reqLower.includes('.xlsx') || reqLower.includes('.xls') || reqLower.includes('.csv') || reqLower.includes('spreadsheet') || reqLower.includes('bảng tính');
                const isAudio = reqLower.includes('.mp3') || reqLower.includes('.wav') || reqLower.includes('.m4a') || reqLower.includes('audio') || reqLower.includes('âm thanh');
                const isVisual = reqLower.includes('.png') || reqLower.includes('.jpg') || reqLower.includes('.jpeg') || reqLower.includes('image') || reqLower.includes('ảnh');
                const isWebResearch = reqLower.includes('wikipedia') || reqLower.includes('http') || reqLower.includes('doi') || reqLower.includes('author') || reqLower.includes('website');

                if (isSpreadsheet) {
                    return {
                        mode: 'standard',
                        domain: 'spreadsheet_data_analytics',
                        description: 'Phân tích dữ liệu bảng tính đa tầng: Trích xuất cấu trúc -> Tính toán tất định -> Nghiệm thu trực tiếp',
                        tasks: [
                            {
                                id: 'T001',
                                description: `Khảo sát tệp bảng tính (.xlsx/.csv): mở file, duyệt danh sách sheet và cột, lọc chính xác các bản ghi mục tiêu theo đúng điều kiện câu hỏi: ${userRequest}`,
                                assignedTo: 'researcher',
                                priority: 1,
                                parallelizable: true,
                                requirements: ['inspect_spreadsheet', 'filter_records', 'column_schema']
                            },
                            {
                                id: 'T002',
                                description: `Viết và thực thi script Python tất định (pandas/openpyxl) để tính toán, kiểm chứng quy tắc nghiệp vụ/đơn vị từ dữ liệu bảng tính và chốt đáp án: ${userRequest}`,
                                assignedTo: 'developer',
                                priority: 1,
                                parallelizable: true,
                                dependencies: ['T001'],
                                requirements: ['deterministic_code', 'direct_calculation', 'final_scalar']
                            }
                        ],
                        skipConsensus: false,
                        skipCritic: false
                    };
                }

                if (isAudio) {
                    return {
                        mode: 'standard',
                        domain: 'audio_speech_intelligence',
                        description: 'Xử lý âm thanh đa tầng: Whisper Transcription -> Phân tích ngữ nghĩa -> Trích xuất kết luận',
                        tasks: [
                            {
                                id: 'T001',
                                description: `Thực thi lệnh RUN_CMD gọi Whisper (openai-whisper) chuyển đổi toàn bộ tệp âm thanh đính kèm sang văn bản transcript đầy đủ: ${userRequest}`,
                                assignedTo: 'developer',
                                priority: 1,
                                parallelizable: false,
                                requirements: ['whisper_transcription', 'full_audio_text']
                            },
                            {
                                id: 'T002',
                                description: `Phân tích transcript âm thanh, đối chiếu chính xác mốc thời gian/chủ đề và trích xuất câu trả lời trực tiếp cho: ${userRequest}`,
                                assignedTo: 'researcher',
                                priority: 1,
                                parallelizable: false,
                                dependencies: ['T001'],
                                requirements: ['transcript_analysis', 'terminal_answer']
                            }
                        ],
                        skipConsensus: false,
                        skipCritic: false
                    };
                }

                if (isVisual) {
                    return {
                        mode: 'standard',
                        domain: 'visual_spatial_reasoning',
                        description: 'Phân tích thị giác & tính toán không gian: Visual Inspection -> Script hình học/pixel -> Kiểm chứng',
                        tasks: [
                            {
                                id: 'T001',
                                description: `Kiểm tra và bóc tách dữ liệu thị giác: tọa độ, màu sắc, ký hiệu, nhãn số và văn bản trong tệp ảnh cho: ${userRequest}`,
                                assignedTo: 'researcher',
                                priority: 1,
                                parallelizable: true,
                                requirements: ['visual_inspection', 'ocr_labels', 'spatial_coordinates']
                            },
                            {
                                id: 'T002',
                                description: `Thực thi script Python (OpenCV/PIL) tính toán hình học, giải thuật pixel hoặc đối chiếu ràng buộc từ ảnh và xuất giá trị: ${userRequest}`,
                                assignedTo: 'developer',
                                priority: 1,
                                parallelizable: true,
                                dependencies: ['T001'],
                                requirements: ['spatial_calculation', 'deterministic_solution']
                            }
                        ],
                        skipConsensus: false,
                        skipCritic: false
                    };
                }

                return {
                    mode: 'standard',
                    description: 'Standard multi-agent collaboration with strategic alignment',
                    tasks: [
                        {
                            id: 'T001',
                            description: `Thu thập thông tin, nghiên cứu thị trường và phân tích dữ liệu cho: ${userRequest}`,
                            assignedTo: 'researcher',
                            priority: 1,
                            parallelizable: true
                        },
                        {
                            id: 'T002',
                            description: `Triển khai giải pháp kỹ thuật, code/script và nội dung hoàn chỉnh cho: ${userRequest}`,
                            assignedTo: 'developer',
                            priority: 1,
                            parallelizable: true
                        }
                    ],
                    skipConsensus: false,
                    skipCritic: false
                };
            }
        }
    }

    /**
     * Update 20: Validate DAG structure, detect cycles via Kahn's algorithm, and return topologically sorted tasks
     */
    validateAndToposort(tasks = []) {
        if (!Array.isArray(tasks) || tasks.length === 0) return [];
        const taskMap = new Map();
        const inDegree = new Map();
        const adj = new Map();

        for (const t of tasks) {
            taskMap.set(t.id, t);
            inDegree.set(t.id, 0);
            adj.set(t.id, []);
        }

        for (const t of tasks) {
            const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
            for (const d of deps) {
                if (adj.has(d)) {
                    adj.get(d).push(t.id);
                    inDegree.set(t.id, inDegree.get(t.id) + 1);
                }
            }
        }

        const queue = [];
        for (const [id, deg] of inDegree.entries()) {
            if (deg === 0) queue.push(id);
        }

        const sorted = [];
        while (queue.length > 0) {
            const u = queue.shift();
            sorted.push(taskMap.get(u));
            for (const v of adj.get(u)) {
                inDegree.set(v, inDegree.get(v) - 1);
                if (inDegree.get(v) === 0) queue.push(v);
            }
        }

        if (sorted.length !== tasks.length) {
            const unvisited = tasks.filter(t => !sorted.some(s => s.id === t.id)).map(t => t.id);
            throw new Error(`[AdaptivePlanner] Cycle detected in task dependencies: [${unvisited.join(', ')}]`);
        }
        return sorted;
    }

    /**
     * Update 20: Synthesize an autonomous, open-ended task DAG for novel requests
     * Dynamically determining role allocation, concurrency matrices, dependency trees,
     * tool budgets, and verification criteria based on semantic intent and topology
     */
    synthesizeDynamicDag(userRequest, options = {}) {
        const text = String(userRequest || '').trim();
        const planId = `DAG_${Date.now().toString(36)}`;

        // If explicit custom tasks passed, validate and toposort
        if (Array.isArray(options.customTasks) && options.customTasks.length > 0) {
            const sorted = this.validateAndToposort(options.customTasks);
            return {
                mode: 'dynamic_dag',
                planId,
                description: `Custom validated DAG (${sorted.length} nodes)`,
                tasks: sorted,
                isDynamicDag: true
            };
        }

        // Semantic analysis for autonomous decomposition
        const isComparison = /so sánh|đối chiếu|\bcompare\b|\bvs\b|đồng thời|song song|hai bên/i.test(text);
        const needsResearch = /tìm|tra cứu|nghiên cứu|thị trường|phân tích|doi|paper|báo cáo|dữ liệu|cào|crawl|scrape|fetch|thống kê/i.test(text);
        const needsCode = /code|script|tính toán|mô hình|xây dựng|tạo file|xuất file|csv|python|javascript|chạy|xử lý/i.test(text);
        const needsSecurity = /bảo mật|security|quét lỗ hổng|audit an toàn|injection|sandbox|phân quyền/i.test(text);
        const needsVerification = /kiểm tra|thẩm định|chính xác|xác nhận|verify|audit|chống sai|nghiệm thu/i.test(text) || needsCode;

        const tasks = [];

        if (isComparison) {
            // Autonomous Concurrency: Generate multiple parallel exploration nodes
            const compMatch = text.match(/(?:so sánh|đối chiếu|compare)\s+([^và]+?)\s+(?:và|với|vs)\s+(.+)/i);
            const targetA = compMatch ? compMatch[1].trim() : 'Đối tượng A';
            const targetB = compMatch ? compMatch[2].trim() : 'Đối tượng B';

            const nodeA = `${planId}_01_EXPLORE_A`;
            const nodeB = `${planId}_01_EXPLORE_B`;

            tasks.push({
                id: nodeA,
                description: `Nghiên cứu độc lập và thu thập dữ liệu chuyên sâu cho: ${targetA}`,
                assignedTo: 'researcher',
                priority: 1,
                dependencies: [],
                toolsRequired: ['web_search', 'fetch_page'],
                acceptanceCriteria: ['non-empty output', 'claims'],
                timeoutMs: 60000
            });

            tasks.push({
                id: nodeB,
                description: `Nghiên cứu độc lập và thu thập dữ liệu chuyên sâu cho: ${targetB}`,
                assignedTo: 'researcher',
                priority: 1,
                dependencies: [],
                toolsRequired: ['web_search', 'fetch_page'],
                acceptanceCriteria: ['non-empty output', 'claims'],
                timeoutMs: 60000
            });

            const synthNode = `${planId}_02_SYNTHESIS`;
            tasks.push({
                id: synthNode,
                description: `Tổng hợp đối chiếu đa chiều, phân tích điểm tương đồng & dị biệt giữa ${targetA} và ${targetB}`,
                assignedTo: 'developer',
                priority: 1,
                dependencies: [nodeA, nodeB], // Converges parallel branches!
                toolsRequired: ['python_runner'],
                acceptanceCriteria: ['non-empty output'],
                timeoutMs: 90000
            });

            if (needsVerification) {
                tasks.push({
                    id: `${planId}_03_AUDIT`,
                    description: `Kiểm chứng tính khách quan của dữ liệu đối chiếu và nghiệm thu kết quả so sánh`,
                    assignedTo: 'critic',
                    priority: 2,
                    dependencies: [synthNode],
                    toolsRequired: [],
                    acceptanceCriteria: ['non-empty output'],
                    timeoutMs: 45000
                });
            }
        } else {
            // Standard multi-stage autonomous pipeline
            if (needsResearch || !needsCode) {
                tasks.push({
                    id: `${planId}_01_RESEARCH`,
                    description: `Thu thập dữ liệu nguồn, trích xuất cấu trúc và kiểm chứng tham số đầu vào cho yêu cầu: ${text}`,
                    assignedTo: 'researcher',
                    priority: 1,
                    dependencies: [],
                    toolsRequired: ['web_search', 'fetch_page'],
                    acceptanceCriteria: ['non-empty output', 'claims'],
                    timeoutMs: 60000
                });
            }

            if (needsCode) {
                const deps = tasks.length > 0 ? [tasks[tasks.length - 1].id] : [];
                tasks.push({
                    id: `${planId}_02_EXECUTE`,
                    description: `Triển khai mã nguồn thực thi, xử lý thuật toán và sản xuất kết quả vật lý cho: ${text}`,
                    assignedTo: 'developer',
                    priority: 1,
                    dependencies: deps,
                    toolsRequired: ['python_runner', 'file_writer'],
                    acceptanceCriteria: ['executable_code', 'syntax', 'tool_execution'],
                    timeoutMs: 90000
                });
            }

            if (needsSecurity) {
                const deps = tasks.length > 0 ? [tasks[tasks.length - 1].id] : [];
                tasks.push({
                    id: `${planId}_02_SECURITY_AUDIT`,
                    description: `Kiểm tra an ninh và kiểm toán lỗ hổng độc lập cho giải pháp: ${text}`,
                    assignedTo: 'security_auditor',
                    priority: 1,
                    dependencies: deps,
                    toolsRequired: ['code_scanner'],
                    acceptanceCriteria: ['non-empty output'],
                    timeoutMs: 45000
                });
            }

            if (needsVerification && tasks.length > 0) {
                tasks.push({
                    id: `${planId}_03_AUDIT`,
                    description: `Thẩm định độc lập tính chính xác của sản phẩm, đối chiếu tiêu chí chất lượng và phê duyệt nghiệm thu cho: ${text}`,
                    assignedTo: 'critic',
                    priority: 2,
                    dependencies: [tasks[tasks.length - 1].id],
                    toolsRequired: [],
                    acceptanceCriteria: ['non-empty output'],
                    timeoutMs: 45000
                });
            }
        }

        // Topologically sort and ensure acyclic validity
        const validatedTasks = this.validateAndToposort(tasks);

        return {
            mode: 'dynamic_dag',
            planId,
            description: `Autonomous synthesized DAG (${validatedTasks.length} nodes) with topological validation`,
            tasks: validatedTasks,
            isDynamicDag: true
        };
    }

    /**
     * Dynamic replanning when a task fails, times out, or produces invalid output
     * Tier 4 Multi-Strategy Diagnosis and Targeted Remediation
     */
    replan(failedTask, failureReason, currentPlan, userRequest, directive = {}) {
        const taskId = failedTask?.id || failedTask?.taskId || 'unknown';
        const taskDesc = failedTask?.description || userRequest;
        const assigned = failedTask?.assignedTo || 'developer';
        const reasonLower = String(failureReason).toLowerCase();

        console.warn(`🔄 [AdaptivePlanner] Replanning triggered due to task failure: [${taskId}] - Reason: ${failureReason}`);

        // Tier 4 Multi-Strategy Diagnosis
        let diagnosedCategory = 'GENERIC_FAILURE';
        let fallbackStrategy = 'alternative_approach';
        let suggestedRole = assigned === 'developer' ? 'researcher' : 'developer';
        let remediationGuidance = '';
        let recoveryAcceptanceCriteria = ['non-empty output'];

        if (reasonLower.includes('timeout') || reasonLower.includes('timedout') || reasonLower.includes('latency') || reasonLower.includes('quá thời gian') || reasonLower.includes('hết giờ')) {
            diagnosedCategory = 'TIMEOUT_LATENCY_BOTTLENECK';
            fallbackStrategy = 'streamlined_execution';
            suggestedRole = 'developer';
            remediationGuidance = 'Rút ngắn phạm vi truy vấn, bỏ qua các bước duyệt web sâu không cần thiết và thực hiện tính toán trực tiếp.';
            recoveryAcceptanceCriteria.push('tool_execution');
        } else if (reasonLower.includes('tool') || reasonLower.includes('command') || reasonLower.includes('exec') || reasonLower.includes('404')) {
            diagnosedCategory = 'TOOL_EXECUTION_FAILURE';
            fallbackStrategy = 'isolated_script_fallback';
            suggestedRole = 'developer';
            remediationGuidance = 'Chuyển sang viết mã script Python độc lập để đọc dữ liệu đĩa thay vì gọi lệnh shell trực tiếp.';
            recoveryAcceptanceCriteria.push('executable_code', 'tool_execution');
        } else if (reasonLower.includes('syntax') || reasonLower.includes('parse') || reasonLower.includes('cú pháp')) {
            diagnosedCategory = 'SYNTAX_COMPILATION_ERROR';
            fallbackStrategy = 'syntax_safe_parsing';
            suggestedRole = 'developer';
            remediationGuidance = 'Áp dụng cú pháp an toàn, kiểm tra trước khi thực thi và bọc trong khối try/except.';
            recoveryAcceptanceCriteria.push('syntax');
        } else if (reasonLower.includes('deficit') || reasonLower.includes('empty') || reasonLower.includes('rỗng')) {
            diagnosedCategory = 'EVIDENCE_DATA_DEFICIT';
            fallbackStrategy = 'deep_factual_retrieval';
            suggestedRole = 'researcher';
            remediationGuidance = 'Tìm kiếm các nguồn dữ liệu thay thế và trích xuất số liệu định lượng cụ thể từ tài liệu đính kèm.';
            recoveryAcceptanceCriteria.push('claims');
        } else {
            diagnosedCategory = 'LOGIC_ALIGNMENT_FAILURE';
            fallbackStrategy = 'orthogonal_role_perspective';
            suggestedRole = assigned === 'developer' ? 'researcher' : 'developer';
            remediationGuidance = 'Tiếp cận vấn đề từ góc nhìn chuyên môn đối ứng để kiểm tra lại các giả định ban đầu.';
        }

        const remainingTasks = (currentPlan?.tasks || []).filter(t => (t.id || t.taskId) !== taskId);
        const recoveryTaskId = `REC_${Date.now().toString().slice(-4)}`;

        const recoveryTask = {
            id: recoveryTaskId,
            description: `[RECOVERY - ${diagnosedCategory}] ${remediationGuidance} Nhiệm vụ lỗi: [${taskId}]. Lý do: ${failureReason}. Mục tiêu: ${taskDesc}`,
            assignedTo: suggestedRole,
            priority: 1,
            isRecovery: true,
            recoveredTaskId: taskId,
            diagnosticCategory: diagnosedCategory,
            fallbackStrategy: fallbackStrategy,
            acceptanceCriteria: recoveryAcceptanceCriteria,
            timeoutMs: diagnosedCategory === 'TIMEOUT_LATENCY_BOTTLENECK'
                ? Math.max((failedTask.timeoutMs || 60000) * 1.5, 90000)
                : (failedTask.timeoutMs || 60000),
            parallelizable: false
        };

        // Cập nhật các task phụ thuộc: chuyển từ phụ thuộc vào task lỗi sang phụ thuộc vào recovery task
        const updatedRemainingTasks = remainingTasks.map(t => {
            if (Array.isArray(t.dependencies) && t.dependencies.includes(taskId)) {
                return {
                    ...t,
                    dependencies: t.dependencies.map(d => d === taskId ? recoveryTaskId : d)
                };
            }
            return t;
        });

        return {
            mode: currentPlan?.mode || 'adaptive_recovery',
            description: `Adapted plan after recovering from [${taskId}]`,
            tasks: [recoveryTask, ...updatedRemainingTasks],
            replanCount: (currentPlan?.replanCount || 0) + 1,
            skipConsensus: false,
            skipCritic: false
        };
    }

    /**
     * Generate an executable StateGraph instance from a plan
     */
    generateStateGraph(mode, userRequest, strategicDirective = {}, matchedSkill = null, options = {}) {
        const { StateGraph } = require('./StateGraph');
        const plan = this.generatePlan(mode, userRequest, strategicDirective, matchedSkill);
        const graph = new StateGraph({
            graphId: options.graphId || options.taskId || `graph_${Date.now()}`,
            initialState: {
                userRequest,
                mode: plan.mode,
                directive: strategicDirective,
                ...options.initialState
            },
            checkpointManager: options.checkpointManager || null,
            verifier: options.verifier || null,
            eventStream: options.eventStream || null
        });

        // Add all tasks as StateNodes
        for (const task of plan.tasks) {
            graph.addNode({
                id: task.id,
                description: task.description,
                assignedTo: task.assignedTo,
                dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
                acceptanceCriteria: task.requirements || task.acceptanceCriteria || [],
                timeoutMs: options.timeoutMs || 60000,
                maxRetries: 2,
                idempotent: true,
                taskPayload: task
            });
        }

        // Connect edges based on dependencies
        for (const task of plan.tasks) {
            if (Array.isArray(task.dependencies)) {
                for (const depId of task.dependencies) {
                    if (graph.nodes.has(depId)) {
                        graph.addEdge(depId, task.id);
                    }
                }
            }
        }

        return { graph, plan };
    }
}

module.exports = { AdaptivePlanner };
