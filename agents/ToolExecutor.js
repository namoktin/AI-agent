/**
 * 🔧 PARALLEL TOOL EXECUTOR
 *
 * Executes tools in parallel where safe, with:
 * - Dependency resolution
 * - Conflict detection
 * - Resource pooling
 * - Automatic retry
 */

const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const { MCPClientManager } = require('./MCPClientManager');

// Ưu tiên native fetch nếu có
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const requestOptions = {
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.signal?._timeout || 180000
        };

        const req = client.request(url, requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: async () => JSON.parse(data),
                    text: async () => data
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

class ToolExecutor {
    constructor(serverUrl = 'http://localhost:3000') {
        this.serverUrl = serverUrl;
        this.executionCache = new Map();
        this.rateLimiter = new Map();
        
        // MCP Ecosystem integration
        try {
            this.mcpClientManager = new MCPClientManager();
        } catch (e) {
            this.mcpClientManager = null;
        }

        // Tool safety classification - strictly mutually exclusive
        this.toolCategories = {
            // Read-only tools - safe for parallel execution
            readonly: [
                'READ_FILE',
                'LIST_FILES',
                'WEB_SEARCH',
                'SEARCH',
                'ACADEMIC_SEARCH',
                'SEARCH_EXPERIENCE',
                'SEARCH_EXPERIENCES',
                'READ_URL',
                'FETCH_WEBPAGE',
                'VERIFY_SOURCE',
                'CHECK_COOKIE_STATUS'
            ],
            // Write tools - must be sequential to avoid conflicts
            write: [
                'WRITE_FILE',
                'SAVE_FILE',
                'SAVE_EXPERIENCE',
                'UPDATE_EXPERIENCE',
                'DELETE_FILE',
                'RUN_CODE',
                'RUN_CMD',
                'SAVE_COOKIE'
            ],
            // Heavy tools - rate limited (Puppeteer browser, image generation)
            heavy: [
                'BROWSE_WEB',
                'BROWSER_ACTION',
                'GENERATE_IMAGE',
                'DOWNLOAD_VIDEO'
            ]
        };
    }

    /**
     * Execute multiple tool calls with intelligent parallelization and strict deduplication
     */
    async executeTools(toolCalls, context = {}) {
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
            return [];
        }

        // Classify each tool call into strictly ONE category (no duplicate execution)
        const readonly = [];
        const heavy = [];
        const writes = [];
        const others = [];

        for (const tool of toolCalls) {
            if (this.isWrite(tool.name)) {
                writes.push(tool);
            } else if (this.isHeavy(tool.name)) {
                heavy.push(tool);
            } else if (this.isReadOnly(tool.name)) {
                readonly.push(tool);
            } else {
                others.push(tool);
            }
        }

        const results = [];

        // PHASE 1: Execute all read-only tools and other queries in parallel
        const fastParallel = [...readonly, ...others];
        if (fastParallel.length > 0) {
            console.log(`⚡ Executing ${fastParallel.length} fast tools in parallel (read-only/query)`);
            const readResults = await Promise.allSettled(
                fastParallel.map(tool => this.executeSingleTool(tool, context))
            );
            results.push(...this.unwrapSettled(readResults));
        }

        // PHASE 2: Execute heavy tools with rate limiting (parallel but throttled)
        if (heavy.length > 0) {
            console.log(`🔥 Executing ${heavy.length} heavy tools with rate limiting`);
            const heavyResults = await this.executeWithRateLimit(heavy, context);
            results.push(...heavyResults);
        }

        // PHASE 3: Execute write tools sequentially to avoid conflicts
        if (writes.length > 0) {
            console.log(`📝 Executing ${writes.length} write tools sequentially`);
            for (const tool of writes) {
                const result = await this.executeSingleTool(tool, context);
                results.push(result);
            }
        }

        return results;
    }

    /**
     * Invalidate all file-related caches when files are written, modified, or executed
     */
    invalidateFileCache() {
        for (const key of this.executionCache.keys()) {
            if (key.startsWith('LIST_FILES:') || key.startsWith('READ_FILE:')) {
                this.executionCache.delete(key);
            }
        }
    }

    /**
     * Execute single tool with caching and retry
     */
    async executeSingleTool(tool, context = {}, attempt = 1) {
        const { name, args } = tool;

        // Bỏ qua cache hoàn toàn nếu:
        // 1. Agent là Critic (Quality Gate bắt buộc phải kiểm tra dữ liệu sống trên đĩa)
        // 2. Tool là LIST_FILES (thư mục luôn thay đổi khi Agent tạo/xóa file)
        // 3. context yêu cầu noCache
        const isCritic = context.agentRole === 'critic' || context.agent === 'critic';
        const shouldBypassCache = isCritic || context.noCache === true || name === 'LIST_FILES';

        // Check cache for idempotent operations
        if (!shouldBypassCache && this.isReadOnly(name)) {
            const cacheKey = this.getCacheKey(name, args);
            if (this.executionCache.has(cacheKey)) {
                console.log(`💾 Cache hit for ${name}`);
                const cachedResult = this.executionCache.get(cacheKey);
                return {
                    tool: name,
                    success: true,
                    result: cachedResult,
                    cached: true,
                    attempt: attempt
                };
            }
        }

        try {
            const result = await this.callToolAPI(name, args, context);

            // Khi có thao tác ghi hoặc chạy lệnh (WRITE_FILE, RUN_CMD, RUN_CODE, DELETE_FILE),
            // bắt buộc xóa sạch cache file để Critic và các bước sau luôn thấy dữ liệu mới nhất
            if (this.isWrite(name)) {
                this.invalidateFileCache();
            }

            // Cache successful read-only results (ngoại trừ LIST_FILES)
            if (!shouldBypassCache && this.isReadOnly(name) && name !== 'LIST_FILES' && result && result.success) {
                const cacheKey = this.getCacheKey(name, args);
                this.executionCache.set(cacheKey, result);

                // Expire cache after 2 minutes
                setTimeout(() => this.executionCache.delete(cacheKey), 120000);
            }

            return {
                tool: name,
                success: true,
                result: result,
                attempt: attempt
            };

        } catch (error) {
            console.error(`❌ Tool ${name} failed (attempt ${attempt}):`, error.message);

            // Retry logic for transient failures
            if (attempt < 3 && this.isRetryable(error)) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
                return await this.executeSingleTool(tool, context, attempt + 1);
            }

            return {
                tool: name,
                success: false,
                error: error.message,
                attempt: attempt
            };
        }
    }

    /**
     * Execute tools with rate limiting
     */
    async executeWithRateLimit(tools, context, limit = 3) {
        const results = [];
        const queue = [...tools];

        while (queue.length > 0) {
            const batch = queue.splice(0, limit);
            const batchResults = await Promise.allSettled(
                batch.map(tool => this.executeSingleTool(tool, context))
            );
            results.push(...this.unwrapSettled(batchResults));

            // Rate limit delay
            if (queue.length > 0) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        return results;
    }

    /**
     * Call tool API endpoint
     */
    async callToolAPI(toolName, args, context) {
        // Handle MCP tools via MCPClientManager
        if (this.mcpClientManager && this.mcpClientManager.isMCPTool(toolName)) {
            return await this.mcpClientManager.executeTool(toolName, args);
        }

        const endpoint = this.getToolEndpoint(toolName);

        const reqSignal = context?.signal
            ? (typeof AbortSignal.any === 'function'
                ? AbortSignal.any([AbortSignal.timeout(600000), context.signal])
                : context.signal)
            : AbortSignal.timeout(600000);

        const response = await fetch(`${this.serverUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': context.authToken ? `Bearer ${context.authToken}` : ''
            },
            body: JSON.stringify(args),
            signal: reqSignal
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`${toolName} API error (${response.status}): ${error}`);
        }

        return await response.json();
    }

    /**
     * Map tool names to API endpoints
     */
    getToolEndpoint(toolName) {
        const mapping = {
            'READ_FILE': '/api/read-file',
            'WRITE_FILE': '/api/save-file',
            'SAVE_FILE': '/api/save-file',
            'LIST_FILES': '/api/list-files',
            'DELETE_FILE': '/api/delete-file',
            'WEB_SEARCH': '/api/search',
            'SEARCH': '/api/search',
            'ACADEMIC_SEARCH': '/api/academic/search',
            'READ_URL': '/api/fetch-webpage',
            'FETCH_WEBPAGE': '/api/fetch-webpage',
            'BROWSE_WEB': '/api/browse-web',
            'SCRAPE_SOCIAL_MEDIA': '/api/scrape-social',
            'DOWNLOAD_VIDEO': '/api/download-video',
            'BROWSER_ACTION': '/api/browse-web',
            'SEARCH_EXPERIENCE': '/api/search-experiences',
            'SEARCH_EXPERIENCES': '/api/search-experiences',
            'SAVE_EXPERIENCE': '/api/save-experience',
            'UPDATE_EXPERIENCE': '/api/update-experience',
            'RUN_CODE': '/api/run-code',
            'RUN_CMD': '/api/run-cmd',
            'GENERATE_IMAGE': '/api/generate-image',
            'START_BACKGROUND_TASK': '/api/tasks/start-task',
            'START_BACKGROUND_SHORTS_TASK': '/api/tasks/start-shorts-job',
            'MANAGE_BACKGROUND_TASK': '/api/tasks/manage-task'
        };

        return mapping[toolName] || `/api/${toolName.toLowerCase().replace(/_/g, '-')}`;
    }

    /**
     * Get Google Gemini Function Declarations for all available tools
     */
    getToolDefinitions() {
        const nativeTools = [
            {
                name: 'READ_FILE',
                description: 'Đọc nội dung của một file trong dự án hoặc thư mục làm việc.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        filePath: {
                            type: 'STRING',
                            description: 'Đường dẫn tương đối hoặc tuyệt đối tới file cần đọc'
                        }
                    },
                    required: ['filePath']
                }
            },
            {
                name: 'WRITE_FILE',
                description: 'Lưu hoặc tạo mới một file với nội dung cụ thể.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        filePath: {
                            type: 'STRING',
                            description: 'Đường dẫn file cần lưu (ví dụ: "src/app.js" hoặc "report.md")'
                        },
                        content: {
                            type: 'STRING',
                            description: 'Toàn bộ nội dung cần ghi vào file'
                        }
                    },
                    required: ['filePath', 'content']
                }
            },
            {
                name: 'LIST_FILES',
                description: 'Liệt kê danh sách các file và thư mục trong dự án.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        dirPath: {
                            type: 'STRING',
                            description: 'Thư mục cần quét (mặc định: ".")'
                        },
                        recursive: {
                            type: 'BOOLEAN',
                            description: 'Có quét đệ quy các thư mục con không'
                        }
                    }
                }
            },
            {
                name: 'WEB_SEARCH',
                description: 'Tìm kiếm thông tin đa nguồn trên Internet (Dev.to, Wikipedia, Tin tức công nghệ).',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: {
                            type: 'STRING',
                            description: 'Từ khóa tìm kiếm'
                        },
                        limit: {
                            type: 'NUMBER',
                            description: 'Số lượng kết quả tối đa cần lấy (mặc định: 6)'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'ACADEMIC_SEARCH',
                description: 'Tra cứu bài báo nghiên cứu khoa học trên PubMed, Crossref, Europe PMC, OpenAlex.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: {
                            type: 'STRING',
                            description: 'Từ khóa học thuật hoặc tên bài báo/tác giả'
                        },
                        limit: {
                            type: 'NUMBER',
                            description: 'Số lượng tài liệu cần lấy (mặc định: 6)'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'READ_URL',
                description: 'Đọc và trích xuất nội dung toàn văn từ một đường link web cụ thể.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        url: {
                            type: 'STRING',
                            description: 'Đường dẫn website cần đọc (bắt đầu bằng https://)'
                        }
                    },
                    required: ['url']
                }
            },
            {
                name: 'DOWNLOAD_VIDEO',
                description: 'Tải video trực tiếp từ các nền tảng mạng xã hội (Facebook Reels, TikTok, YouTube...). Tự động áp dụng CookieVault Facebook và lưu file .mp4 vào thư mục gemini hôm nay.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        url: {
                            type: 'STRING',
                            description: 'Đường dẫn URL của video hoặc Reel cần tải'
                        },
                        outputFileName: {
                            type: 'STRING',
                            description: 'Tên file mp4 mong muốn lưu (ví dụ: reel_download.mp4, hoặc để trống)'
                        }
                    },
                    required: ['url']
                }
            },
            {
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
            {
                name: 'BROWSE_WEB',
                description: 'Trình duyệt web thông minh tự động (Puppeteer Stealth): mở Chrome, tương tác giao diện trực tiếp tuần tự (click, type, press, scroll, wait, extract), trích xuất Accessibility Tree siêu tinh gọn (100-300 tokens) hoặc trích xuất từ ngữ/văn bản theo mốc từ khóa.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        url: {
                            type: 'STRING',
                            description: 'Đường dẫn website cần truy cập (bắt đầu bằng https://)'
                        },
                        action: {
                            type: 'STRING',
                            description: 'Hành động chính: read (đọc nội dung), screenshot (chụp ảnh màn hình), accessibility_snapshot (lấy cây trợ năng siêu rút gọn)'
                        },
                        actions: {
                            type: 'ARRAY',
                            description: 'Danh sách các thao tác tương tác giao diện tuần tự trên web (click nút/link, nhập form, chờ dữ liệu, trích xuất text)',
                            items: {
                                type: 'OBJECT',
                                properties: {
                                    type: {
                                        type: 'STRING',
                                        description: 'Loại thao tác: click, type, press, wait, scroll, extract'
                                    },
                                    selector: {
                                        type: 'STRING',
                                        description: 'CSS selector của phần tử (ví dụ: a[href*="/gift"], button.btn-download)'
                                    },
                                    text: {
                                        type: 'STRING',
                                        description: 'Nội dung chữ của nút/link cần click (ví dụ: "GIFT CARDS", "More ways to gift") hoặc chữ cần gõ nếu type=type'
                                    },
                                    key: {
                                        type: 'STRING',
                                        description: 'Phím cần gõ nếu type=press (ví dụ: "Enter", "Tab")'
                                    },
                                    findAfter: {
                                        type: 'STRING',
                                        description: 'Nếu type=extract: chuỗi mốc cần tìm để bóc tách đoạn văn hoặc từ ngữ ngay phía sau nó (ví dụ: "Amazon")'
                                    },
                                    waitMs: {
                                        type: 'NUMBER',
                                        description: 'Thời gian chờ (mili-giây) sau thao tác (mặc định 2000ms)'
                                    },
                                    distance: {
                                        type: 'NUMBER',
                                        description: 'Khoảng cách cuộn trang (pixels) nếu type=scroll'
                                    }
                                }
                            }
                        },
                        findAfter: {
                            type: 'STRING',
                            description: 'Chuỗi mốc cần tìm trên trang đích để tự động trích xuất các từ/đoạn văn bản ngay phía sau nó (ví dụ: "Amazon")'
                        },
                        includeSnapshot: {
                            type: 'BOOLEAN',
                            description: 'Nếu true, tự động trả về Accessibility Tree dạng YAML siêu rút gọn (tiết kiệm token)'
                        }
                    },
                    required: ['url']
                }
            },
            {
                name: 'BROWSER_ACTION',
                description: 'Thao tác trình duyệt ảo tương tác trực tiếp (Method 2: Accessibility Tree & Action Chaining): điều hướng, click nút/link theo chữ, cuộn trang, bóc tách từ ngữ sau từ khóa.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        url: {
                            type: 'STRING',
                            description: 'Đường dẫn website ban đầu'
                        },
                        actions: {
                            type: 'ARRAY',
                            description: 'Chuỗi thao tác giao diện tuần tự (click, scroll, wait, extract)',
                            items: {
                                type: 'OBJECT',
                                properties: {
                                    type: { type: 'STRING', description: 'click | type | scroll | wait | extract' },
                                    selector: { type: 'STRING', description: 'CSS selector (tùy chọn)' },
                                    text: { type: 'STRING', description: 'Chữ hiển thị trên nút/link cần click hoặc chữ cần nhập' },
                                    findAfter: { type: 'STRING', description: 'Từ khóa mốc cần lấy nội dung phía sau' },
                                    waitMs: { type: 'NUMBER', description: 'Thời gian chờ (ms)' },
                                    distance: { type: 'NUMBER', description: 'Khoảng cách cuộn (px)' }
                                }
                            }
                        },
                        findAfter: {
                            type: 'STRING',
                            description: 'Từ khóa mốc trên trang để lấy từ/đoạn văn bản ngay phía sau'
                        },
                        includeSnapshot: {
                            type: 'BOOLEAN',
                            description: 'Lấy cây Accessibility Tree rút gọn'
                        }
                    },
                    required: ['url']
                }
            },
            {
                name: 'RUN_CMD',
                description: 'Thực thi lệnh hệ thống an toàn (node, python, npm, git, yt-dlp, dir...). Dùng để chạy script Python, tải video media bằng yt-dlp, cài gói hoặc kiểm thử.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        command: {
                            type: 'STRING',
                            description: 'Câu lệnh cần thực thi (ví dụ: python script.py, yt-dlp URL, node test.js)'
                        }
                    },
                    required: ['command']
                }
            },
            {
                name: 'SEARCH_EXPERIENCE',
                description: 'Tìm kiếm các bài học kinh nghiệm, giải pháp và cách giải quyết bài toán đã tích lũy trong quá khứ.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: {
                            type: 'STRING',
                            description: 'Vấn đề hoặc từ khóa cần tra cứu trong trí nhớ dài hạn'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'SAVE_EXPERIENCE',
                description: 'Lưu bài học kinh nghiệm mới vào bộ não trí nhớ dài hạn của AI để tự tiến hóa.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        task: { type: 'STRING', description: 'Nhiệm vụ hoặc đề bài' },
                        problem: { type: 'STRING', description: 'Thử thách hoặc khó khăn gặp phải' },
                        solution: { type: 'STRING', description: 'Cách giải quyết thành công' },
                        takeaway: { type: 'STRING', description: 'Bài học đúc kết cốt lõi' },
                        tags: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Các thẻ phân loại' }
                    },
                    required: ['problem', 'solution']
                }
            },
            {
                name: 'RUN_CODE',
                description: 'Chạy thử nghiệm mã nguồn JavaScript trong sandbox an toàn để kiểm tra tính đúng đắn.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        code: {
                            type: 'STRING',
                            description: 'Đoạn mã JavaScript cần thực thi'
                        },
                        timeout: {
                            type: 'NUMBER',
                            description: 'Thời gian tối đa (ms, mặc định: 5000)'
                        }
                    },
                    required: ['code']
                }
            }
        ];

        // Merge MCP tools into unified registry
        if (this.mcpClientManager) {
            const mcpTools = this.mcpClientManager.getToolDefinitions();
            if (Array.isArray(mcpTools) && mcpTools.length > 0) {
                nativeTools.push(...mcpTools);
            }
        }

        return nativeTools;
    }

    /**
     * Tool classification helpers
     */
    isReadOnly(toolName) {
        if (this.mcpClientManager && this.mcpClientManager.isMCPTool(toolName)) {
            return true;
        }
        return this.toolCategories.readonly.includes(toolName);
    }

    isWrite(toolName) {
        return this.toolCategories.write.includes(toolName);
    }

    isHeavy(toolName) {
        return this.toolCategories.heavy.includes(toolName);
    }

    isRetryable(error) {
        const retryablePatterns = [
            /timeout/i,
            /ECONNRESET/i,
            /ETIMEDOUT/i,
            /429/,
            /503/,
            /502/
        ];

        return retryablePatterns.some(pattern => pattern.test(error.message));
    }

    /**
     * Generate cache key
     */
    getCacheKey(toolName, args) {
        return `${toolName}:${JSON.stringify(args)}`;
    }

    /**
     * Unwrap Promise.allSettled results
     */
    unwrapSettled(results) {
        return results.map((r, idx) => {
            if (r.status === 'fulfilled') {
                return r.value;
            } else {
                return {
                    tool: `unknown_${idx}`,
                    success: false,
                    error: r.reason?.message || 'Unknown error'
                };
            }
        });
    }

    /**
     * Clear execution cache
     */
    clearCache() {
        this.executionCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.executionCache.size,
            keys: Array.from(this.executionCache.keys())
        };
    }
}

module.exports = { ToolExecutor };
