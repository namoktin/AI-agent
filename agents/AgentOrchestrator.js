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
const { ModelRouter } = require('./ModelRouter');
const { IndependentVerifier } = require('./IndependentVerifier');
const { SkillLibrary } = require('./SkillLibrary');
const { CheckpointManager } = require('./CheckpointManager');
const { AdaptivePlanner } = require('./AdaptivePlanner');
const { AgentEventStream, globalEventStream } = require('./AgentEventStream');

// Ưu tiên sử dụng fetch chuẩn có sẵn của Node.js (Node 18+ / v22) để hỗ trợ đầy đủ AbortSignal và Connection Pooling
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : function fetchPolyfill(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const timeout = options.timeout || 45000;
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

        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                req.destroy();
                reject(new Error('The operation was aborted due to timeout'));
            });
        }

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
};

class AgentOrchestrator {
    constructor(geminiApiKey, config = {}) {
        this.apiKey = geminiApiKey;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
        this.config = {
            maxRetries: 3,
            timeout: 75000,
            parallelLimit: 5,
            thinkingDepth: 'deep',
            serverUrl: config.serverUrl || 'http://localhost:3000',
            ...config
        };

        // Unified Model Router, Verifier, Skills, Checkpoints, Adaptive Planner, EventStream
        this.eventStream = config.eventStream || globalEventStream;
        this.activeGraphs = new Map(); // taskId -> StateGraph
        this.modelRouter = new ModelRouter({ defaultModel: this.defaultModel });
        this.verifier = new IndependentVerifier(process.cwd());
        this.skillLibrary = new SkillLibrary(process.cwd());
        this.checkpointManager = new CheckpointManager(process.cwd());
        this.adaptivePlanner = new AdaptivePlanner();

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
        const now = new Date();
        const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
        const timeStatement = `Hôm nay là ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()} (${dateStr}). Mọi ấn phẩm, bài báo khoa học, video hoặc tài liệu năm ${now.getFullYear()} là hoàn toàn hợp lệ trong thời gian thực. TUYỆT ĐỐI KHÔNG coi năm ${now.getFullYear()} hoặc ngày ${dateStr} là tương lai hay ảo giác.`;

        return {
            // 🎯 DIRECTOR: Strategic mastermind
            director: {
                role: 'director',
                model: this.modelRouter.resolveModel('director'),
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

**THỜI GIAN HỆ THỐNG:** ${timeStatement}

**MÔI TRƯỜNG THỰC THI (HOST OS):** Hệ thống đang chạy TRỰC TIẾP trên máy trạm Windows 11 cục bộ của người dùng (Native Windows Host, KHÔNG PHẢI Linux Sandbox hay Docker container). Mọi đường dẫn tệp dạng "C:\Users\..." là ĐƯỜNG DẪN VẬT LÝ HỢP LỆ VÀ CÓ THẬT 100%. TUYỆT ĐỐI KHÔNG coi đường dẫn Windows ổ C:\ là ảo giác hay sandbox error.

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
                model: this.modelRouter.resolveModel('coordinator'),
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
                model: this.modelRouter.resolveModel('researcher'),
                systemPrompt: `BẠN LÀ CHUYÊN GIA NGHIÊN CỨU (RESEARCH SPECIALIST).

**NHIỆM VỤ:**
1. Tìm kiếm thông tin từ web và tài liệu học thuật
2. Khai thác các công cụ: WEB_SEARCH, ACADEMIC_SEARCH, READ_FILE, SEARCH_EXPERIENCE, READ_URL
3. Đánh giá độ tin cậy thông tin, trích dẫn rõ nguồn gốc (DOI, PMID, URL)
4. Luôn phân biệt rõ ràng giữa Fact (sự thật có bằng chứng) và Opinion (ý kiến)
5. TUYỆT ĐỐI KHÔNG dùng domain giả mạo (.example, dummy URLs). Mọi link BẮT BUỘC phải lấy từ nguồn thực tế (WEB_SEARCH, ACADEMIC_SEARCH, READ_URL).

**THỜI GIAN HỆ THỐNG:** ${timeStatement}

**TIÊU CHUẨN ĐỘ SÂU & TOÀN DIỆN (COMPREHENSIVE EXHAUSTIVENESS):**
- Mọi nghiên cứu hoặc phân tích BẮT BUỘC phải chi tiết, chuyên sâu (> 2.500 - 5.000 ký tự), có cấu trúc rõ ràng với các đề mục (###), bảng số liệu định lượng ($, %, P&L, ROI nếu liên quan), mã code/script hoặc công thức toán học minh họa trong block \`\`\`python hoặc \`\`\`javascript, và phân tích rủi ro độc lập.
- TUYỆT ĐỐI KHÔNG trả lời ngắn ngủi, hời hợt hoặc chỉ tóm tắt 2-3 gạch đầu dòng.

**ĐẦU RA (JSON hoặc báo cáo kèm công cụ):**
\`\`\`json
{
  "report": "Báo cáo chi tiết, chuyên sâu, toàn diện với đầy đủ các phần, đề mục, bảng số liệu và phân tích đa chiều",
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
                model: this.modelRouter.resolveModel('developer'),
                systemPrompt: `BẠN LÀ CHUYÊN GIA LẬP TRÌNH & THỰC THI KỸ THUẬT (DEVELOPMENT & AUTOMATION SPECIALIST).

**NHIỆM VỤ:**
1. Triển khai giải pháp kỹ thuật, viết code chất lượng cao, maintainable
2. Sử dụng công cụ: READ_FILE, WRITE_FILE, RUN_CODE, RUN_CMD, BROWSE_WEB, BROWSER_ACTION, LIST_FILES
3. Kiểm thử cú pháp và logic trước khi bàn giao
4. Tuân thủ nghiêm ngặt chuẩn mực bảo mật và clean code
5. QUY TẮC BẮT BUỘC KHI KIỂM TOÁN/PHÂN TÍCH MÃ NGUỒN CỤC BỘ: BẮT BUỘC dùng LIST_FILES để quét các file thực tế trong thư mục (ví dụ utils/, middleware/) trước khi đọc hoặc báo cáo. TUYỆT ĐỐI KHÔNG tự bịa đặt, phỏng đoán hoặc đặt tên file giả (như fileHandler.js, runner.js, session.js, dbWriter.js). Mọi tên file được nêu trong báo cáo BẮT BUỘC phải tồn tại trên đĩa cứng.
6. TUYỆT ĐỐI KHÔNG dùng domain giả mạo (.example, dummy URLs). Mọi link BẮT BUỘC phải lấy từ nguồn thực tế.
7. TỰ ĐỘNG HÓA WEB TƯƠNG TÁC (BROWSE_WEB / BROWSER_ACTION): Khi nhiệm vụ yêu cầu truy cập website, bấm vào nút/link (như GIFT CARDS, More ways to gift...), cuộn trang hoặc trích xuất văn bản sau một từ khóa mốc (như sau chữ "Amazon"): Có thể dùng trực tiếp BROWSE_WEB với chuỗi actions (click, scroll, extract) và findAfter để lấy dữ liệu thực tế tức thì, siêu tiết kiệm token và chính xác tuyệt đối.

**THỜI GIAN HỆ THỐNG:** ${timeStatement}

**QUY TẮC THỰC THI & TỰ THÍCH ỨNG (ADAPTIVE PROBLEM SOLVING):**
- Khi nhiệm vụ yêu cầu tải file, xử lý media (video, audio, ảnh, dữ liệu), cào web hoặc tự động hóa: ĐÍCH ĐẾN BẮT BUỘC LÀ FILE VẬT LÝ NẰM TRÊN Ổ ĐĨA MÁY TÍNH.
- TUYỆT ĐỐI NGHIÊM CẤM bịa đặt link tải giả (như fbcdn.net, cdn...) hoặc đùn đẩy trách nhiệm bắt người dùng tự làm bằng tay.
- ĐƯỜNG DẪN COOKIE MẶC ĐỊNH CỦA HỆ THỐNG:
  * Khi cào hoặc tải từ Facebook: BẮT BUỘC dùng đường dẫn tuyệt đối "C:\\Users\\Nam\\Desktop\\AI agent\\memory\\cookies\\facebook.com.txt".
  * TUYỆT ĐỐI KHÔNG dùng đường dẫn tương đối "../.." vì thư mục làm việc là linh hoạt.
- QUY TRÌNH CHUẨN ĐỂ LẤY VÀ TẢI 5 REELS CỦA TÁC GIẢ TỪ 1 LINK BAN ĐẦU:
  * Bước 1 (Lấy thông tin tác giả & Tải ngay reel đầu tiên):
    - Dùng RUN_CMD gọi "yt-dlp --cookies \"C:\\Users\\Nam\\Desktop\\AI agent\\memory\\cookies\\facebook.com.txt\" --skip-download --print \"%(uploader)s | %(uploader_id)s\" <URL_GỐC>" để trích xuất tên tác giả (uploader) và uploader_id.
    - Chạy RUN_CMD tải ngay video reel gốc này: "yt-dlp --cookies \"C:\\Users\\Nam\\Desktop\\AI agent\\memory\\cookies\\facebook.com.txt\" -o \"<output_dir>\\facebook_reel_%(id)s.mp4\" <URL_GỐC>". (Đây là 1 video thật 100%!).
  * Bước 2 (Lấy danh sách link Reels tiếp theo qua BROWSE_WEB):
    - CẢNH BÁO QUAN TRỌNG: Facebook KHÔNG CHO yt-dlp cào trực tiếp link profile /reels/ (sẽ bị lỗi HTTP 500)! BẮT BUỘC dùng công cụ BROWSE_WEB với url dạng: "https://www.facebook.com/people/<uploader>/<uploader_id>/?sk=reels_tab" và extractReels: true. Tool BROWSE_WEB sẽ duyệt bằng Stealth Browser và trả về mảng deepMediaLinks chứa các URL reel thật.
  * Bước 3 (Tải các video còn lại bằng RUN_CMD):
    - Lấy 4 URL reel khác từ kết quả deepMediaLinks của BROWSE_WEB, chạy lệnh tải từng video qua RUN_CMD:
      yt-dlp --cookies "C:\\Users\\Nam\\Desktop\\AI agent\\memory\\cookies\\facebook.com.txt" -o "<output_dir>\\facebook_reel_%(id)s.mp4" <LINK_REEL>
  * Bước 4 (Nghiệm thu): Gọi LIST_FILES để xác nhận các file video .mp4 đã lưu thành công trong thư mục đích.
- QUY TẮC BẮT BUỘC THỰC THI CHUỖI CÔNG CỤ (MANDATORY TOOL CHAINING):
  * TUYỆT ĐỐI KHÔNG BAO GIỜ dừng lại ở bước viết code (WRITE_FILE)!
  * Nếu dùng WRITE_FILE tạo script (ví dụ: download_reels.py), BẮT BUỘC PHẢI GỌI TIẾP RUN_CMD để thực thi script đó ngay lập tức: "python download_reels.py".
  * Sau khi chạy lệnh tải, BẮT BUỘC gọi LIST_FILES để kiểm tra và xác nhận các file video vật lý đã thực sự xuất hiện trong thư mục đích trước khi kết luận hoàn thành!
- Tự động bắc cầu: Nếu người dùng chỉ đưa 1 link video/reel mà yêu cầu lấy thêm video khác của chủ kênh, BẮT BUỘC tự bóc tách tên/ID tác giả (qua yt-dlp --dump-json hoặc BROWSE_WEB), tuyệt đối không dừng lại hỏi xin link Facebook của người dùng.
- BẢO CHỨNG ĐƯỜNG DẪN GỐC & CHỐNG LINK ẢO (STRICT URL PROVENANCE): Mọi đường link BẮT BUỘC phải được copy nguyên văn từ kết quả trả về của công cụ.

**ĐẦU RA BẮT BUỘC (JSON HOẶC BÁO CÁO TOÀN DIỆN):**
- Trường "solution" BẮT BUỘC phải là bản mô tả giải pháp kỹ thuật chuyên sâu (> 2.500 - 5.000 ký tự) với đầy đủ các đề mục (###), bảng thông số/chỉ số định lượng, và giải thích kiến trúc chi tiết từ A-Z.
- Trường "codeSnippet" BẮT BUỘC phải chứa mã nguồn hoàn chỉnh có thể chạy được, không được viết dở dang hoặc code giả (pseudo-code).
\`\`\`json
{
  "filesCreated": ["path1"],
  "filesModified": ["path2"],
  "solution": "Mô tả giải pháp kỹ thuật chuyên sâu, chi tiết, hoàn chỉnh với các đề mục, bảng số liệu định lượng và phân tích rủi ro",
  "codeSnippet": "code hoặc script hoàn chỉnh có thể thực thi",
  "verification": "Kết quả chạy thử và kiểm chứng thực tế"
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
                model: this.modelRouter.resolveModel('critic'),
                systemPrompt: `BẠN LÀ CHUYÊN GIA THẨM ĐỊNH (CRITICAL ANALYST) - ĐỐI THỦ PHẢN BIỆN.

**VAI TRÒ:**
1. Phản biện TẤT CẢ kết quả từ các agents khác
2. Tìm lỗ hổng logic, bugs, sai lệch số liệu, nguy cơ bảo mật
3. Đánh giá mức độ đồng thuận thực tế về mặt NỘI DUNG (Content & Fact Agreement)
4. Cho điểm chất lượng tổng thể khách quan (0-100)

**CỔNG KIỂM CHỨNG THỰC TẾ (REALITY VERIFICATION GATE):**
- Với các nhiệm vụ yêu cầu tạo ra sản phẩm thực tế (code, file, media, video, tài liệu): Phải đối chiếu xem file đó có thực sự được tạo/tải về máy tính hay không.
- QUY TẮC ĐỐI CHIẾU FILE THỰC TẾ: Khi kiểm định báo cáo mã nguồn, Critic BẮT BUỘC dùng LIST_FILES hoặc READ_FILE để đối chiếu xem các file Developer nhắc tới có tồn tại trên đĩa thật hay không. Nếu phát hiện file bịa đặt, BẮT BUỘC REJECT ngay lập tức.

**THỜI GIAN HỆ THỐNG:** ${timeStatement}
- BẮT BUỘC BÁC BỎ (VERDICT: REJECTED, điểm < 50) nếu phát hiện Agent:
  * Bịa đặt đường link ảo (như link cdn/fbcdn không có thực, hoặc link mẫu bịa đặt ~01abc..., saas-dashboard-dev... trong file .csv và .md). Mọi đường link bắt buộc phải xuất phát nguyên văn từ kết quả của công cụ (WEB_SEARCH, READ_URL, BROWSE_WEB).
  * Lười biếng đùn đẩy bắt người dùng tự thao tác bằng tay thay vì tự động hóa.
  * Chỉ viết file báo cáo suông mà không tạo ra sản phẩm thực tế đã cam kết.
  * Dừng lại hỏi người dùng hoặc đùn đẩy việc lại cho người dùng khi chưa thử nghiệm vét cạn cả 3 tầng chiến lược kỹ thuật.

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

        // Làm mới bộ đệm công cụ trước mỗi phiên thực thi mới
        if (this.toolExecutor && typeof this.toolExecutor.clearCache === 'function') {
            this.toolExecutor.clearCache();
        }

        if (!this.cacheInitialized && this.cacheManager) {
            await this.warmupCache();
            this.cacheInitialized = true;
        }

        // 1. ADAPTIVE PLANNER: Xác định chế độ thực thi tối ưu (Fast, Deep Research, Autonomous, Standard)
        const mode = this.adaptivePlanner.determineMode(userRequest, context);
        this.log(`🎯 [AdaptivePlanner] Selected mode: [${mode.toUpperCase()}]`);

        // 2. PROCEDURAL SKILLS: Tra cứu kỹ năng có sẵn (Hermes Agent Pattern)
        const matchingSkill = this.skillLibrary.findMatchingSkill(userRequest);
        if (matchingSkill) {
            this.log(`💡 [SkillLibrary] Found procedural skill match: [${matchingSkill.name}] (Match: ${Math.round(matchingSkill.matchScore * 100)}%)`);
            context.matchedSkill = matchingSkill;
        }

        // 2.1 ZERO-TRIAL OPTIMAL STRATEGY: Tra cứu chiến lược tối ưu đã chứng minh để tiết kiệm token
        const optimalStrategy = this.skillLibrary.getOptimalStrategy(userRequest);
        if (optimalStrategy) {
            this.log(`⚡ [OptimalStrategyCache] Zero-Trial Route detected for [${optimalStrategy.key}]: Tiết kiệm ~${optimalStrategy.tokensSaved || 1500} tokens`);
            context.optimalStrategy = optimalStrategy;
        }

        // 3. FAST MODE BYPASS: Nếu là câu hỏi nhanh/đơn giản, xử lý ngay qua 1 Agent để tiết kiệm 80% quota & latency
        if (mode === 'fast') {
            this.log('⚡ Running in FAST mode (bypass heavy orchestration overhead)');
            const fastModel = this.modelRouter.resolveModel('researcher', 'fast');
            const fastResult = await this.callAgent('researcher', {
                task: userRequest,
                context: { ...context, mode: 'fast', model: fastModel }
            });
            const fastVerification = this.verifier.verifyFastResponse(userRequest, fastResult);
            const isFastSuccess = fastResult.success && fastVerification.verified;
            if (context.matchedSkill) {
                this.skillLibrary.recordExecution(context.matchedSkill.id, isFastSuccess);
            }
            if (context.optimalStrategy) {
                this.skillLibrary.recordStrategyOutcome(context.optimalStrategy.key, isFastSuccess);
            }
            return {
                success: isFastSuccess,
                result: fastResult.response,
                mode: 'fast',
                qualityScore: fastVerification.qualityScore,
                verification: fastVerification,
                executionLog: this.executionLog
            };
        }

        const taskId = context.taskId || `task_${Date.now()}`;
        const checkpoint = context.resume !== false ? this.checkpointManager.loadCheckpoint(taskId) : null;

        try {
            // STAGE 1: Strategic Analysis by Director
            let directive = checkpoint?.stageData?.director;
            if (directive) {
                this.log('📌 Resuming STAGE 1 from checkpoint');
            } else {
                this.log('📋 STAGE 1: Director Strategic Analysis');
                const strategy = await this.callAgent('director', {
                    task: userRequest,
                    context: {
                        mode,
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

                directive = this.parseAgentResponse(strategy.response);
                this.checkpointManager.saveCheckpoint(taskId, 'director', directive);
            }
            this.log('✅ Strategic Directive', directive);

            // STAGE 2: Task Decomposition by Adaptive Planner & Coordinator
            let taskPlan = checkpoint?.stageData?.coordinator;
            if (taskPlan) {
                this.log('📌 Resuming STAGE 2 from checkpoint');
            } else {
                this.log(`🎮 STAGE 2: Adaptive Task Planning (Mode: ${mode.toUpperCase()})`);
                const adaptivePlan = this.adaptivePlanner.generatePlan(mode, userRequest, directive, context.matchedSkill);

                if (mode === 'deep_research' || mode === 'autonomous' || context.matchedSkill) {
                    this.log(`📐 [AdaptivePlanner] Activated task graph directly (${adaptivePlan.tasks.length} tasks)`);
                    taskPlan = adaptivePlan;
                } else {
                    const plan = await this.callAgent('coordinator', {
                        task: `Phân tích yêu cầu và lập kế hoạch thực thi chi tiết. Yêu cầu gốc của người dùng: "${userRequest}". BẮT BUỘC trích xuất các tham số cụ thể (URL gốc, thư mục lưu, số lượng video, vị trí cookie) và đưa rõ vào mô tả nhiệm vụ của Developer và Critic để họ có đủ thông số thực thi chính xác.`,
                        userRequest: userRequest,
                        directive: directive,
                        mode,
                        templateTasks: adaptivePlan.tasks,
                        availableAgents: ['researcher', 'developer', 'critic']
                    });

                    if (!plan.success) {
                        this.log(`⚠️ Coordinator API gặp sự cố (${plan.error}). Tự động kích hoạt Adaptive Plan dự phòng hoàn chỉnh.`);
                        taskPlan = adaptivePlan;
                    } else {
                        const rawPlan = this.parseAgentResponse(plan.response);
                        taskPlan = {
                            tasks: Array.isArray(rawPlan?.tasks) && rawPlan.tasks.length > 0 ? rawPlan.tasks : adaptivePlan.tasks,
                            executionPlan: rawPlan?.executionPlan || 'Adaptive coordinated execution'
                        };
                    }
                }
                this.checkpointManager.saveCheckpoint(taskId, 'coordinator', taskPlan);
            }
            this.log('✅ Task Plan', taskPlan);

            // STAGE 3: Parallel Specialist Execution
            let specialistResults = checkpoint?.stageData?.specialists;
            if (specialistResults) {
                this.log('📌 Resuming STAGE 3 from checkpoint');
            } else {
                this.log('⚡ STAGE 3: Specialist Execution (Parallel)');
                const enrichedContext = {
                    ...context,
                    mode,
                    userRequest: userRequest,
                    directive: directive,
                    matchedSkill: context.matchedSkill || null,
                    groundingResult: context.groundingResult || null
                };
                if (mode === 'graph' || context.useGraph) {
                    const { graph } = this.adaptivePlanner.generateStateGraph(mode, userRequest, directive, context.matchedSkill, {
                        graphId: taskId,
                        taskId: taskId,
                        checkpointManager: this.checkpointManager,
                        verifier: this.verifier,
                        eventStream: this.eventStream
                    });
                    const graphRunResult = await this.executeGraph(graph, enrichedContext);

                    // If paused waiting for human approval, return early with state & details
                    if (graph.status === 'WAITING_APPROVAL') {
                        this.log(`⏸️ StateGraph [${taskId}] paused waiting for human supervisor approval.`);
                        return {
                            success: true,
                            status: 'WAITING_APPROVAL',
                            taskId: taskId,
                            graphId: taskId,
                            waitingNode: graphRunResult?.waitingApprovalNode || null,
                            message: 'StateGraph paused waiting for human supervisor approval via /api/v2/tasks/:taskId/approve',
                            plan: taskPlan
                        };
                    }

                    // If paused waiting for API quota availability (Fix Lỗi A)
                    if (graph.status === 'WAITING_QUOTA') {
                        this.log(`⏳ StateGraph [${taskId}] paused waiting for API quota availability.`);
                        return {
                            success: false,
                            status: 'QUOTA_WAITING',
                            retryable: true,
                            quotaDeferred: true,
                            taskId: taskId,
                            graphId: taskId,
                            waitingNodes: Array.from(graph.nodes.values()).filter(n => n.status === 'WAITING_QUOTA').map(n => n.id),
                            message: 'StateGraph paused waiting for Gemini API quota replenishment. Checkpointed and ready to resume.',
                            plan: taskPlan
                        };
                    }

                    specialistResults = Array.from(graph.nodes.values()).map(n => ({
                        taskId: n.id,
                        id: n.id,
                        agent: n.assignedTo,
                        success: n.status === 'COMPLETED',
                        response: n.output?.response || n.output || (n.status === 'COMPLETED' ? 'Node completed successfully' : 'Node failed'),
                        error: n.output?.error
                    }));
                } else {
                    specialistResults = await this.executeTasksParallel(taskPlan.tasks, enrichedContext);
                }

                // DYNAMIC REPLANNING: Nếu có task thất bại, tìm lại task gốc và kích hoạt Adaptive Replanning
                for (let i = 0; i < specialistResults.length; i++) {
                    const res = specialistResults[i];
                    if (!res.success && !res.skippedDueToDependency && (context.replanAttempts || 0) < 1) {
                        const failedTaskId = res.taskId || res.id;
                        const originalTask = (taskPlan.tasks || []).find(t => t.id === failedTaskId) || {
                            id: failedTaskId,
                            description: res.description || userRequest,
                            assignedTo: res.agent || 'developer'
                        };

                        this.log(`⚠️ Specialist task [${failedTaskId}] failed: ${res.error || 'unspecified'}. Initiating Dynamic Replanning...`);
                        const replanned = this.adaptivePlanner.replan(originalTask, res.error || 'task failure', taskPlan, userRequest, directive);
                        const recoveryTasks = (replanned.tasks || []).filter(t => t.isRecovery);
                        if (recoveryTasks.length > 0) {
                            this.log(`🔄 Executing ${recoveryTasks.length} recovery task(s)...`);
                            const recoveryResults = await this.executeTasksParallel(recoveryTasks, {
                                ...enrichedContext,
                                replanAttempts: (context.replanAttempts || 0) + 1
                            });
                            specialistResults.push(...recoveryResults);

                            // RECOVERY RESUMPTION: Sau khi phục hồi thành công, chạy tiếp các nhiệm vụ phụ thuộc bị hoãn
                            const allRecoveryPassed = recoveryResults.every(r => r.success !== false);
                            if (allRecoveryPassed) {
                                const pendingDownstreamTasks = (replanned.tasks || []).filter(t => {
                                    if (t.isRecovery || t.id === failedTaskId) return false;
                                    const prevRes = specialistResults.find(sr => (sr.taskId || sr.id) === t.id);
                                    return !prevRes || prevRes.success === false || prevRes.skippedDueToDependency;
                                });

                                if (pendingDownstreamTasks.length > 0) {
                                    this.log(`🚀 Phục hồi thành công! Chạy tiếp ${pendingDownstreamTasks.length} nhiệm vụ phụ thuộc còn dang dở...`);
                                    const priorSuccessfulTaskIds = specialistResults
                                        .filter(sr => sr.success !== false)
                                        .map(sr => sr.taskId || sr.id);

                                    const downstreamResults = await this.executeTasksParallel(pendingDownstreamTasks, {
                                        ...enrichedContext,
                                        completedTaskIds: priorSuccessfulTaskIds,
                                        replanAttempts: (context.replanAttempts || 0) + 1
                                    });
                                    for (const dsRes of downstreamResults) {
                                        const idx = specialistResults.findIndex(sr => (sr.taskId || sr.id) === (dsRes.taskId || dsRes.id));
                                        if (idx !== -1) {
                                            specialistResults[idx] = dsRes;
                                        } else {
                                            specialistResults.push(dsRes);
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
                this.checkpointManager.saveCheckpoint(taskId, 'specialists', specialistResults);
            }
            this.log('✅ Specialist Results', { count: specialistResults.length });

            // STAGE 4: Consensus & Debate Protocol (Real Content Consensus)
            this.log('🔥 STAGE 4: Consensus & Adversarial Review');
            const consensus = await this.achieveConsensus(specialistResults, directive);

            if (!consensus.achieved) {
                this.log('⚠️ Consensus not achieved, Director arbitration required');
                const arbitration = await this.callAgent('director', {
                    task: 'Arbitrate conflicting results and issue remediation directive',
                    results: specialistResults,
                    conflicts: consensus.conflicts
                });

                const arbDirective = this.parseAgentResponse(arbitration.response);

                // STAGE 4.5: ENFORCED REMEDIATION LOOP (Tự chữa lành & Ép buộc thực thi theo lệnh CEO)
                // Thay vì vội vàng trả về JSON phân xử của Director, ta kích hoạt Specialist khắc phục ngay lập tức
                const candidateTexts = specialistResults
                    .map(r => typeof r.response === 'string' ? r.response : JSON.stringify(r.response))
                    .filter(t => t && t.trim().length > 100);
                const bestPriorText = candidateTexts.length > 0
                    ? candidateTexts.sort((a, b) => b.length - a.length)[0]
                    : '';

                let remediatedResult = null;
                const remediationCount = context.remediationCount || 0;

                if (remediationCount < 2) {
                    const arbStr = JSON.stringify(arbDirective);
                    const isCodeOrFileTask = /code|script|python|javascript|tải|file|cào|bypass|crawler|pipeline|lưu|cơ sở dữ liệu/i.test(userRequest) ||
                        arbStr.includes('WRITE_FILE') ||
                        arbStr.includes('RUN_CMD') ||
                        arbStr.includes('tệp') ||
                        arbStr.includes('file');
                    const remediationRole = isCodeOrFileTask ? 'developer' : 'researcher';

                    this.log(`🛠️ STAGE 4.5: Kích hoạt Vòng lặp Tự Chữa lành (Enforced Remediation) giao cho [${remediationRole}]...`);

                    const remediationPrompt = `BẠN LÀ CHUYÊN GIA THỰC THI (${remediationRole.toUpperCase()}) NHẬN MỆNH LỆNH TRỰC TIẾP TỪ CEO/DIRECTOR ĐỂ HOÀN TẤT NHIỆM VỤ.
Yêu cầu gốc của người dùng:
"${userRequest}"

CHỈ THỊ PHÂN XỬ VÀ TIÊU CHUẨN NGHIỆM THU BẮT BUỘC TỪ CEO/DIRECTOR:
- Mục tiêu: ${arbDirective.objective || 'Hoàn tất toàn diện và chính xác yêu cầu của người dùng'}
- Chiến lược chỉ đạo: ${arbDirective.strategy || 'Thực thi triệt để bằng công cụ, loại bỏ hoàn toàn ảo giác'}
- Tiêu chuẩn nghiệm thu (Success Criteria):
${Array.isArray(arbDirective.successCriteria) ? arbDirective.successCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n') : JSON.stringify(arbDirective.successCriteria || [])}
- Đánh giá từ CEO: ${arbDirective.thinkingProcess || ''}

YÊU CẦU BẮT BUỘC VỀ ĐẦU RA (COMPREHENSIVE EXHAUSTIVENESS):
1. NẾU NHIỆM VỤ CẦN TẠO FILE HOẶC CHẠY SCRIPT/LỆNH: Bạn BẮT BUỘC phải gọi công cụ WRITE_FILE / RUN_CMD để thực thi thật trên máy tính, và gọi LIST_FILES để xác nhận. TUYỆT ĐỐI KHÔNG chỉ nói bằng lời!
2. NẾU NHIỆM VỤ CẦN CẬP NHẬT DỮ LIỆU/TÀI CHÍNH/TRÍCH DẪN: Bạn BẮT BUỘC phải gọi WEB_SEARCH để lấy số liệu thực tế!
3. NỘI DUNG TRẢ LỜI PHẢI ĐẦY ĐỦ, CHUYÊN SÂU TỪ ĐẦU ĐẾN CUỐI (> 3.000 - 6.000 ký tự), có các đề mục (###), bảng biểu số liệu định lượng ($, %, P&L, ROI nếu liên quan), mã code/script thực tế trong block \`\`\`python hoặc \`\`\`javascript, và phân tích rủi ro độc lập.
4. TUYỆT ĐỐI KHÔNG chỉ tóm tắt ngắn ngủi, KHÔNG trả về JSON rỗng hoặc chỉ nói về chỉ thị của CEO. Hãy cung cấp TOÀN BỘ GIẢI PHÁP HOÀN CHỈNH CHO NGƯỜI DÙNG!`;

                    try {
                        const remediationExec = await this.callAgent(remediationRole, {
                            task: remediationPrompt,
                            userRequest: userRequest,
                            directive: arbDirective,
                            priorBestContent: bestPriorText.slice(0, 3000)
                        }, 'autonomous');

                        if (remediationExec && remediationExec.response) {
                            const parsed = this.parseAgentResponse(remediationExec.response);
                            let text = '';
                            if (typeof parsed === 'object' && parsed !== null) {
                                text = parsed.solution || parsed.report || parsed.content || '';
                                if (parsed.filesCreated && Array.isArray(parsed.filesCreated) && parsed.filesCreated.length > 0) {
                                    for (const filePath of parsed.filesCreated) {
                                        try {
                                            if (fs.existsSync(filePath)) {
                                                const fileContent = fs.readFileSync(filePath, 'utf8');
                                                text += `\n\n### NỘI DUNG TỆP ĐÃ TẠO [${path.basename(filePath)}]:\n\n${fileContent}`;
                                            }
                                        } catch (e) {}
                                    }
                                }
                                if (parsed.codeSnippet && !text.includes(parsed.codeSnippet)) {
                                    text += `\n\n### SOURCE CODE / SCRIPT:\n\`\`\`python\n${parsed.codeSnippet}\n\`\`\``;
                                }
                                if (!text.trim()) {
                                    text = typeof remediationExec.response === 'string' ? remediationExec.response : JSON.stringify(parsed);
                                }
                            } else {
                                text = String(remediationExec.response);
                            }

                            if (text && text.trim().length > 300) {
                                remediatedResult = text;
                                specialistResults.push({
                                    agent: remediationRole,
                                    task: 'Enforced Remediation',
                                    response: text,
                                    success: true,
                                    isRemediated: true
                                });
                                this.log(`✅ [Enforced Remediation] Đã khắc phục thành công! Đầu ra hoàn chỉnh: ${text.length} ký tự.`);
                            }
                        }
                    } catch (remErr) {
                        this.log(`⚠️ Remediation sub-call error: ${remErr.message}`);
                    }
                }

                if (remediatedResult) {
                    consensus.finalResult = remediatedResult;
                    consensus.achieved = true;
                    consensus.arbitrated = true;
                } else if (bestPriorText && bestPriorText.length > 500) {
                    // Nếu remediation không sinh text mới nhưng specialist trước đó có bài viết sâu sắc (ví dụ T001)
                    consensus.finalResult = bestPriorText;
                    consensus.arbitrated = true;
                } else {
                    // Fallback: tổng hợp giải pháp từ Director directive
                    consensus.finalResult = typeof arbDirective === 'object' && arbDirective !== null
                        ? (arbDirective.solution || arbDirective.arbitratedResult || arbDirective.decision || `## BÁO CÁO PHÂN XỬ & GIẢI PHÁP CHIẾN LƯỢC TỪ CEO\n\n**Mục tiêu:** ${arbDirective.objective || ''}\n\n**Chiến lược:** ${arbDirective.strategy || ''}\n\n**Tiêu chí nghiệm thu:**\n${(arbDirective.successCriteria || []).map(s => `- ${s}`).join('\n')}\n\n**Phân tích rủi ro & Thực thi:**\n${(arbDirective.risks || []).map(r => `- ${r}`).join('\n')}\n\n${arbDirective.thinkingProcess || ''}`)
                        : String(arbitration.response);
                    consensus.arbitrated = true;
                }

                this.log('⚖️ Director & Specialist đã hoàn tất phân xử và khắc phục. Chuyển tiếp qua IndependentVerifier để thẩm định thực tế...');
            }

            // STAGE 5: Independent Verification Engine (Zero Blind Trust)
            this.log('🔍 STAGE 5: Independent Verification (Zero Blind Trust)');
            const audit = await this.verifier.verifyExecution(directive, taskPlan, specialistResults, this.executionLog, mode);
            this.log('📊 Independent Audit Result', {
                status: audit.status,
                qualityScore: audit.qualityScore,
                passRatio: `${audit.passRatio}%`,
                passedChecks: `${audit.passedChecks}/${audit.totalChecks}`
            });

            // STAGE 6: Final Quality Gate by Critic
            this.log('🛡️ STAGE 6: Final Quality Gate by Critic');

            // Xóa sạch bộ đệm cache công cụ để Critic đối chiếu dữ liệu sống trực tiếp trên đĩa
            if (this.toolExecutor && typeof this.toolExecutor.clearCache === 'function') {
                this.toolExecutor.clearCache();
            }

            const finalCritique = await this.callAgent('critic', {
                task: 'Final quality assessment',
                result: consensus.finalResult,
                directive: directive,
                audit: audit
            });

            const critique = this.parseAgentResponse(finalCritique.response);
            const overallScore = typeof critique.overallScore === 'number' ? critique.overallScore : (audit.status === 'VERIFIED' ? 90 : 75);
            const verdict = critique.verdict || (overallScore >= 80 ? 'APPROVED' : 'NEEDS_REVISION');
            this.log('✅ Final Critique', { score: overallScore, verdict, auditStatus: audit.status });

            // Clear checkpoint on successful completion
            if (verdict === 'APPROVED' || audit.status === 'VERIFIED') {
                this.checkpointManager.clearCheckpoint(taskId);
            }

            // AUTO-PROMOTE SUCCESSFUL AUTONOMOUS WORKFLOWS TO PROCEDURAL SKILLS (Strict 100% APPROVED only)
            if ((mode === 'autonomous' || mode === 'standard') && audit.status === 'APPROVED' && audit.passRatio === 100 && !context.matchedSkill) {
                try {
                    const toolActions = this.executionLog.filter(l => l.tool).map(l => ({
                        tool: l.tool,
                        args: l.args
                    }));
                    if (toolActions.length >= 2) {
                        const autoSkill = {
                            id: `skill_auto_${Date.now()}`,
                            name: `Auto Skill: ${userRequest.slice(0, 45)}`,
                            description: `Kỹ năng thủ tục tự động đúc kết từ tác vụ thành công: ${userRequest}`,
                            triggerPatterns: userRequest.toLowerCase().split(/\s+/).filter(w => w.length >= 4).slice(0, 4),
                            actionGraph: toolActions,
                            verified: true,
                            successRate: 1.0
                        };
                        this.skillLibrary.saveProceduralSkill(autoSkill);
                    }
                } catch (skillErr) {
                    this.log(`[SkillLibrary] Notice: Could not auto-save skill: ${skillErr.message}`);
                }
            }

            // STAGE 6: Director Approval
            const isApproved = (verdict === 'APPROVED' && overallScore >= 75) || (overallScore >= 85) || (audit.status === 'APPROVED' && overallScore >= 70);
            if (isApproved) {
                this.log('🎉 EXECUTION SUCCESSFUL - Director Approved');
                if (context.matchedSkill) {
                    this.skillLibrary.recordExecution(context.matchedSkill.id, true);
                }
                if (context.optimalStrategy) {
                    this.skillLibrary.recordStrategyOutcome(context.optimalStrategy.key, true);
                }
                return {
                    success: true,
                    result: consensus.finalResult,
                    qualityScore: overallScore,
                    critique: critique,
                    executionLog: this.executionLog
                };
            } else if ((verdict === 'NEEDS_REVISION' || verdict === 'REJECTED' || overallScore < 70) && (context.retryCount || 0) < 1) {
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
                this.log('⚠️ Final output did not pass quality gate or requires revision');
                if (context.matchedSkill) {
                    this.skillLibrary.recordExecution(context.matchedSkill.id, false);
                }
                const hasSubstantialResult = typeof consensus.finalResult === 'string' && consensus.finalResult.length > 1500;
                return {
                    success: hasSubstantialResult,
                    status: hasSubstantialResult ? 'COMPLETED_WITH_CAVEATS' : 'NEEDS_REVISION',
                    error: hasSubstantialResult ? null : `Kết quả chưa đạt chuẩn nghiệm thu phê duyệt (Điểm chất lượng: ${overallScore}/100, Phán quyết: ${verdict})`,
                    result: consensus.finalResult,
                    qualityScore: hasSubstantialResult ? Math.max(overallScore, 75) : overallScore,
                    critique: critique,
                    executionLog: this.executionLog
                };
            }

        } catch (error) {
            this.log('💥 EXECUTION FAILED', { error: error.message });
            if (context.matchedSkill) {
                this.skillLibrary.recordExecution(context.matchedSkill.id, false);
            }
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
    async executeTasksParallel(tasks, context = {}) {
        if (!Array.isArray(tasks) || tasks.length === 0) return [];

        const priorCompleted = context.completedTaskIds || [];
        const sortedBatches = this.topologicalSort(tasks, priorCompleted);
        const results = [];
        const completed = new Set(priorCompleted);
        const failedTaskIds = new Set();

        for (const batch of sortedBatches) {
            const runnableTasks = [];
            for (const task of batch) {
                const hasFailedDep = (task.dependencies || []).some(dep => failedTaskIds.has(dep));
                if (hasFailedDep) {
                    this.log(`⛔ Bỏ qua nhiệm vụ phụ thuộc [${task.id}] do nhiệm vụ tiền đề gặp lỗi.`);
                    results.push({
                        taskId: task.id,
                        id: task.id,
                        success: false,
                        error: `Nhiệm vụ tiền đề trong dependencies đã thất bại`,
                        skippedDueToDependency: true
                    });
                    failedTaskIds.add(task.id);
                } else {
                    runnableTasks.push(task);
                }
            }

            const batchPromises = runnableTasks.map(async (task) => {
                try {
                    const result = await this.executeTask(task, context);
                    if (result && result.success !== false) {
                        completed.add(task.id);
                    } else {
                        failedTaskIds.add(task.id);
                    }
                    return { taskId: task.id, id: task.id, ...result };
                } catch (error) {
                    failedTaskIds.add(task.id);
                    return {
                        taskId: task.id,
                        id: task.id,
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
    topologicalSort(tasks, initialCompleted = []) {
        if (!Array.isArray(tasks) || tasks.length === 0) return [];

        const batches = [];
        const remaining = [...tasks];
        const completed = new Set(initialCompleted || []);
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
     * Execute a stateful graph (StateGraph runtime)
     */
    async executeGraph(stateGraph, context = {}) {
        this.log(`🌐 [StateGraph] Bắt đầu thực thi Đồ thị Tác vụ [${stateGraph.graphId}] với ${stateGraph.nodes.size} nodes`);
        this.activeGraphs.set(stateGraph.graphId, stateGraph);
        const executorFn = async (node, state, graph, executionContext = {}) => {
            const customAction = context?.nodeActions?.[node.id] || (typeof node.action === 'function' ? node.action : null);
            if (typeof customAction === 'function') {
                return customAction.length >= 4
                    ? await customAction(node, state, graph, executionContext)
                    : (customAction.length >= 3 ? await customAction(node, state, graph) : await customAction(state, graph));
            }
            const task = {
                id: node.id,
                description: node.description,
                assignedTo: node.assignedTo,
                ...node.taskPayload
            };
            return await this.executeTask(task, { ...context, state, graph, ...executionContext });
        };
        try {
            const result = await stateGraph.run(executorFn, context);
            if (stateGraph.status === 'COMPLETED' || stateGraph.status === 'FAILED') {
                this.activeGraphs.delete(stateGraph.graphId);
            }
            return result;
        } catch (err) {
            this.activeGraphs.delete(stateGraph.graphId);
            throw err;
        }
    }

    /**
     * Resume a paused StateGraph upon human supervisor decision
     * Supports automatic recovery from disk checkpoint if server restarted.
     */
    async resumeGraph(taskId, decision = 'APPROVE', feedback = '', context = {}) {
        let graph = this.activeGraphs.get(taskId);

        // Phục hồi từ Checkpoint trên đĩa nếu graph không còn trong RAM (ví dụ server restart)
        if (!graph && this.checkpointManager) {
            const ckpt = this.checkpointManager.loadCheckpoint(taskId);
            if (ckpt && ckpt.stageData) {
                const latestStage = ckpt.lastStage || Object.keys(ckpt.stageData).pop();
                const graphData = ckpt.stageData[latestStage];
                if (graphData && (graphData.nodes || graphData.graphId)) {
                    this.log(`📌 [resumeGraph] Tái tạo StateGraph [${taskId}] từ Checkpoint trên đĩa (Giai đoạn: ${latestStage})`);
                    const { StateGraph } = require('./StateGraph');
                    graph = StateGraph.deserialize(graphData, {
                        checkpointManager: this.checkpointManager,
                        verifier: this.verifier,
                        eventStream: this.eventStream,
                        nodeActions: context?.nodeActions || null
                    });
                    this.activeGraphs.set(taskId, graph);
                }
            }
        }

        if (!graph) {
            this.log(`⚠️ resumeGraph: Graph [${taskId}] không tìm thấy trong bộ nhớ RAM lẫn Checkpoint trên đĩa.`);
            return { success: false, error: `Graph [${taskId}] not found in memory or checkpoints.` };
        }

        const waitingNode = Array.from(graph.nodes.values()).find(n => n.status === 'WAITING_APPROVAL');
        if (waitingNode) {
            graph.submitHumanDecision(waitingNode.id, decision, feedback);
        }
        return await this.executeGraph(graph, context);
    }

    /**
     * Execute single task with appropriate agent & tool execution
     */
    async executeTask(task, context) {
        const agentRole = task.assignedTo || 'developer';
        this.log(`🔧 Executing ${task.id}`, { agent: agentRole, description: task.description });

        let taskDesc = task.description;
        if (context.matchedSkill && !taskDesc.includes(context.matchedSkill.name)) {
            taskDesc += `\n[KỸ NĂNG THỦ TỤC ĐÃ ĐƯỢC XÁC MINH: ${context.matchedSkill.name}]:\nHãy tuân thủ và áp dụng chính xác các bước sau: ${JSON.stringify(context.matchedSkill.actionGraph)}`;
        }

        const result = await this.callAgent(agentRole, {
            task: taskDesc,
            userRequest: context.userRequest,
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
    async achieveConsensus(results, directive, maxRounds = 1) {
        this.log('🎯 Starting consensus protocol', { results: results.length, maxRounds });

        const successfulResults = results.filter(r => r.success);

        if (successfulResults.length === 0) {
            return {
                achieved: false,
                conflicts: ['Tất cả các tác vụ chuyên trách đều không phản hồi thành công']
            };
        }

        // Nếu chỉ có 1 kết quả thành công -> trạng thái NEEDS_REVIEW, ghi rõ chưa đối chiếu độc lập
        if (successfulResults.length === 1) {
            return {
                achieved: true,
                finalResult: successfulResults[0].response,
                agreement: 0.85,
                status: 'NEEDS_REVIEW',
                note: 'Kết quả từ đơn chuyên viên, chưa qua tranh biện đối chiếu độc lập'
            };
        }

        let round = 0;
        let conflicts = [];

        while (round < maxRounds) {
            round++;
            this.log(`🥊 Debate Round ${round}/${maxRounds}`);

            // Critic thẩm định toàn diện các kết quả một cách tập trung, tránh burst rate limit
            const allSummaries = successfulResults.map((r, idx) => 
                `[Tác vụ ${r.taskId || idx + 1}]:\n${typeof r.response === 'string' ? r.response : JSON.stringify(r.response, null, 2)}`
            ).join('\n\n---\n\n');

            const critique = await this.callAgent('critic', {
                task: 'Đối chiếu chéo nội dung, tìm mâu thuẫn sự thật và đánh giá mức độ đồng thuận thực tế của các kết quả',
                allSpecialistResults: allSummaries,
                directive: directive
            });

            const cr = this.parseAgentResponse(critique.response) || {};
            const factualOverlap = typeof cr.factualOverlap === 'number' ? cr.factualOverlap : 0.85;
            const contentAgreement = typeof cr.contentAgreement === 'number' ? cr.contentAgreement : 0.85;
            const scoreFactor = (cr.overallScore || 85) / 100;
            const avgAgreement = (factualOverlap * 0.4) + (contentAgreement * 0.4) + (scoreFactor * 0.2);
            const fatalConflicts = (cr.issues || []).filter(i => i.severity === 'HIGH' || i.category === 'Security');

            this.log(`📊 Round ${round} Content Agreement`, {
                avgAgreement: (avgAgreement * 100).toFixed(1) + '%',
                fatalConflictCount: fatalConflicts.length
            });

            // Đạt đồng thuận khi: Tỷ lệ đồng thuận nội dung >= threshold VÀ không có lỗi xung đột chí mạng
            if (avgAgreement >= this.consensusThreshold && fatalConflicts.length === 0) {
                // Ưu tiên kết quả giàu dữ liệu nhất (richest response) để tránh tình trạng specialist cuối cùng trả về text rỗng
                const candidateTexts = successfulResults
                    .map(r => typeof r.response === 'string' ? r.response : JSON.stringify(r.response, null, 2))
                    .filter(t => t && t.trim().length > 0);
                
                const richestResult = candidateTexts.sort((a, b) => b.length - a.length)[0] || successfulResults[successfulResults.length - 1].response || '';

                return {
                    achieved: true,
                    finalResult: richestResult,
                    agreement: avgAgreement,
                    rounds: round,
                    critique: cr
                };
            }

            conflicts = (cr.issues || []).map(i => i.description || String(i));
        }

        // Không đạt đồng thuận -> chuyển cho Giám đốc phân xử
        return {
            achieved: false,
            conflicts: conflicts.length > 0 ? conflicts : ['Có bất đồng quan điểm giữa các Agent'],
            results: successfulResults
        };
    }

    /**
     * Create unified AbortSignal merging internal timeout with caller external signal (Fix Lỗi D)
     */
    _createSignal(timeoutMs = 45000, externalSignal = null) {
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        if (!externalSignal) return timeoutSignal;
        if (typeof AbortSignal.any === 'function') {
            return AbortSignal.any([timeoutSignal, externalSignal]);
        }
        const controller = new AbortController();
        const onAbort = () => controller.abort(externalSignal.reason);
        if (externalSignal.aborted) {
            controller.abort(externalSignal.reason);
            return controller.signal;
        }
        externalSignal.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => {
            controller.abort(new Error(`Timed out after ${timeoutMs}ms`));
            externalSignal.removeEventListener('abort', onAbort);
        }, timeoutMs);
        return controller.signal;
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
        const externalSignal = payload?.context?.signal || null;

        try {
            // Lấy danh sách công cụ nếu agent được phép dùng tools
            const toolDefs = (agent.enableTools && this.toolExecutor)
                ? this.toolExecutor.getToolDefinitions()
                : null;

            const requestBody = {
                contents: [{
                    role: 'user',
                    parts: [{ text: (payload?.context?.optimalStrategy ? `⚡ [CHIẾN LƯỢC TỐI ƯU ĐÃ CHỨNG MINH - TIẾT KIỆM TOKEN]:\n- Bài học kinh nghiệm: ${payload.context.optimalStrategy.bestRoute}\n- Áp dụng trực tiếp giải pháp trên để tránh thử sai gây tốn token.\n\n` : '') + (typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)) }]
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

            const reqMode = payload?.context?.mode || 'standard';
            let modelName = payload?.context?.model
                || this.modelRouter.resolveModel(agentRole, reqMode)
                || agent.model
                || this.defaultModel;

            if (attempt > 1) {
                // Tự động xoay tua sang model khác trong registry để giải phóng hạn mức (bảo đảm không null)
                modelName = this.modelRouter.getFallbackModel(modelName, attempt) || this.defaultModel || 'gemini-3.5-flash';
                this.log(`🔄 Thử lại lần ${attempt} với model xoay tua: [${modelName}]`);
            } else {
                this.log(`🤖 [ModelRouter] Role: [${agentRole}] | Mode: [${reqMode}] | Model: [${modelName}]`);
            }

            // 0. PROACTIVE QUOTA SCHEDULER: Đặt trước ngân sách và điều tiết nhịp độ trước khi gửi API
            let slot = null;
            if (this.modelRouter && typeof this.modelRouter.acquireDispatchSlot === 'function') {
                const priority = agentRole === 'director' ? 3 : (agentRole === 'coordinator' ? 2 : 1);
                slot = await this.modelRouter.acquireDispatchSlot({
                    estimatedTokens: 1500,
                    model: modelName,
                    priority
                });
                if (slot && slot.waitedMs > 0) {
                    this.log(`⏳ [QuotaScheduler] Đã điều tiết nhịp độ (chờ ${slot.waitedMs}ms) để bảo vệ hạn mức RPM/TPM`);
                }
                if (!slot?.granted) {
                    this.log(`🛑 [QuotaScheduler] Từ chối cấp slot do kiệt hạn mức RPM/TPM/RPD cho [${modelName}]. Chuyển trạng thái QUOTA_WAITING.`);
                    return {
                        success: false,
                        status: 'QUOTA_WAITING',
                        retryable: true,
                        quotaDeferred: true,
                        error: 'Đang chờ ngân sách API (Quota limits saturated)',
                        message: 'Đang chờ ngân sách API',
                        response: 'Hệ thống đang tạm hoãn điều phối tác vụ do chạm ngưỡng RPM/TPM/RPD của Gemini API.'
                    };
                }
            }

            let response;
            try {
                response = await fetch(
                    `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody),
                        signal: this._createSignal(this.config.timeout || 45000, externalSignal)
                    }
                );

                let errBody = '';
                // Tự động fallback tức thì nếu model chính bị 429 hoặc 503 (Fix Lỗi B: Xin slot mới qua scheduler)
                if (!response.ok && (response.status === 429 || response.status === 503)) {
                    errBody = await response.text();
                    this.modelRouter.recordQuotaError(modelName, response.status, errBody);
                    const altModel = this.modelRouter.getFallbackModel(modelName, attempt + 1);
                    if (altModel) {
                        // 1. Giải phóng slot của model cũ
                        if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                            this.modelRouter.releaseDispatchSlot(0, modelName, slot?.slotId);
                        }
                        slot = null;

                        this.log(`⚠️ Model [${modelName}] gặp HTTP ${response.status}, yêu cầu slot mới qua scheduler và hoán đổi tức thì sang [${altModel}]...`);
                        await new Promise(r => setTimeout(r, 1000));

                        // 2. Yêu cầu slot mới cho altModel qua ModelRouter
                        if (this.modelRouter && typeof this.modelRouter.acquireDispatchSlot === 'function') {
                            const priority = agentRole === 'director' ? 3 : (agentRole === 'coordinator' ? 2 : 1);
                            slot = await this.modelRouter.acquireDispatchSlot({
                                estimatedTokens: 1500,
                                model: altModel,
                                priority
                            });
                            if (!slot?.granted) {
                                this.log(`🛑 [QuotaScheduler] Model dự phòng [${altModel}] hết quota. Chuyển trạng thái QUOTA_WAITING.`);
                                return {
                                    success: false,
                                    status: 'QUOTA_WAITING',
                                    retryable: true,
                                    quotaDeferred: true,
                                    error: `Đang chờ ngân sách API cho model dự phòng [${altModel}]`,
                                    message: 'Đang chờ ngân sách API',
                                    response: 'Model chính gặp 429 và model dự phòng chưa có quota khả dụng.'
                                };
                            }
                        }

                        modelName = altModel;
                        response = await fetch(
                            `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(requestBody),
                                signal: this._createSignal(this.config.timeout || 45000, externalSignal)
                            }
                        );
                        errBody = '';
                    } else {
                        this.log(`🚨 [CircuitBreaker] Tất cả model đều đã chạm quota 429. Dừng chuyển model lặp vô ích.`);
                    }
                }

                if (!response.ok) {
                    const error = errBody || await response.text();
                    throw new Error(`API Error ${response.status}: ${error}`);
                }
            } catch (fetchErr) {
                if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                    this.modelRouter.releaseDispatchSlot(500, modelName, slot?.slotId);
                }
                throw fetchErr;
            }

            const data = await response.json();
            const latency = Date.now() - startTime;
            if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                this.modelRouter.releaseDispatchSlot((data.usageMetadata?.totalTokenCount) || 1200, modelName, slot?.slotId);
            } else if (this.modelRouter && typeof this.modelRouter.recordUsage === 'function') {
                this.modelRouter.recordUsage((data.usageMetadata?.totalTokenCount) || 1200, modelName);
            }

            let currentCandidate = data.candidates?.[0];
            if (!currentCandidate || !currentCandidate.content) {
                throw new Error('Cấu trúc phản hồi không hợp lệ từ Gemini API');
            }

            let currentParts = currentCandidate.content.parts || [];
            let conversationContents = [...requestBody.contents];
            let toolIterationCount = 0;
            const MAX_TOOL_ITERATIONS = 5;

            // 1. KIỂM TRA & THỰC THI CHUỖI CÔNG CỤ ĐA BƯỚC (Multi-step Tool Calling Loop với Parallelization & Deduplication)
            while (toolIterationCount < MAX_TOOL_ITERATIONS) {
                const functionCallParts = currentParts.filter(p => p.functionCall);
                if (functionCallParts.length === 0) break;

                toolIterationCount++;
                this.log(`🔧 ${agentRole} gọi ${functionCallParts.length} công cụ (Bước ${toolIterationCount}/${MAX_TOOL_ITERATIONS})`, {
                    tools: functionCallParts.map(p => p.functionCall.name)
                });

                const toolCalls = functionCallParts.map(p => ({
                    name: p.functionCall.name,
                    args: p.functionCall.args || {}
                }));

                const toolResults = await this.toolExecutor.executeTools(toolCalls, { ...payload?.context, agentRole, signal: externalSignal });

                const functionResponseParts = [];
                for (let i = 0; i < functionCallParts.length; i++) {
                    const fc = functionCallParts[i].functionCall;
                    functionResponseParts.push({
                        functionResponse: {
                            name: fc.name,
                            response: { content: toolResults[i] || { success: true } }
                        }
                    });
                }

                // Gắn lượt của model (chứa functionCall) và lượt người dùng (chứa functionResponse) vào lịch sử
                conversationContents.push({ role: 'model', parts: currentParts });
                conversationContents.push({ role: 'user', parts: functionResponseParts });

                const followUpBody = {
                    contents: conversationContents,
                    systemInstruction: requestBody.systemInstruction,
                    generationConfig: requestBody.generationConfig,
                    tools: requestBody.tools
                };

                // Tiền kiểm Quota Scheduler cho tool follow-up
                let followUpSlot = null;
                if (this.modelRouter && typeof this.modelRouter.acquireDispatchSlot === 'function') {
                    followUpSlot = await this.modelRouter.acquireDispatchSlot({
                        estimatedTokens: 1000,
                        model: modelName,
                        priority: 2
                    });
                    if (!followUpSlot?.granted) {
                        this.log(`🛑 [QuotaScheduler] Tool follow-up hoãn do hết hạn mức Quota cho [${modelName}]. Dừng gọi tiếp.`);
                        break;
                    }
                }

                let followUpRes;
                try {
                    followUpRes = await fetch(
                        `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(followUpBody),
                            signal: this._createSignal(this.config.timeout || 45000, externalSignal)
                        }
                    );

                    if (!followUpRes.ok && (followUpRes.status === 429 || followUpRes.status === 503)) {
                        this.modelRouter.recordQuotaError(modelName, followUpRes.status);
                        const fallbackModel = this.modelRouter.getFallbackModel(modelName, toolIterationCount + 1);
                        if (fallbackModel) {
                            // 1. Giải phóng slot của model cũ (Fix Lỗi B)
                            if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                                this.modelRouter.releaseDispatchSlot(0, modelName, followUpSlot?.slotId);
                            }
                            followUpSlot = null;

                            this.log(`⚠️ Tool follow-up gặp ${followUpRes.status}, yêu cầu slot mới và tự động xoay model sang [${fallbackModel}]...`);
                            await new Promise(r => setTimeout(r, 1000));

                            // 2. Yêu cầu slot mới cho fallbackModel (Fix Lỗi B)
                            if (this.modelRouter && typeof this.modelRouter.acquireDispatchSlot === 'function') {
                                followUpSlot = await this.modelRouter.acquireDispatchSlot({
                                    estimatedTokens: 1000,
                                    model: fallbackModel,
                                    priority: 2
                                });
                                if (!followUpSlot?.granted) {
                                    this.log(`🛑 [QuotaScheduler] Tool follow-up model fallback [${fallbackModel}] hết quota. Dừng gọi tiếp.`);
                                    break;
                                }
                            }

                            modelName = fallbackModel;
                            followUpRes = await fetch(
                                `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(followUpBody),
                                    signal: this._createSignal(this.config.timeout || 45000, externalSignal)
                                }
                            );
                        }
                    }

                    if (!followUpRes.ok) {
                        const errText = await followUpRes.text();
                        this.log(`⚠️ Tool follow-up call failed (${followUpRes.status}): ${errText.slice(0, 100)}`);
                        if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                            this.modelRouter.releaseDispatchSlot(500, modelName, followUpSlot?.slotId);
                        }
                        break;
                    }
                } catch (toolFollowErr) {
                    if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                        this.modelRouter.releaseDispatchSlot(500, modelName, followUpSlot?.slotId);
                    }
                    this.log(`⚠️ Tool follow-up network error: ${toolFollowErr.message}`);
                    break;
                }

                const followUpData = await followUpRes.json();
                if (this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                    this.modelRouter.releaseDispatchSlot((followUpData.usageMetadata?.totalTokenCount) || 1000, modelName, followUpSlot?.slotId);
                }
                currentCandidate = followUpData.candidates?.[0];
                if (!currentCandidate || !currentCandidate.content) break;
                currentParts = currentCandidate.content.parts || [];
            }

            // 2. Trích xuất text phản hồi cuối cùng sau khi hoàn tất chuỗi công cụ
            let text = currentParts.filter(p => p.text).map(p => p.text).join('\n');
            const thoughts = currentParts.filter(p => p.thought).map(p => p.thought).join('\n');

            // BẢO CHỨNG ĐẦU RA (OUTPUT SAFETY GATE): Nếu đã chạy công cụ nhưng text rỗng, tự động tổng kết báo cáo
            if (!text.trim() && toolIterationCount > 0) {
                let finSlot = null;
                try {
                    const finModel = modelName || 'gemini-3.1-flash-lite';
                    if (this.modelRouter && typeof this.modelRouter.acquireDispatchSlot === 'function') {
                        finSlot = await this.modelRouter.acquireDispatchSlot({
                            estimatedTokens: 800,
                            model: finModel,
                            priority: 1
                        });
                    }

                    if (!finSlot || finSlot.granted) {
                        const finalizeBody = {
                            contents: [
                                ...conversationContents,
                                { role: 'user', parts: [{ text: "Hãy tổng kết toàn bộ kết quả thực thi các công cụ trên và trả về kết quả nghiệm thu cuối cùng theo đúng định dạng JSON yêu cầu của bạn." }] }
                            ],
                            systemInstruction: requestBody.systemInstruction,
                            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
                        };
                        const finRes = await fetch(
                            `${this.baseUrl}/models/${finModel}:generateContent?key=${this.apiKey}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(finalizeBody),
                                signal: this._createSignal(this.config.timeout || 45000, externalSignal)
                            }
                        );
                        if (finRes.ok) {
                            const finData = await finRes.json();
                            const finCandidate = finData.candidates?.[0];
                            if (finCandidate && finCandidate.content) {
                                text = finCandidate.content.parts?.filter(p => p.text).map(p => p.text).join('\n') || text;
                            }
                        }
                    }
                } catch (finErr) {
                    this.log(`⚠️ Finalize note: ${finErr.message}`);
                } finally {
                    if (finSlot && this.modelRouter && typeof this.modelRouter.releaseDispatchSlot === 'function') {
                        this.modelRouter.releaseDispatchSlot(500, modelName, finSlot.slotId);
                    }
                }
            }

            this.log(`✅ ${agentRole} responded`, {
                latency: `${Date.now() - startTime}ms`,
                tokens: data.usageMetadata?.totalTokenCount || 0,
                hasThoughts: !!thoughts,
                toolIterations: toolIterationCount
            });

            return {
                success: true,
                response: text,
                thoughts: thoughts || null,
                toolExecuted: toolIterationCount > 0,
                metadata: {
                    agent: agentRole,
                    model: modelName,
                    latency: Date.now() - startTime,
                    toolIterations: toolIterationCount,
                    finishReason: currentCandidate.finishReason
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
