/**
 * UniversalGoalContract.js
 * Cyber Agent Pro v6.0 Enterprise
 * 
 * Bộ Trích Xuất & Kiểm Toán Hợp Đồng Mục Tiêu Tổng Quát (Universal Goal Invariant Engine)
 * - Tự động bóc tách số lượng mục tiêu (N), định dạng tệp mong muốn, và lĩnh vực tác vụ từ BẤT KỲ prompt nào.
 * - Phát hiện và ngăn chặn triệt để mọi hành vi "ăn gian" của LLM: lệnh echo giả lập, nhân bản mảng [x]*N, placeholder TODO, file rỗng 0 byte.
 * - Cung cấp chẩn đoán cụ thể (Deficit Diagnostics) để kích hoạt vòng lặp tự chữa lành (Self-Healing).
 */

const fs = require('fs');
const path = require('path');

class UniversalGoalContract {
    constructor(baseDir = path.resolve(__dirname, '..')) {
        this.baseDir = baseDir;
    }

    /**
     * Bóc tách hợp đồng mục tiêu từ yêu cầu người dùng
     * @param {string} userRequest - Prompt của người dùng
     * @returns {Object} Hợp đồng mục tiêu (Goal Contract)
     */
    extractContract(userRequest = '') {
        const text = (userRequest || '').trim().toLowerCase();

        // 1. Trích xuất số lượng mục tiêu (Target Quantity N)
        let requestedCount = 1;
        const countMatch = text.match(/(?:tải|cào|lấy|tạo|xuất|lọc|xử lý|viết|tổng hợp|phân tích|sinh)\s*(?:đủ|khoảng|ít nhất)?\s*(\d{1,3})\s*(?:video|bài|file|tệp|sản phẩm|tin|mục|bản ghi|bản|dòng|hàng|record|records|hóa đơn|ảnh|chart|bảng|user|khách hàng|mẫu|mẩu|trang|đoạn|post|items?)/i)
            || text.match(/(\d{1,3})\s*(?:video|bài|file|tệp|sản phẩm|tin|mục|bản ghi|bản|dòng|hàng|record|records|hóa đơn|ảnh|chart|bảng|user|khách hàng|mẫu|mẩu|trang|đoạn|post|items?)/i)
            || text.match(/(?:tải|cào|lấy|tạo|xuất|lọc|xử lý|viết|tổng hợp|phân tích|sinh)\s*(?:đủ|khoảng|ít nhất)?\s*(\d{1,3})\b/i);

        if (countMatch && countMatch[1]) {
            const parsed = parseInt(countMatch[1], 10);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 500) {
                requestedCount = parsed;
            }
        }

        // 2. Xác định lĩnh vực tác vụ & định dạng file mục tiêu
        let domain = 'general';
        let targetExtensions = [];

        if (/video|reels?|shorts?|tiktok|youtube|clip/i.test(text)) {
            domain = 'media_video';
            targetExtensions = ['.mp4', '.webm', '.mkv', '.mov'];
        } else if (/audio|tiếng|giọng|tts|speech|podcast|mp3|wav/i.test(text)) {
            domain = 'media_audio';
            targetExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.flac'];
        } else if (/excel|csv|bảng tính|sheets?|doanh thu|doanh số|sales/i.test(text)) {
            domain = 'data_spreadsheet';
            targetExtensions = ['.csv', '.xlsx', '.xls'];
        } else if (/sqlite|database|cơ sở dữ liệu|bảng dữ liệu|\.db|\.sqlite/i.test(text)) {
            domain = 'data_database';
            targetExtensions = ['.sqlite', '.db', '.sql'];
        } else if (/json|api|payload|dữ liệu bóc tách|scraped/i.test(text)) {
            domain = 'data_json';
            targetExtensions = ['.json'];
        } else if (/pdf|tài liệu|báo cáo tài chính|e-book/i.test(text)) {
            domain = 'document_pdf';
            targetExtensions = ['.pdf'];
        } else if (/ảnh|hình|thumbnail|banner|poster|chart|đồ thị/i.test(text)) {
            domain = 'media_image';
            targetExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
        } else if (/code|script|python|node|backend|api/i.test(text)) {
            domain = 'code_development';
            targetExtensions = ['.py', '.js', '.ts', '.html', '.css'];
        }

        // 3. Trích xuất tiền tố tên file nếu đề bài có quy định (ví dụ: story_1.mp3 -> targetPrefix = 'story')
        let targetPrefix = null;
        const prefixMatch = text.match(/(?:tên|đặt tên|gọi là|từ|file)\s+([a-zA-Z0-9_\-]+?)_\d+\./i)
            || text.match(/([a-zA-Z0-9_\-]+?)_\d+\.(?:mp3|mp4|csv|json|py|js|db|sqlite)/i);
        if (prefixMatch && prefixMatch[1]) {
            targetPrefix = prefixMatch[1].toLowerCase();
        }

        return {
            rawRequest: userRequest,
            requestedCount,
            domain,
            targetExtensions,
            targetPrefix,
            isBatch: requestedCount > 1,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Quét và phát hiện các mẫu "ăn gian" / code giả lập của LLM
     * @param {string} codeText - Mã nguồn do LLM sinh ra
     * @returns {Array<string>} Danh sách các lỗi anti-pattern phát hiện được
     */
    detectMockAntiPatterns(codeText = '') {
        const issues = [];
        if (!codeText || typeof codeText !== 'string') return issues;

        // 1. Nhân bản mảng [file] * N để giả vờ có nhiều dữ liệu
        if (/\[\s*["'][^"']+?["']\s*\]\s*\*\s*\d+/i.test(codeText)) {
            issues.push("Phát hiện nhân bản mảng dữ liệu ảo ([item] * N) thay vì xử lý dữ liệu thật.");
        }

        // 2. Dùng echo / print giả vờ đang xử lý
        if (/subprocess\.run\(\s*\[\s*["']echo["']\s*,\s*["'](?:processing|xử lý|download|tải|saving|running)/i.test(codeText)) {
            issues.push("Phát hiện lệnh shell giả lập (subprocess.run(['echo', ...])) thay vì gọi công cụ thực tế.");
        }

        // 3. Mảng giả lập chứa các từ khóa placeholder
        if (/\[\s*["'](?:mock|fake|sample|dummy|placeholder|giả lập)\s*\d*["']/i.test(codeText)) {
            issues.push("Phát hiện danh sách dữ liệu mẫu giả lập (mock/dummy placeholder data).");
        }

        // 4. Placeholder TODO / pass
        if (/\/\/\s*TODO:\s*(?:implement|tính sau|xử lý sau)|pass\s*#\s*placeholder/i.test(codeText)) {
            issues.push("Phát hiện mã nguồn chứa placeholder dở dang (TODO / pass).");
        }

        return issues;
    }

    /**
     * Kiểm toán mức độ thỏa mãn hợp đồng trên đĩa cứng thực tế
     * @param {Object} contract - Hợp đồng mục tiêu
     * @param {Object} executionContext
     * @param {Array<string>} executionContext.searchDirs - Các thư mục cần quét
     * @param {string} executionContext.codeSnippet - Code của chuyên gia
     * @returns {Object} Kết quả kiểm toán
     */
    auditFulfillment(contract, executionContext = {}) {
        const { searchDirs = [this.baseDir], codeSnippet = '' } = executionContext;
        
        // 1. Kiểm tra mẫu anti-pattern trong code
        const mockPatterns = this.detectMockAntiPatterns(codeSnippet);

        // 2. Quét các file thực tế thỏa mãn phần mở rộng mục tiêu
        const foundFiles = [];
        const seenNames = new Set();

        for (const dir of searchDirs) {
            if (fs.existsSync(dir)) {
                try {
                    const entries = fs.readdirSync(dir);
                    for (const f of entries) {
                        const ext = path.extname(f).toLowerCase();
                        if (contract.targetPrefix && !f.toLowerCase().startsWith(contract.targetPrefix)) {
                            continue;
                        }
                        if (contract.targetExtensions.length === 0 || contract.targetExtensions.includes(ext)) {
                            const fullPath = path.join(dir, f);
                            try {
                                const st = fs.statSync(fullPath);
                                // Phải là file thật, dung lượng > 100 bytes, không phải file rác tạm
                                if (st.isFile() && st.size > 100 && !f.startsWith('temp_') && !seenNames.has(f)) {
                                    seenNames.add(f);
                                    foundFiles.push({
                                        name: f,
                                        path: fullPath,
                                        size: st.size,
                                        sizeFormatted: `${(st.size / 1024 / 1024).toFixed(2)} MB`
                                    });
                                }
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            }
        }

        let validCount = foundFiles.length;
        let internalItemCount = 0;

        // Nếu là tác vụ dữ liệu (data_json, data_spreadsheet, data_database), kiểm tra số bản ghi/mục thực sự bên trong tệp
        const isDataDomain = ['data_json', 'data_spreadsheet', 'data_database'].includes(contract.domain) ||
            (contract.targetExtensions && contract.targetExtensions.some(ext => ['.json', '.csv', '.xlsx', '.sqlite', '.db'].includes(ext)));

        if (isDataDomain && foundFiles.length > 0) {
            for (const file of foundFiles) {
                const ext = path.extname(file.name).toLowerCase();
                try {
                    if (ext === '.json') {
                        const raw = fs.readFileSync(file.path, 'utf8');
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            internalItemCount += parsed.length;
                        } else if (parsed && typeof parsed === 'object') {
                            const arrayKeys = ['articles', 'posts', 'items', 'data', 'records', 'results', 'news'];
                            let matchedArray = false;
                            for (const k of arrayKeys) {
                                if (Array.isArray(parsed[k])) {
                                    internalItemCount += parsed[k].length;
                                    matchedArray = true;
                                    break;
                                }
                            }
                            if (!matchedArray) {
                                internalItemCount += Object.keys(parsed).length;
                            }
                        }
                    } else if (ext === '.csv') {
                        const raw = fs.readFileSync(file.path, 'utf8');
                        const lines = raw.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
                        internalItemCount += Math.max(0, lines.length - 1);
                    }
                } catch (e) {}
            }
            if (internalItemCount > validCount) {
                validCount = internalItemCount;
            }
        }

        const countSatisfied = validCount >= contract.requestedCount;
        const noMockViolations = mockPatterns.length === 0;
        const satisfied = countSatisfied && noMockViolations;

        let deficitDiagnostic = '';
        if (!satisfied) {
            const parts = [];
            if (!countSatisfied) {
                parts.push(`Thiếu số lượng: Yêu cầu ${contract.requestedCount} ${contract.domain}, thực tế tìm thấy ${validCount} ${isDataDomain ? 'mục/bản ghi' : 'file'} hợp lệ.`);
            }
            if (!noMockViolations) {
                parts.push(`Vi phạm tính chân thực: ${mockPatterns.join('; ')}`);
            }
            deficitDiagnostic = parts.join(' ');
        }

        return {
            satisfied,
            requestedCount: contract.requestedCount,
            actualCount: validCount,
            domain: contract.domain,
            foundFiles,
            mockViolations: mockPatterns,
            deficitDiagnostic,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = UniversalGoalContract;
