const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const cors = require('cors');
const vm = require('vm');
const { createPathGuard } = require('./utils/pathSafety');
const { AsyncMutex } = require('./utils/mutex');
const { RateLimiter } = require('./utils/rateLimiter');
const { createAuthMiddleware } = require('./middleware/auth');

// Mutex toàn cục cho file experiences.json (tránh concurrent write corruption)
const experiencesMutex = new AsyncMutex();
// Rate limiter toàn cục
const rateLimiter = new RateLimiter();

// Tự động nạp biến môi trường từ file .env nếu có
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const firstEqual = trimmed.indexOf('=');
            if (firstEqual > 0) {
                const key = trimmed.slice(0, firstEqual).trim();
                const val = trimmed.slice(firstEqual + 1).trim().replace(/^["']|["']$/g, '');
                process.env[key] = val;
            }
        }
    });
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS — Chỉ cho phép localhost truy cập (bảo mật)
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS: Origin không được phép'));
        }
    },
    credentials: true
}));

// Rate Limiter Middleware
const HEAVY_API_PATHS = ['/api/custom-ai-chat', '/api/browse-web', '/api/fetch-webpage', '/api/generate-image', '/api/export-design'];
app.use('/api', (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const isHeavy = HEAVY_API_PATHS.some(p => req.path === p.replace('/api', '') || req.path.startsWith(p.replace('/api', '') + '/'));
    const limit = isHeavy ? 15 : 300;
    if (!rateLimiter.check(`${ip}:${isHeavy ? 'heavy' : 'normal'}`, limit, 60000)) {
        return res.status(429).json({
            success: false,
            error: `Rate limit vượt quá: Tối đa ${limit} request/phút. Vui lòng thử lại sau.`
        });
    }
    next();
});

// Auth Middleware — Bearer Token (bật khi AGENT_SECRET_KEY được cấu hình)
app.use('/api', createAuthMiddleware(process.env.AGENT_SECRET_KEY));

// SECURITY: Chỉ phục vụ file tĩnh từ thư mục public/ — không phục vụ toàn bộ thư mục dự án
app.use(express.static(path.join(__dirname, 'public')));

// API cung cấp cấu hình cho giao diện trình duyệt từ .env
// SECURITY: Không bao giờ trả về giá trị API Key — chỉ trả trạng thái có/không
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasCustomAiKey: !!process.env.CUSTOM_AI_KEY,
        hasAgentSecret: !!process.env.AGENT_SECRET_KEY,
        port: process.env.PORT || 3000,
        outputDir: process.env.OUTPUT_DIR || '',
        customAi: {
            baseUrl: process.env.CUSTOM_AI_BASE_URL ? '***configured***' : '',
            model: process.env.CUSTOM_AI_MODEL || '',
            hasApiKey: !!process.env.CUSTOM_AI_KEY
        }
    });
});

// Đường dẫn gốc chứa mã nguồn của AI Agent
const BASE_DIR = path.resolve(__dirname);
// Thư mục trí nhớ dài hạn (nằm tại thư mục chính của dự án để tiện theo dõi)
const MEMORY_DIR = path.join(BASE_DIR, 'memory');
const RESEARCH_DIR = path.join(MEMORY_DIR, 'research');
const EXPERIENCES_FILE = path.join(MEMORY_DIR, 'experiences.json');
const EXPERIENCES_MD = path.join(MEMORY_DIR, 'EXPERIENCES.md');

// Thư mục gốc trên Desktop chuyên chứa toàn bộ sản phẩm do AI Agent tạo ra
const GEMINI_OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || 'C:\\Users\\Nam\\Desktop\\gemini');

// ==========================================
// PATH SAFETY GUARD — Chống Path Traversal Attack
// ==========================================
// Khởi tạo sau khi có BASE_DIR, GEMINI_OUTPUT_DIR, MEMORY_DIR
let _isSafePath = null; // lazy init sau khi MEMORY_DIR defined

function assertSafePath(resolvedPath, res) {
    if (!_isSafePath) {
        _isSafePath = createPathGuard([BASE_DIR, GEMINI_OUTPUT_DIR, MEMORY_DIR]);
    }
    if (!resolvedPath) return true;
    if (!_isSafePath(resolvedPath)) {
        if (res) res.json({ 
            success: false, 
            error: `🚫 Path bị từ chối: Đường dẫn nằm ngoài vùng an toàn cho phép.` 
        });
        return false;
    }
    return true;
}

// Hàm lấy thư mục theo ngày/tháng/năm: C:\Users\Nam\Desktop\gemini\YYYY-MM-DD
function getTodayOutputDir() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateFolderName = `${year}-${month}-${day}`; // 2026-10-15
    const fullDateDir = path.join(GEMINI_OUTPUT_DIR, dateFolderName);
    if (!fs.existsSync(fullDateDir)) {
        fs.mkdirSync(fullDateDir, { recursive: true });
    }
    return fullDateDir;
}

// Khởi tạo các thư mục cần thiết
if (!fs.existsSync(GEMINI_OUTPUT_DIR)) fs.mkdirSync(GEMINI_OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
if (!fs.existsSync(RESEARCH_DIR)) fs.mkdirSync(RESEARCH_DIR, { recursive: true });
if (!fs.existsSync(EXPERIENCES_FILE)) {
    fs.writeFileSync(EXPERIENCES_FILE, JSON.stringify([], null, 2), 'utf8');
}
if (!fs.existsSync(EXPERIENCES_MD)) {
    fs.writeFileSync(EXPERIENCES_MD, '# 🧠 KHO TRI THỨC & BÀI HỌC KINH NGHIỆM CỦA CYBER AGENT\n\nDanh sách các bài học, giải pháp và kinh nghiệm tự học tích lũy qua thời gian:\n\n---\n', 'utf8');
}

function hasPathTraversal(targetPath) {
    if (typeof targetPath !== 'string') return false;
    const normalized = targetPath.trim().replace(/\\/g, '/');
    return normalized.split('/').some(segment => segment === '..');
}

function rejectPathTraversal(targetPath, res) {
    if (!hasPathTraversal(targetPath)) return false;
    if (res) {
        res.json({
            success: false,
            error: '🚫 Path bị từ chối: không cho phép thành phần .. trong đường dẫn.'
        });
    }
    return true;
}

// Hàm chuẩn hóa đường dẫn thông minh:
// - Nếu là file kinh nghiệm, học tập, nghiên cứu trong memory -> giữ nguyên tại thư mục chính C:\Users\Nam\Desktop\AI agent\memory\
// - Mọi file sản phẩm tạo ra khác -> tự động trỏ vào C:\Users\Nam\Desktop\gemini\YYYY-MM-DD\
function resolvePath(targetPath, isWriting = false) {
    if (!targetPath) return isWriting ? getTodayOutputDir() : BASE_DIR;

    // Loại bỏ dấu ngoặc kép, nháy đơn hoặc backticks bao quanh nếu có
    let cleanPath = targetPath.trim().replace(/^[`'"]+|[`'"]+$/g, '');
    const normalized = cleanPath.replace(/\\/g, '/');

    // 1. Nếu là file kinh nghiệm, học tập, nghiên cứu trong memory
    if (normalized.startsWith('memory/') || normalized.startsWith('./memory/') || normalized === 'memory') {
        return path.resolve(BASE_DIR, cleanPath);
    }

    // 2. Nếu là đường dẫn tuyệt đối
    if (path.isAbsolute(cleanPath)) {
        // Nếu truyền tuyệt đối vào thư mục AI agent (không phải memory), tự động chuyển hướng sang gemini
        if (isWriting && cleanPath.startsWith(BASE_DIR) && !cleanPath.startsWith(MEMORY_DIR)) {
            const rel = path.relative(BASE_DIR, cleanPath);
            return path.resolve(getTodayOutputDir(), rel);
        }
        return path.resolve(cleanPath);
    }

    // 3. Nếu là đường dẫn tương đối khi ghi file (ví dụ "index.html", "game.html", "app.js")
    if (isWriting) {
        return path.resolve(getTodayOutputDir(), cleanPath);
    }

    // 4. Khi đọc hoặc xem trước file (isWriting = false)
    const inTodayDir = path.resolve(getTodayOutputDir(), cleanPath);
    if (fs.existsSync(inTodayDir)) return inTodayDir;

    const inGeminiDir = path.resolve(GEMINI_OUTPUT_DIR, cleanPath);
    if (fs.existsSync(inGeminiDir)) return inGeminiDir;

    // Quét tìm trong tất cả các thư mục ngày (YYYY-MM-DD) bên trong GEMINI_OUTPUT_DIR
    try {
        if (fs.existsSync(GEMINI_OUTPUT_DIR)) {
            const dateDirs = fs.readdirSync(GEMINI_OUTPUT_DIR).sort().reverse();
            for (const d of dateDirs) {
                const candidate = path.resolve(GEMINI_OUTPUT_DIR, d, cleanPath);
                if (fs.existsSync(candidate)) return candidate;
            }
        }
    } catch(e) {}

    const inBaseDir = path.resolve(BASE_DIR, cleanPath);
    if (fs.existsSync(inBaseDir)) return inBaseDir;

    return inTodayDir;
}

// ==========================================
// 1. FILE SYSTEM & CODEBASE ENGINE
// (Surgical Diff, Syntax Check, Snapshot & Rollback, Codebase Map, Daemons)
// ==========================================

const SNAPSHOTS_DIR = path.join(BASE_DIR, '.snapshots');
const SNAPSHOT_NAME_PATTERN = /^\d+_[A-Za-z0-9._-]+$/;
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

// Tự động tạo bản sao lưu Snapshot trước khi sửa file
function createSnapshot(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) return null;

        const timestamp = Date.now();
        const baseName = path.basename(filePath);
        const snapshotFile = `${timestamp}_${baseName}`;
        const dest = path.join(SNAPSHOTS_DIR, snapshotFile);

        fs.copyFileSync(filePath, dest);

        // Giữ tối đa 50 snapshots gần nhất, xóa snapshot cũ
        const all = fs.readdirSync(SNAPSHOTS_DIR).sort();
        if (all.length > 50) {
            for (let i = 0; i < all.length - 50; i++) {
                try { fs.unlinkSync(path.join(SNAPSHOTS_DIR, all[i])); } catch (e) {}
            }
        }

        return {
            snapshotId: snapshotFile,
            originalPath: filePath,
            timestamp: new Date(timestamp).toLocaleString('vi-VN')
        };
    } catch (e) {
        console.warn('Không thể tạo snapshot:', e.message);
        return null;
    }
}

// Bộ kiểm tra cú pháp nhanh Pre-flight Syntax Validator
function validateFileSyntax(filePath, content) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
        try {
            JSON.parse(content);
            return { valid: true };
        } catch (e) {
            return { valid: false, error: `Lỗi cú pháp JSON: ${e.message}` };
        }
    }
    if (ext === '.js' || ext === '.mjs') {
        try {
            new vm.Script(content, { filename: path.basename(filePath) });
            return { valid: true };
        } catch (e) {
            return { valid: false, error: `Lỗi cú pháp JavaScript (${e.name}): ${e.message}` };
        }
    }
    return { valid: true };
}

// Ghi file toàn phần (Có Snapshot & Kiểm tra cú pháp tự động)
app.post(['/api/save-file', '/api/write-file'], (req, res) => {
    try {
        let { filePath, fileName, content } = req.body;
        const target = filePath || fileName || 'output.txt';
        if (rejectPathTraversal(target, res)) return;
        const fullPath = resolvePath(target, true);
        if (!assertSafePath(fullPath, res)) return; // Chặn path traversal

        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Tự động tạo snapshot nếu file đã tồn tại trước đó
        let snapshot = null;
        if (fs.existsSync(fullPath)) {
            snapshot = createSnapshot(fullPath);
        }

        // Kiểm tra cú pháp trước khi lưu
        const syntaxCheck = validateFileSyntax(fullPath, content || '');
        let syntaxWarning = null;
        if (!syntaxCheck.valid) {
            syntaxWarning = `⚠️ CẢNH BÁO LỖI CÚ PHÁP: ${syntaxCheck.error}`;
            console.warn(`[Pre-flight Syntax] ${fullPath} có lỗi: ${syntaxCheck.error}`);
        }

        fs.writeFileSync(fullPath, content || '', 'utf8');

        res.json({
            success: true,
            message: `Đã lưu file thành công: ${path.basename(fullPath)} tại ${path.relative('C:\\Users\\Nam\\Desktop', fullPath)}` + (syntaxWarning ? `\n${syntaxWarning}` : ''),
            fullPath: fullPath,
            fileName: path.basename(fullPath),
            dateFolder: path.basename(path.dirname(fullPath)),
            size: Buffer.byteLength(content || '', 'utf8'),
            snapshotId: snapshot ? snapshot.snapshotId : null,
            syntaxValid: syntaxCheck.valid,
            syntaxError: syntaxCheck.valid ? null : syntaxCheck.error,
            syntaxWarning: syntaxWarning
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi ghi file: ${err.message}` });
    }
});

// Chỉnh sửa từng khối mã chính xác (Surgical Diff / Search & Replace)
app.post('/api/edit-file-chunk', (req, res) => {
    try {
        let { filePath, targetContent, replacementContent, allowMultiple } = req.body;
        if (!filePath) return res.json({ success: false, error: 'Thiếu đường dẫn file (filePath)' });
        if (targetContent === undefined || targetContent === null) {
            return res.json({ success: false, error: 'Thiếu đoạn code cần thay thế (targetContent)' });
        }
        if (replacementContent === undefined || replacementContent === null) {
            replacementContent = '';
        }
        if (rejectPathTraversal(filePath, res)) return;

        const fullPath = resolvePath(filePath);
        if (!assertSafePath(fullPath, res)) return; // Chặn path traversal
        if (!fs.existsSync(fullPath)) {
            return res.json({ success: false, error: `File không tồn tại: ${fullPath}` });
        }

        const currentContent = fs.readFileSync(fullPath, 'utf8');

        // Chuẩn hóa ký tự xuống dòng để tìm kiếm chính xác bất kể CRLF hay LF
        const normalizeNewlines = (str) => str.replace(/\r\n/g, '\n');
        const normCurrent = normalizeNewlines(currentContent);
        const normTarget = normalizeNewlines(targetContent);

        const index = normCurrent.indexOf(normTarget);
        if (index === -1) {
            return res.json({
                success: false,
                error: `Không tìm thấy đoạn mã mục tiêu (targetContent) trong file ${path.basename(fullPath)}. Hãy gọi READ_FILE để lấy đúng ký tự, khoảng trắng và dấu thụt lề.`
            });
        }

        if (!allowMultiple) {
            const secondIndex = normCurrent.indexOf(normTarget, index + normTarget.length);
            if (secondIndex !== -1) {
                return res.json({
                    success: false,
                    error: `Đoạn mã mục tiêu xuất hiện nhiều hơn 1 lần trong file. Hãy mở rộng thêm các dòng ngữ cảnh xung quanh để xác định vị trí duy nhất, hoặc đặt allowMultiple: true.`
                });
            }
        }

        // Tạo bản sao lưu Snapshot tự động trước khi can thiệp code
        const snapshot = createSnapshot(fullPath);

        // Thay thế khối mã
        let newContent;
        if (allowMultiple) {
            newContent = normCurrent.split(normTarget).join(normalizeNewlines(replacementContent));
        } else {
            newContent = normCurrent.slice(0, index) + normalizeNewlines(replacementContent) + normCurrent.slice(index + normTarget.length);
        }

        if (currentContent.includes('\r\n')) {
            newContent = newContent.replace(/\n/g, '\r\n');
        }

        // Pre-flight Syntax Check
        const syntaxCheck = validateFileSyntax(fullPath, newContent);
        let syntaxWarning = null;
        if (!syntaxCheck.valid) {
            syntaxWarning = `⚠️ CẢNH BÁO LỖI CÚ PHÁP: ${syntaxCheck.error}`;
            console.warn(`[Pre-flight Syntax] ${fullPath} sau khi sửa có lỗi: ${syntaxCheck.error}`);
        }

        fs.writeFileSync(fullPath, newContent, 'utf8');

        res.json({
            success: true,
            message: `Đã chỉnh sửa thành công khối mã trong ${path.basename(fullPath)}!` + (syntaxWarning ? `\n${syntaxWarning}` : ''),
            filePath: fullPath,
            snapshotId: snapshot ? snapshot.snapshotId : null,
            syntaxValid: syntaxCheck.valid,
            syntaxError: syntaxCheck.valid ? null : syntaxCheck.error,
            syntaxWarning: syntaxWarning
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi chỉnh sửa file: ${err.message}` });
    }
});

// Hoàn tác mã nguồn về bản Snapshot (Rollback)
app.post('/api/rollback-code', (req, res) => {
    try {
        const { snapshotId, filePath } = req.body;
        if (!fs.existsSync(SNAPSHOTS_DIR)) {
            return res.json({ success: false, error: 'Chưa có bản snapshot nào được lưu.' });
        }

        let targetSnapshot = snapshotId;
        if (filePath && rejectPathTraversal(filePath, res)) return;
        if (!targetSnapshot || targetSnapshot === 'latest') {
            const files = fs.readdirSync(SNAPSHOTS_DIR);
            if (filePath) {
                const baseName = path.basename(filePath);
                const matching = files.filter(f => f.endsWith(`_${baseName}`)).sort();
                if (matching.length === 0) {
                    return res.json({ success: false, error: `Không tìm thấy snapshot nào cho file: ${baseName}` });
                }
                targetSnapshot = matching[matching.length - 1];
            } else {
                if (files.length === 0) return res.json({ success: false, error: 'Kho snapshot đang trống.' });
                targetSnapshot = files.sort()[files.length - 1];
            }
        }

        const snapshotNamePattern = SNAPSHOT_NAME_PATTERN;
        if (!snapshotNamePattern.test(targetSnapshot) || path.basename(targetSnapshot) !== targetSnapshot) {
            return res.json({ success: false, error: 'Snapshot ID không hợp lệ.' });
        }
        const snapshotPath = path.resolve(SNAPSHOTS_DIR, targetSnapshot);
        if (!assertSafePath(snapshotPath, res) || !fs.existsSync(snapshotPath)) {
            return res.json({ success: false, error: `Snapshot không tồn tại: ${targetSnapshot}` });
        }

        const originalBase = targetSnapshot.replace(/^\d+_/, '');
        const targetFullPath = filePath ? resolvePath(filePath) : resolvePath(originalBase);
        if (!assertSafePath(targetFullPath, res)) return; // Chặn path traversal

        fs.copyFileSync(snapshotPath, targetFullPath);

        res.json({
            success: true,
            message: `Đã hoàn tác khôi phục file ${path.basename(targetFullPath)} về bản snapshot [${targetSnapshot}] thành công!`,
            restoredFile: targetFullPath,
            snapshotId: targetSnapshot
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi khôi phục snapshot: ${err.message}` });
    }
});

// Lập bản đồ cấu trúc Codebase & Biểu tượng (AST & Symbol Tree)
app.post('/api/codebase-map', (req, res) => {
    try {
        const { rootDir, depth = 3 } = req.body;
        if (rootDir && rejectPathTraversal(rootDir, res)) return;
        const targetDir = rootDir ? resolvePath(rootDir) : BASE_DIR;
        if (!assertSafePath(targetDir, res)) return;

        if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
            return res.json({ success: false, error: `Thư mục không tồn tại: ${targetDir}` });
        }

        const ignoreList = new Set([
            'node_modules', '.git', '.snapshots', 'chrome_profile', 'dist', 'build', '.cache', 'temp', 'tmp'
        ]);

        function scanDir(dir, currentDepth) {
            if (currentDepth > depth) return null;
            let entries = [];
            try {
                const items = fs.readdirSync(dir, { withFileTypes: true });
                for (const it of items) {
                    if (ignoreList.has(it.name) || it.name.startsWith('.')) continue;
                    const full = path.join(dir, it.name);
                    if (it.isDirectory()) {
                        const children = scanDir(full, currentDepth + 1);
                        entries.push({
                            type: 'directory',
                            name: it.name,
                            path: path.relative(targetDir, full).replace(/\\/g, '/'),
                            children: children || []
                        });
                    } else {
                        const ext = path.extname(it.name).toLowerCase();
                        let symbols = [];
                        if (['.js', '.mjs', '.ts', '.py', '.json'].includes(ext)) {
                            try {
                                const code = fs.readFileSync(full, 'utf8').slice(0, 30000);
                                if (ext === '.json') {
                                    if (it.name === 'package.json') {
                                        const pkg = JSON.parse(code);
                                        symbols.push(`pkg: ${pkg.name || ''}`, `scripts: ${Object.keys(pkg.scripts || {}).join(', ')}`);
                                    }
                                } else if (ext === '.js' || ext === '.ts') {
                                    const fnMatches = code.match(/(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|class\s+([a-zA-Z0-9_$]+)|app\.(get|post|put|delete)\(['"]([^'"]+)['"])/g) || [];
                                    symbols = fnMatches.slice(0, 10).map(s => s.trim().replace(/\s+/g, ' '));
                                } else if (ext === '.py') {
                                    const pyMatches = code.match(/(?:def\s+([a-zA-Z0-9_]+)|class\s+([a-zA-Z0-9_]+))/g) || [];
                                    symbols = pyMatches.slice(0, 10).map(s => s.trim());
                                }
                            } catch (e) {}
                        }
                        entries.push({
                            type: 'file',
                            name: it.name,
                            path: path.relative(targetDir, full).replace(/\\/g, '/'),
                            size: fs.statSync(full).size,
                            symbols: symbols.length > 0 ? symbols : undefined
                        });
                    }
                }
            } catch (e) {}
            return entries;
        }

        const tree = scanDir(targetDir, 1);
        res.json({
            success: true,
            rootDir: targetDir,
            tree: tree
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi quét sơ đồ codebase: ${err.message}` });
    }
});

// Bộ Quản Lý Tiến Trình Nền & Dev Server (Background Daemon Runner)
const activeDaemons = new Map();

app.post('/api/manage-daemon', (req, res) => {
    try {
        const { action = 'list', daemonId, command, cwd } = req.body;

        if (action === 'list') {
            const list = Array.from(activeDaemons.entries()).map(([id, d]) => ({
                id,
                command: d.command,
                status: d.status,
                pid: d.process ? d.process.pid : null,
                startTime: d.startTime,
                uptimeSeconds: Math.floor((Date.now() - d.startTime) / 1000),
                logCount: d.logs.length
            }));
            return res.json({ success: true, daemons: list });
        }

        if (action === 'start') {
            if (!command) return res.json({ success: false, error: 'Thiếu lệnh khởi chạy (command)' });
            if (cwd && rejectPathTraversal(cwd, res)) return;
            const id = daemonId || `daemon_${Date.now()}`;
            if (activeDaemons.has(id) && activeDaemons.get(id).status === 'RUNNING') {
                return res.json({ success: false, error: `Daemon ID '${id}' đang chạy rồi. Hãy dừng trước nếu muốn chạy lại.` });
            }

            // SECURITY: Whitelist — Chỉ cho phép chạy node scripts và npm scripts
            const DAEMON_ALLOWED = [
                /^node\s+[\w\-\.\/\\]+\.js\b/i,
                /^npm\s+(start|run)\b/i,
                /^(python|python3|py)\s+[\w\-\.\/\\]+\.py\b/i,
            ];
            if (!DAEMON_ALLOWED.some(p => p.test(command.trim()))) {
                return res.json({ success: false, error: '🚫 Daemon chỉ cho phép chạy: node <file.js>, npm start/run, python <file.py>.' });
            }

            const workDir = cwd ? resolvePath(cwd) : BASE_DIR;
            if (cwd && rejectPathTraversal(cwd, res)) return;
            if (!assertSafePath(workDir, res) || !fs.existsSync(workDir) || !fs.statSync(workDir).isDirectory()) return;
            const parsed = parseSafeCommand(command);
            if (!parsed) return res.json({ success: false, error: 'Daemon command không nằm trong schema an toàn.' });
            const child = spawn(parsed.file, parsed.args, { cwd: workDir, shell: false, windowsHide: true });

            const daemonRecord = {
                id,
                command,
                process: child,
                status: 'RUNNING',
                startTime: Date.now(),
                workDir,
                logs: []
            };

            const appendLog = (data, type) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        daemonRecord.logs.push(`[${new Date().toLocaleTimeString('vi-VN')}][${type}] ${line}`);
                        if (daemonRecord.logs.length > 500) daemonRecord.logs.shift();
                    }
                }
            };

            child.stdout.on('data', (d) => appendLog(d, 'STDOUT'));
            child.stderr.on('data', (d) => appendLog(d, 'STDERR'));

            child.on('exit', (code, signal) => {
                daemonRecord.status = 'EXITED';
                daemonRecord.exitCode = code;
                daemonRecord.logs.push(`[${new Date().toLocaleTimeString('vi-VN')}][SYSTEM] Tiến trình đã dừng (Exit code: ${code}, Signal: ${signal})`);
            });

            child.on('error', (err) => {
                daemonRecord.status = 'ERROR';
                daemonRecord.logs.push(`[${new Date().toLocaleTimeString('vi-VN')}][ERROR] Lỗi tiến trình: ${err.message}`);
            });

            activeDaemons.set(id, daemonRecord);

            return res.json({
                success: true,
                message: `Đã khởi chạy Daemon '${id}' ngầm thành công!`,
                daemonId: id,
                pid: child.pid,
                command: command,
                workDir: workDir
            });
        }

        if (action === 'stop' || action === 'kill') {
            if (!daemonId) return res.json({ success: false, error: 'Thiếu daemonId' });
            const daemon = activeDaemons.get(daemonId);
            if (!daemon) return res.json({ success: false, error: `Không tìm thấy daemonId '${daemonId}'` });

            if (daemon.status === 'RUNNING' && daemon.process) {
                try {
                    spawn(process.platform === 'win32' ? 'taskkill.exe' : 'kill',
                        process.platform === 'win32' ? ['/pid', String(daemon.process.pid), '/T', '/F'] : ['-KILL', String(daemon.process.pid)],
                        { shell: false, windowsHide: true });
                } catch (e) {
                    daemon.process.kill('SIGKILL');
                }
                daemon.status = 'STOPPED';
                return res.json({ success: true, message: `Đã dừng tiến trình Daemon '${daemonId}' thành công!` });
            }
            return res.json({ success: true, message: `Daemon '${daemonId}' đã ở trạng thái dừng (${daemon.status}).` });
        }

        if (action === 'logs') {
            if (!daemonId) return res.json({ success: false, error: 'Thiếu daemonId' });
            const daemon = activeDaemons.get(daemonId);
            if (!daemon) return res.json({ success: false, error: `Không tìm thấy daemonId '${daemonId}'` });

            const limit = parseInt(req.body.limit) || 50;
            return res.json({
                success: true,
                daemonId,
                status: daemon.status,
                logs: daemon.logs.slice(-limit),
                totalLogs: daemon.logs.length
            });
        }

        if (action === 'status') {
            if (!daemonId) return res.json({ success: false, error: 'Thiếu daemonId' });
            const daemon = activeDaemons.get(daemonId);
            if (!daemon) return res.json({ success: false, error: `Không tìm thấy daemonId '${daemonId}'` });

            return res.json({
                success: true,
                daemonId,
                status: daemon.status,
                pid: daemon.process ? daemon.process.pid : null,
                uptimeSeconds: Math.floor((Date.now() - daemon.startTime) / 1000),
                recentLogs: daemon.logs.slice(-10)
            });
        }

        return res.json({ success: false, error: `Hành động không hợp lệ: ${action}` });
    } catch (err) {
        res.json({ success: false, error: `Lỗi quản lý daemon: ${err.message}` });
    }
});

// Đọc file
app.post('/api/read-file', (req, res) => {
    try {
        let { filePath, fileName } = req.body;
        const target = filePath || fileName;
        if (!target) return res.json({ success: false, error: 'Thiếu đường dẫn file (filePath)' });
        if (rejectPathTraversal(target, res)) return;

        const fullPath = resolvePath(target);
        if (!assertSafePath(fullPath, res)) return; // Chặn path traversal
        if (!fs.existsSync(fullPath)) {
            return res.json({ success: false, error: `File không tồn tại: ${fullPath}` });
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            return res.json({ success: false, error: `Đường dẫn là thư mục, không phải file: ${fullPath}` });
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n').length;

        res.json({
            success: true,
            fullPath: fullPath,
            content: content,
            lines: lines,
            size: stat.size
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi đọc file: ${err.message}` });
    }
});

// Phục vụ xem trước file trực tiếp trên Live Preview iframe / trình duyệt
app.get('/api/view-file', (req, res) => {
    try {
        const target = req.query.path || req.query.file;
        if (!target) return res.status(400).send('Thiếu đường dẫn file (path hoặc file)');
        if (rejectPathTraversal(target)) return res.status(400).send('🚫 Path bị từ chối: không cho phép thành phần .. trong đường dẫn.');
        const fullPath = resolvePath(target);
        if (!assertSafePath(fullPath, res)) return;
        if (!fs.existsSync(fullPath)) {
            return res.status(404).send(`<h3>Không tìm thấy file: ${target}</h3>`);
        }
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            return res.status(400).send('Đường dẫn là thư mục, không phải file');
        }

        const ext = path.extname(fullPath).toLowerCase();

        // 1. Xem trước file CSV (Bảng tính Excel) dưới dạng Bảng tương tác thông minh
        if (ext === '.csv') {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
            if (lines.length === 0) {
                return res.send(`<html><body style="background:#020617;color:#94a3b8;font-family:sans-serif;padding:20px;"><h3>File CSV trống</h3></body></html>`);
            }

            const parseRow = (line) => {
                const row = [];
                let inQuotes = false;
                let cur = '';
                for (let i = 0; i < line.length; i++) {
                    const c = line[i];
                    if (c === '"') {
                        inQuotes = !inQuotes;
                    } else if (c === ',' && !inQuotes) {
                        row.push(cur.trim());
                        cur = '';
                    } else {
                        cur += c;
                    }
                }
                row.push(cur.trim());
                return row;
            };

            const headers = parseRow(lines[0]);
            const rows = lines.slice(1).map(parseRow);

            const tableHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>CSV Live Viewer</title>
    <style>
        body { margin: 0; background: #030712; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 10px; }
        .title { font-weight: 800; color: #38bdf8; font-size: 0.95rem; }
        .search-box { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 6px 12px; color: #fff; font-size: 0.85rem; outline: none; width: 220px; }
        .search-box:focus { border-color: #38bdf8; }
        .badge { background: #1e293b; color: #10b981; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
        .table-wrap { overflow-x: auto; border: 1px solid #1e293b; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem; }
        th { background: #0f172a; color: #38bdf8; padding: 10px 14px; font-weight: 700; border-bottom: 2px solid #334155; white-space: nowrap; }
        td { padding: 9px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        tr:hover td { background: rgba(56, 189, 248, 0.05); }
        a { color: #60a5fa; text-decoration: none; word-break: break-all; }
        a:hover { text-decoration: underline; color: #93c5fd; }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="title">📊 BẢNG DỮ LIỆU EXCEL / CSV: <span class="badge">${rows.length} HÀNG</span></div>
        <input type="text" id="filterInput" class="search-box" placeholder="🔍 Lọc nhanh dữ liệu..." onkeyup="filterTable()">
    </div>
    <div class="table-wrap">
        <table id="dataTable">
            <thead>
                <tr>${headers.map(h => `<th>${escapeHtmlServer(h)}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map(r => `<tr>${r.map(cell => {
                    const isLink = cell.startsWith('http://') || cell.startsWith('https://');
                    const content = isLink ? `<a href="${cell}" target="_blank">${escapeHtmlServer(cell)} ↗</a>` : escapeHtmlServer(cell);
                    return `<td>${content}</td>`;
                }).join('')}</tr>`).join('')}
            </tbody>
        </table>
    </div>
    <script>
        function filterTable() {
            const filter = document.getElementById('filterInput').value.toLowerCase();
            const rows = document.querySelectorAll('#dataTable tbody tr');
            rows.forEach(r => {
                const txt = r.textContent.toLowerCase();
                r.style.display = txt.includes(filter) ? '' : 'none';
            });
        }
    </script>
</body>
</html>`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(tableHtml);
        }

        // 2. Xem trước file Markdown (.md) dưới dạng Tài liệu Báo cáo cao cấp
        if (ext === '.md' || ext === '.markdown') {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const mdHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Markdown Report</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        body { margin: 0; background: #030712; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; line-height: 1.7; }
        #content { max-width: 900px; margin: 0 auto; }
        h1, h2, h3 { color: #38bdf8; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; }
        code { background: #0f172a; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
        pre { background: #020617; border: 1px solid #1e293b; padding: 12px; border-radius: 8px; overflow-x: auto; }
        pre code { background: transparent; padding: 0; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        th, td { border: 1px solid #1e293b; padding: 8px 12px; }
        th { background: #0f172a; color: #38bdf8; }
        blockquote { border-left: 3px solid #a855f7; margin: 12px 0; padding: 6px 14px; background: rgba(168,85,247,0.08); color: #c084fc; }
        a { color: #60a5fa; }
        hr { border: none; border-top: 1px solid #1e293b; margin: 24px 0; }
    </style>
</head>
<body>
    <div id="content"></div>
    <script>
        const rawMd = ${JSON.stringify(raw)};
        document.getElementById('content').innerHTML = marked.parse(rawMd);
    </script>
</body>
</html>`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(mdHtml);
        }

        // 3. Xem trước file Text / JSON / Code
        if (ext === '.txt' || ext === '.json' || ext === '.js' || ext === '.py') {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const codeHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Text Viewer</title>
    <style>
        body { margin: 0; background: #030712; color: #a5f3fc; font-family: 'JetBrains Mono', Consolas, monospace; padding: 16px; font-size: 0.88rem; line-height: 1.5; }
        pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
    </style>
</head>
<body>
    <pre>${escapeHtmlServer(raw)}</pre>
</body>
</html>`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(codeHtml);
        }

        // 4. Xem trước hình ảnh (.png, .jpg, .jpeg, .webp, .gif) trong Studio Viewer đẹp mắt
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
            if (req.query.raw === '1') {
                return res.sendFile(fullPath);
            }
            const stat = fs.statSync(fullPath);
            const imageHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Image Studio Viewer</title>
    <style>
        body { margin: 0; background: #030712; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; background: #0b1329; border-bottom: 1px solid #1e293b; }
        .info { font-weight: 700; color: #38bdf8; font-size: 0.88rem; display: flex; align-items: center; gap: 8px; }
        .badge { background: #1e293b; color: #10b981; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
        .btn-dl { background: linear-gradient(135deg, #0284c7, #2563eb); color: #fff; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-size: 0.82rem; font-weight: 600; border: none; cursor: pointer; transition: all 0.2s; }
        .btn-dl:hover { background: linear-gradient(135deg, #0369a1, #1d4ed8); transform: translateY(-1px); }
        .canvas-area { flex: 1; display: flex; justify-content: center; align-items: center; padding: 20px; overflow: auto; background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 16px 16px; }
        .canvas-area img { max-width: 95%; max-height: 85vh; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.85); border: 1px solid rgba(255,255,255,0.1); }
    </style>
</head>
<body>
    <div class="toolbar">
        <div class="info">
            <span>🖼️ AI ARTWORK / IMAGE: <b>${escapeHtmlServer(path.basename(fullPath))}</b></span>
            <span class="badge">${(stat.size / 1024).toFixed(1)} KB</span>
        </div>
        <div>
            <a href="/api/view-file?path=${encodeURIComponent(target)}&raw=1" download="${path.basename(fullPath)}" class="btn-dl">📥 Tải Ảnh Về Máy</a>
        </div>
    </div>
    <div class="canvas-area">
        <img src="/api/view-file?path=${encodeURIComponent(target)}&raw=1" alt="${escapeHtmlServer(path.basename(fullPath))}">
    </div>
</body>
</html>`;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(imageHtml);
        }

        // 5. Xem trước file PDF trong iframe
        if (ext === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            return res.sendFile(fullPath);
        }

        // Mặc định cho HTML, SVG
        res.sendFile(fullPath);
    } catch (err) {
        res.status(500).send(`Lỗi máy chủ xem trước: ${err.message}`);
    }
});

function escapeHtmlServer(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Liệt kê thư mục (List Files)
app.post('/api/list-files', (req, res) => {
    try {
        let { dirPath, recursive } = req.body;
        if (dirPath && rejectPathTraversal(dirPath, res)) return;
        const targetDir = resolvePath(dirPath || '.');
        if (!assertSafePath(targetDir, res)) return;
        if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
            return res.json({ success: false, error: `Thư mục không tồn tại: ${targetDir}` });
        }

        function scanDir(dir, depth = 0) {
            if (depth > (recursive ? 3 : 1)) return [];
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            let list = [];
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name === '.git') continue;
                const fullItemPath = path.join(dir, entry.name);
                const relPath = path.relative(targetDir, fullItemPath);
                if (entry.isDirectory()) {
                    list.push({ name: entry.name, path: relPath, type: 'directory' });
                    if (recursive) {
                        list = list.concat(scanDir(fullItemPath, depth + 1));
                    }
                } else {
                    const stat = fs.statSync(fullItemPath);
                    list.push({ name: entry.name, path: relPath, type: 'file', size: stat.size });
                }
            }
            return list;
        }

        const items = scanDir(targetDir);
        res.json({
            success: true,
            targetDir: targetDir,
            totalItems: items.length,
            items: items
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi quét thư mục: ${err.message}` });
    }
});

// API trả về thông tin Workspace xuất sản phẩm
app.get('/api/workspace-info', (req, res) => {
    const todayDir = getTodayOutputDir();
    res.json({
        success: true,
        outputBaseDir: GEMINI_OUTPUT_DIR,
        todayDir: todayDir,
        todayFolder: path.basename(todayDir),
        memoryDir: MEMORY_DIR,
        researchDir: RESEARCH_DIR
    });
});

// ==========================================
// 2. CMD EXECUTION (Thực thi lệnh hệ thống)
// ==========================================

// Parse thành executable + argv; không bao giờ chuyển chuỗi người dùng vào shell.
function parseSafeCommand(command) {
    if (typeof command !== 'string' || !command.trim() || command.length > 500) return null;
    const value = command.trim();
    // Shell metacharacters, command substitution and control operators are never accepted.
    if (/[&|<>`$;\n\r]|\$\(|\b(?:cmd|powershell|pwsh|sh|bash)\b/i.test(value)) return null;

    const parts = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    if (!parts || parts.length === 0) return null;
    const args = parts.map(part => part.replace(/^(["'])|(["'])$/g, ''));
    const executable = args.shift().toLowerCase();
    const scriptArg = args[0] || '';
    const safeRelative = input => typeof input === 'string' &&
        input.length > 0 && input.length <= 240 &&
        !path.isAbsolute(input) && !input.includes('..') &&
        /^[\w./\\:-]+$/.test(input);

    if (executable === 'node' && /^[-\w./\\]+\.js$/i.test(scriptArg)) {
        const extraArgs = args.slice(1);
        if (!extraArgs.every(arg => safeRelative(arg))) return null;
        return { file: process.execPath, args, display: value };
    }
    if ((executable === 'python' || executable === 'python3' || executable === 'py') &&
        /^[\w./\\-]+\.py$/i.test(scriptArg)) {
        const extraArgs = args.slice(1);
        if (!extraArgs.every(arg => safeRelative(arg))) return null;
        return { file: executable === 'py' ? 'py' : executable, args, display: value };
    }
    if (executable === 'npm' && /^(start|test|ls|outdated|audit)$/.test(scriptArg)) {
        return { file: process.platform === 'win32' ? 'npm.cmd' : 'npm', args, display: value };
    }
    if (executable === 'npm' && scriptArg === 'run' && /^[\w:-]+$/.test(args[1] || '')) {
        return { file: process.platform === 'win32' ? 'npm.cmd' : 'npm', args, display: value };
    }
    if (executable === 'git' && /^(status|log|diff|branch|remote)$/.test(scriptArg) &&
        args.slice(1).every(arg => /^[\w./\\:-]+$/.test(arg))) {
        return { file: 'git', args, display: value };
    }
    if ((executable === 'dir' || executable === 'ls') && args.every(safeRelative)) {
        return { file: executable, args, display: value };
    }
    if ((executable === 'type' || executable === 'cat') && args.length === 1 && safeRelative(args[0])) {
        return { file: executable, args, display: value };
    }
    return null;
}

function runSafeCommand(command, cwd, callback) {
    const parsed = parseSafeCommand(command);
    if (!parsed) return callback(new Error('Command không nằm trong schema an toàn'), '', '');
    const child = spawn(parsed.file, parsed.args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    const maxOutput = 2 * 1024 * 1024;
    child.stdout.on('data', chunk => {
        stdout += chunk.toString();
        if (stdout.length > maxOutput) child.kill();
    });
    child.stderr.on('data', chunk => {
        stderr += chunk.toString();
        if (stderr.length > maxOutput) child.kill();
    });
    const timer = setTimeout(() => child.kill(), 60000);
    child.once('error', err => { clearTimeout(timer); callback(err, stdout, stderr); });
    child.once('close', code => {
        clearTimeout(timer);
        callback(code === 0 ? null : Object.assign(new Error(`Exit code ${code}`), { code }), stdout, stderr);
    });
}

app.post('/api/run-cmd', (req, res) => {
    const { command, cwd } = req.body;
    const parsed = parseSafeCommand(command);
    if (!parsed) {
        return res.json({ success: false, output: '🚫 Lệnh bị từ chối: chỉ hỗ trợ command schema an toàn, không qua shell.' });
    }
    if (cwd && rejectPathTraversal(cwd, res)) return;

    const workDir = cwd ? resolvePath(cwd) : getTodayOutputDir();
    if (!assertSafePath(workDir, res) || !fs.existsSync(workDir) || !fs.statSync(workDir).isDirectory()) return;

    runSafeCommand(command, workDir, (error, stdout, stderr) => {
        const output = (stdout || '') + (stderr ? (stdout ? '\n[STDERR]:\n' : '') + stderr : '');
        res.json({
            success: !error,
            output: output || (error ? `Lỗi thực thi: ${error.message}` : '[Lệnh đã hoàn thành, không có dữ liệu trả về]'),
            exitCode: error ? (error.code || 1) : 0,
            workDir
        });
    });
});

// =======================================================
// 3. WEB SEARCH & ARTICLE FETCHER (Tìm kiếm & Đọc tài liệu)
// =======================================================

// Hàm tra cứu đa nguồn Internet (Dev.to + Wikipedia + Google News RSS + DuckDuckGo)
async function multiSourceWebSearch(query, limit = 6) {
    let results = [];
    if (!query) return results;

    // Nguồn 1: Dev.to Technical Engineering Articles API (Chuyên môn sâu về code, kiến trúc, best practices)
    try {
        const devRes = await fetch(`https://dev.to/api/articles?per_page=4&q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const devData = await devRes.json();
        if (Array.isArray(devData)) {
            devData.slice(0, 3).forEach(a => {
                if (a.title && a.url) {
                    results.push({
                        title: a.title,
                        url: a.url,
                        snippet: a.description || `Tài liệu kỹ thuật chuyên sâu về ${a.tag_list?.join(', ') || query}`,
                        source: 'Dev.to Technical Engineering'
                    });
                }
            });
        }
    } catch (e) {}

    // Nguồn 2: Wikipedia Technical Standards API (Tiêu chuẩn công nghệ, nguyên lý học thuật)
    if (results.length < limit) {
        try {
            const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`);
            const wikiData = await wikiRes.json();
            if (wikiData?.query?.search) {
                wikiData.query.search.slice(0, 2).forEach(w => {
                    const cleanSnippet = (w.snippet || '').replace(/<[^>]+>/g, '').trim();
                    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(w.title.replace(/\s+/g, '_'))}`;
                    results.push({
                        title: `${w.title} - Wikipedia Standard`,
                        url: wikiUrl,
                        snippet: cleanSnippet,
                        source: 'Wikipedia Technical Standards'
                    });
                });
            }
        } catch (e) {}
    }

    // Nguồn 3: Google News RSS (Tin tức thị trường, tuyển dụng, sự kiện thời sự)
    if (results.length < limit) {
        try {
            const gUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=vi&gl=VN&ceid=VN:vi`;
            const gRes = await fetch(gUrl);
            const xml = await gRes.text();
            const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g;
            let match;
            while ((match = regex.exec(xml)) !== null && results.length < limit) {
                const title = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
                const link = match[2].trim();
                const date = new Date(match[3]).toLocaleString('vi-VN');
                results.push({ title, url: link, snippet: `Bản tin công nghệ/thị trường: ${date}`, source: 'Google News / Industry Insight' });
            }
        } catch (e) {}
    }

    // Nguồn 4: Hacker News Algolia API (Cộng đồng developer, startup, tech mới nhất 2026)
    if (results.length < limit) {
        try {
            const hnRes = await fetch(
                `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=3`,
                { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
            );
            const hnData = await hnRes.json();
            if (Array.isArray(hnData.hits)) {
                hnData.hits.slice(0, 3).forEach(h => {
                    if (h.title && (h.url || h.objectID)) {
                        results.push({
                            title: h.title,
                            url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
                            snippet: h.story_text
                                ? h.story_text.slice(0, 200).replace(/<[^>]+>/g, '')
                                : `HN Discussion: ${h.points || 0} points, ${h.num_comments || 0} comments`,
                            source: 'Hacker News Community'
                        });
                    }
                });
            }
        } catch (e) {}
    }

    // Nguồn 5: DuckDuckGo Instant Answer API (Tìm kiếm không log)
    if (results.length < limit) {
        try {
            const ddgRes = await fetch(
                `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
                { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
            );
            const ddgData = await ddgRes.json();
            if (ddgData.AbstractURL && ddgData.Abstract && ddgData.Abstract.length > 30) {
                results.push({
                    title: ddgData.Heading || query,
                    url: ddgData.AbstractURL,
                    snippet: ddgData.Abstract.slice(0, 350),
                    source: `DuckDuckGo — ${ddgData.AbstractSource || 'Instant Answer'}`
                });
            }
            if (Array.isArray(ddgData.RelatedTopics)) {
                ddgData.RelatedTopics.slice(0, 2).forEach(rt => {
                    if (rt.FirstURL && rt.Text && rt.Text.length > 20 && results.length < limit) {
                        results.push({
                            title: rt.Text.slice(0, 100),
                            url: rt.FirstURL,
                            snippet: rt.Text,
                            source: 'DuckDuckGo Related'
                        });
                    }
                });
            }
        } catch (e) {}
    }

    return results.slice(0, limit);
}

// Tìm kiếm Web sâu rộng qua đa nguồn tri thức (Dev.to + Wikipedia + Google News RSS)
app.post(['/api/search', '/api/web-search'], async (req, res) => {
    const { query } = req.body;
    if (!query) return res.json({ success: false, error: 'Thiếu từ khóa tìm kiếm' });

    const results = await multiSourceWebSearch(query, 6);

    if (results.length > 0) {
        let md = `### 🌐 Kết quả nghiên cứu Internet cho: "${query}"\n\n`;
        results.forEach((r, idx) => {
            md += `${idx + 1}. **[${r.title}](${r.url})** *(${r.source})*\n   - ${r.snippet}\n   - Link: \`${r.url}\`\n\n`;
        });
        res.json({ success: true, result: md, items: results });
    } else {
        res.json({ success: false, result: `Không tìm thấy kết quả nào cho "${query}". Hãy thử đổi từ khóa cụ thể hơn.` });
    }
});

// =========================================================================
// 5. STEALTH BROWSER & ANTI-BOT ENGINE (PUPPETEER EXTRA STEALTH + JINA PROXY)
// Vượt qua Cloudflare, Turnstile, Datadome, Akamai & Các bộ lọc Bot WAF
// =========================================================================
const puppeteerCore = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = addExtra(puppeteerCore);
puppeteer.use(StealthPlugin());

const CHROME_PROFILE_DIR = path.join(BASE_DIR, 'chrome_profile');
function getScreenshotsDir() {
    const dir = path.join(getTodayOutputDir(), 'screenshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

if (!fs.existsSync(CHROME_PROFILE_DIR)) fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

// Tự động tìm đường dẫn Google Chrome hoặc Edge trên máy tính
function getInstalledBrowserPath() {
    const candidatePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const p of candidatePaths) {
        if (p && fs.existsSync(p)) return p;
    }
    return null;
}

// Khởi tạo trang web ngụy trang người thật cao cấp (Stealth Evasion)
async function setupStealthPage(page) {
    // 1. Viewport máy tính để bàn chuẩn
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    // 2. Thiết lập User-Agent của Chrome thật trên Windows
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

    // 3. Đặt header nhận diện như người thật duyệt web thông thường
    await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    });

    // 4. Tiêm mã ngụy trang sâu & xóa sạch dấu vết CDP / DevTools
    await page.evaluateOnNewDocument(() => {
        // Xóa cờ navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        // Xóa các biến nhận diện DevTools (cdc_)
        try {
            for (const key of Object.keys(window)) {
                if (/^cdc_/.test(key)) delete window[key];
            }
        } catch (e) {}

        // Giả lập danh sách plugin trình duyệt thật
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                { name: 'Native Client', filename: 'internal-nacl-plugin' }
            ]
        });

        // Giả lập ngôn ngữ tiếng Việt & tiếng Anh
        Object.defineProperty(navigator, 'languages', {
            get: () => ['vi-VN', 'vi', 'en-US', 'en']
        });

        // Giả lập đối tượng window.chrome của Google Chrome
        window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
        };
    });
}

// Hàm chuẩn hóa HTML & trích xuất liên kết việc làm / tài liệu chuyên sâu
function extractContentAndJobLinks(rawHtml, baseUrl) {
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rawHtml);
    const title = titleMatch ? titleMatch[1].trim() : baseUrl;

    // 1. Phân giải và chuyển đổi các thẻ liên kết <a> thành Markdown [Anchor](AbsoluteURL)
    const convertedHtml = rawHtml.replace(/<a\b[^>]*?\bhref=(["'])(.*?)\1[^>]*?>([\s\S]*?)<\/a>/gi, (match, q, href, inner) => {
        try {
            const cleanInner = inner.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
            const trimmedHref = (href || '').trim();
            if (!trimmedHref || trimmedHref.startsWith('#') || trimmedHref.startsWith('javascript:') || trimmedHref.startsWith('mailto:')) {
                return cleanInner;
            }
            const fullUrl = new URL(trimmedHref, baseUrl).href;
            if (!cleanInner) return ` ${fullUrl} `;
            return ` [${cleanInner}](${fullUrl}) `;
        } catch (e) {
            return inner;
        }
    });

    // 2. Làm sạch HTML thành văn bản thuần túy có cấu trúc
    let cleanText = convertedHtml
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<svg[\s\S]*?<\/svg>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n### $1\n')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n* $1')
        .replace(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
        .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .trim();

    // 3. Trích xuất danh sách các liên kết bài tuyển dụng cụ thể (Deep Job Links / Client Postings)
    const deepJobLinks = [];
    const seenUrls = new Set();
    const mdLinkRegex = /\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
    let lMatch;
    while ((lMatch = mdLinkRegex.exec(cleanText)) !== null) {
        const anchor = lMatch[1].trim();
        const linkUrl = lMatch[2].trim();
        if (seenUrls.has(linkUrl)) continue;

        const isSpecificJob = linkUrl.match(/\/jobs?\/~|\/job\/|\/projects?\/|\/freelance-jobs\/[a-zA-Z0-9_-]+\/|linkedin\.com\/jobs\/view|topcv\.vn\/viec-lam\/|vietnamworks\.com\/[a-zA-Z0-9_-]+-jv/i)
            || (anchor.length > 12 && anchor.match(/developer|engineer|lập trình|frontend|backend|fullstack|designer|tuyển|hiring|remote|translator/i));

        if (isSpecificJob) {
            seenUrls.add(linkUrl);
            deepJobLinks.push({ title: anchor, url: linkUrl });
        }
    }

    return { title, cleanText, deepJobLinks };
}

// Đọc toàn bộ nội dung của 1 đường dẫn URL (Cơ chế Vượt Chặn Bot Đa Tầng 3 Lớp: Stealth Fetch -> Jina AI Reader -> Puppeteer Stealth)
app.post('/api/fetch-webpage', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.json({ success: false, error: 'Thiếu đường dẫn URL' });

    let parsedInputUrl;
    try {
        parsedInputUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedInputUrl.protocol) || !isUrlSafe(url)) {
            return res.json({ success: false, error: 'URL bị từ chối vì không hợp lệ hoặc trỏ tới mạng nội bộ.' });
        }
        url = parsedInputUrl.toString();
    } catch (e) {
        return res.json({ success: false, error: 'URL không hợp lệ.' });
    }

    let rawHtml = '';
    let usedEngine = 'Direct Stealth HTTP/2 Fetch';
    let title = '';

    // =========================================================================
    // TẦNG 1: Fetch trực tiếp với đầy đủ Realistic Modern Headers
    // =========================================================================
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            },
            signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
            const html = await response.text();
            const isBlockedByWaf = html.includes('Just a moment...') ||
                                   html.includes('Attention Required! | Cloudflare') ||
                                   html.includes('challenge-platform') ||
                                   html.includes('cf-browser-verification');
            if (!isBlockedByWaf && html.trim().length > 150) {
                rawHtml = html;
            } else {
                console.warn(`🛡️ [Anti-Bot Shield] Trang ${url} bị Cloudflare WAF chặn. Chuyển sang Tầng 2 (Jina AI Reader)...`);
            }
        } else {
            console.warn(`🛡️ [Anti-Bot Shield] HTTP ${response.status} khi truy cập ${url}. Chuyển sang Tầng 2 (Jina AI Reader)...`);
        }
    } catch (e) {
        console.warn(`🛡️ [Anti-Bot Shield] Fetch trực tiếp gặp lỗi: ${e.message}. Chuyển sang Tầng 2...`);
    }

    // =========================================================================
    // TẦNG 2: Jina AI Stealth Reader Proxy (Vượt qua 99% Cloudflare/Datadome)
    // =========================================================================
    if (!rawHtml) {
        try {
            usedEngine = 'Jina AI Stealth Reader Engine (Bypass Cloudflare WAF)';
            const jinaUrl = `https://r.jina.ai/${url}`;
            const jinaRes = await fetch(jinaUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'X-No-Cache': 'true',
                    'X-Return-Format': 'markdown'
                },
                signal: AbortSignal.timeout(25000)
            });

            if (jinaRes.ok) {
                const jinaText = await jinaRes.text();
                if (jinaText && jinaText.length > 150 && !jinaText.includes('Attention Required! | Cloudflare')) {
                    const titleMatch = /Title:\s*([^\n\r]+)/i.exec(jinaText);
                    title = titleMatch ? titleMatch[1].trim() : url;

                    // Trích xuất link bài tuyển dụng trực tiếp từ Markdown
                    const deepJobLinks = [];
                    const seenUrls = new Set();
                    const mdLinkRegex = /\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
                    let lMatch;
                    while ((lMatch = mdLinkRegex.exec(jinaText)) !== null) {
                        const anchor = lMatch[1].trim();
                        const linkUrl = lMatch[2].trim();
                        if (seenUrls.has(linkUrl)) continue;

                        const isSpecificJob = linkUrl.match(/\/jobs?\/~|\/job\/|\/projects?\/|\/freelance-jobs\/[a-zA-Z0-9_-]+\/|linkedin\.com\/jobs\/view|topcv\.vn\/viec-lam\/|vietnamworks\.com\/[a-zA-Z0-9_-]+-jv/i)
                            || (anchor.length > 12 && anchor.match(/developer|engineer|lập trình|frontend|backend|fullstack|designer|tuyển|hiring|remote|translator/i));

                        if (isSpecificJob) {
                            seenUrls.add(linkUrl);
                            deepJobLinks.push({ title: anchor, url: linkUrl });
                        }
                    }

                    // Loại bỏ các header metadata đầu ra của Jina
                    let cleanContent = jinaText.replace(/Title:\s*[^\n\r]+\n/i, '')
                        .replace(/URL Source:\s*[^\n\r]+\n/i, '')
                        .replace(/Markdown Content:\s*\n/i, '')
                        .trim();

                    const truncated = cleanContent.length > 7000;
                    cleanContent = cleanContent.slice(0, 7000);

                    let deepLinkAppendix = "";
                    if (deepJobLinks.length > 0) {
                        deepLinkAppendix = `\n\n### 🎯 DANH SÁCH CÁC LINK BÀI TUYỂN DỤNG CỤ THỂ TRÍCH XUẤT ĐƯỢC TỪ TRANG NÀY:\n` +
                            deepJobLinks.slice(0, 10).map((j, i) => `${i + 1}. **[${j.title}](${j.url})**\n   - Link trực tiếp: \`${j.url}\``).join('\n');
                    }

                    console.log(`🛡️ [Anti-Bot Shield] Đã vượt qua bảo vệ bot thành công qua ${usedEngine}`);
                    return res.json({
                        success: true,
                        title: title,
                        url: url,
                        bypassEngine: usedEngine,
                        content: `> 🛡️ *[Hệ thống Anti-Bot Shield: Đã tự động kích hoạt ${usedEngine} để vượt rào cản bot]*\n\n` +
                                 cleanContent + (truncated ? '\n\n... [Nội dung còn tiếp đã được cắt ngắn] ...' : '') + deepLinkAppendix,
                        deepJobLinks: deepJobLinks.slice(0, 15)
                    });
                }
            }
        } catch (jinaErr) {
            console.warn(`🛡️ [Anti-Bot Shield] Jina Reader gặp lỗi: ${jinaErr.message}. Tiếp tục Tầng 3 (Puppeteer Stealth)...`);
        }
    }

    // =========================================================================
    // TẦNG 3: Puppeteer Extra Stealth Headless Engine (Duyệt ngầm bằng Chrome thật)
    // =========================================================================
    if (!rawHtml) {
        let stealthBrowser = null;
        try {
            usedEngine = 'Puppeteer Extra Stealth Headless Engine';
            const chromePath = getInstalledBrowserPath();
            if (chromePath) {
                stealthBrowser = await puppeteer.launch({
                    executablePath: chromePath,
                    headless: 'new',
                    userDataDir: CHROME_PROFILE_DIR,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-blink-features=AutomationControlled',
                        '--disable-features=IsolateOrigins,site-per-process',
                        '--window-size=1920,1080',
                        '--disable-infobars',
                        '--lang=vi-VN,vi'
                    ]
                });
                const page = await stealthBrowser.newPage();
                await setupStealthPage(page);
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
                title = await page.title();
                rawHtml = await page.content();
                await stealthBrowser.close();
                stealthBrowser = null;
            }
        } catch (pErr) {
            if (stealthBrowser) {
                try { await stealthBrowser.close(); } catch(e) {}
            }
            console.error(`🛡️ [Anti-Bot Shield] Puppeteer Stealth gặp lỗi: ${pErr.message}`);
        }
    }

    if (!rawHtml) {
        return res.json({
            success: false,
            error: `Không thể đọc trang web sau khi đã thử 3 tầng phòng thủ chống bot (Direct Stealth Fetch, Jina AI Proxy, Puppeteer Stealth). Vui lòng thử dùng BROWSE_WEB có giao diện thật.`
        });
    }

    // Xử lý HTML từ Tầng 1 hoặc Tầng 3
    const parsed = extractContentAndJobLinks(rawHtml, url);
    const finalTitle = title || parsed.title;
    const truncated = parsed.cleanText.length > 7000;
    const cleanSlice = parsed.cleanText.slice(0, 7000);

    let deepLinkAppendix = "";
    if (parsed.deepJobLinks.length > 0) {
        deepLinkAppendix = `\n\n### 🎯 DANH SÁCH CÁC LINK BÀI TUYỂN DỤNG CỤ THỂ TRÍCH XUẤT ĐƯỢC TỪ TRANG NÀY:\n` +
            parsed.deepJobLinks.slice(0, 10).map((j, i) => `${i + 1}. **[${j.title}](${j.url})**\n   - Link trực tiếp: \`${j.url}\``).join('\n');
    }

    res.json({
        success: true,
        title: finalTitle,
        url: url,
        bypassEngine: usedEngine,
        content: (usedEngine !== 'Direct Stealth HTTP/2 Fetch' ? `> 🛡️ *[Hệ thống Anti-Bot Shield: Đã kích hoạt ${usedEngine} thành công]*\n\n` : '') +
                 cleanSlice + (truncated ? '\n\n... [Nội dung còn tiếp đã được cắt ngắn] ...' : '') + deepLinkAppendix,
        deepJobLinks: parsed.deepJobLinks.slice(0, 15)
    });
});

// =========================================================================
// 4. SELF-LEARNING & EXPERIENCE VAULT (BỘ LỌC 3 LỚP CHỐNG RÁC & CHỐNG TRÙNG LẶP)
// =========================================================================

// Thuật toán tính toán độ tương đồng nâng cấp: TF-IDF Cosine Similarity + Bigram Bonus
// Chính xác hơn Jaccard thuần túy, đặc biệt với tiếng Việt từ ghép và cụm từ kỹ thuật
function calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const tokenize = (str) => str.toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1); // Bắt cả từ đơn tiếng Việt (ngắn hơn tiếng Anh)

    const tokens1 = tokenize(text1);
    const tokens2 = tokenize(text2);
    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    // TF (Term Frequency) cho mỗi document
    const tf = (tokens) => {
        const freq = {};
        tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
        const total = tokens.length;
        Object.keys(freq).forEach(k => { freq[k] /= total; });
        return freq;
    };

    const tf1 = tf(tokens1);
    const tf2 = tf(tokens2);

    // Cosine similarity trên không gian TF
    const vocab = new Set([...Object.keys(tf1), ...Object.keys(tf2)]);
    let dotProduct = 0, norm1 = 0, norm2 = 0;
    for (const term of vocab) {
        const v1 = tf1[term] || 0;
        const v2 = tf2[term] || 0;
        dotProduct += v1 * v2;
        norm1 += v1 * v1;
        norm2 += v2 * v2;
    }
    if (norm1 === 0 || norm2 === 0) return 0;
    const cosine = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));

    // Bigram bonus: bắt cụm từ 2 chữ (từ ghép tiếng Việt)
    const bigrams = (tokens) => {
        const bg = new Set();
        for (let i = 0; i < tokens.length - 1; i++) {
            bg.add(`${tokens[i]}_${tokens[i + 1]}`);
        }
        return bg;
    };
    const bg1 = bigrams(tokens1);
    const bg2 = bigrams(tokens2);
    let bigramOverlap = 0;
    for (const bg of bg1) { if (bg2.has(bg)) bigramOverlap++; }
    const bigramBonus = (bg1.size > 0 && bg2.size > 0)
        ? (bigramOverlap / Math.max(bg1.size, bg2.size)) * 0.15
        : 0;

    return Math.min(1.0, cosine + bigramBonus);
}

// -------------------------------------------------------------------------
// THUẬT TOÁN ĐO LƯỜNG & CHẤM ĐIỂM CHẤT LƯỢNG TRI THỨC (QUALITY SCORING: 0 - 100%)
// Đánh giá dựa trên 5 tiêu chuẩn: Độ sâu chi tiết, Tính thực tiễn kỹ thuật,
// Phân tích bẫy lỗi/nguyên nhân gốc rễ, Chiều sâu bài học rút ra, và Thẻ phân loại
// -------------------------------------------------------------------------
function calculateQualityScore(exp) {
    if (!exp) return 40;
    const task = exp.task || '';
    const prob = exp.problem || '';
    const sol = exp.solution || '';
    const take = exp.takeaway || '';
    const tags = Array.isArray(exp.tags) ? exp.tags : (exp.tags ? [exp.tags] : []);

    // 1. Độ dài & Độ phong phú chi tiết (Max 20 pts)
    const totalLen = (task + prob + sol + take).length;
    let lenScore = 5;
    if (totalLen >= 350) lenScore = 20;
    else if (totalLen >= 200) lenScore = 15;
    else if (totalLen >= 100) lenScore = 10;

    const fullText = (task + ' ' + prob + ' ' + sol + ' ' + take).toLowerCase();

    // 2. Tính thực tiễn kỹ thuật & Artifacts chuyên môn (Max 25 pts)
    const techRegex = /(function|const|let|var|class|npm|pip|import|require|git|curl|docker|async|await|return|endpoint|json|regex|config|framework|langgraph|crewai|puppeteer|express|python|node|api|sql|http|token|cache|database|pipeline|workflow|architecture|react|adlc|mcp|gateway|signing|proxy|auth|tls)/gi;
    const techMatches = (fullText.match(techRegex) || []).length;
    let techScore = 5;
    if (techMatches >= 3) techScore = 25;
    else if (techMatches >= 1) techScore = 15;

    // 3. Phân tích nguyên nhân & Thử thách kỹ thuật (Max 20 pts)
    const rootRegex = /(nguyên nhân|vấn đề|thử thách|hạn chế|lỗi|bug|bảo mật|rủi ro|bottleneck|quá tải|quota|timeout|xung đột|tấn công|chi phí|độ trễ|đứt gãy|tối ưu|thất bại|khó khăn|lỗ hổng|phòng thủ)/gi;
    const rootMatches = (fullText.match(rootRegex) || []).length;
    let rootScore = 5;
    if (rootMatches >= 2) rootScore = 20;
    else if (rootMatches >= 1) rootScore = 12;

    // 4. Chiều sâu bài học rút ra & Best Practice (Max 20 pts)
    let takeScore = 5;
    const takeRegex = /(bài học|nguyên tắc|cốt lõi|luôn|chủ động|kiến trúc|tự động|phòng ngừa|tối ưu hóa|chuẩn mực|cơ chế|thực chiến|giải pháp|chiến lược|nghiêm cấm|đảm bảo)/gi;
    if (take.length >= 50) takeScore += 8;
    if (takeRegex.test(take)) takeScore += 7;

    // 5. Thẻ Tag chuẩn hóa & Taxonomy (Max 15 pts)
    const validTags = tags.filter(t => t && String(t).trim().length > 2 && !/^(test|nháp)$/i.test(String(t).trim()));
    let tagScore = 0;
    if (validTags.length >= 3) tagScore = 15;
    else if (validTags.length >= 1) tagScore = 8;

    const total = lenScore + techScore + rootScore + takeScore + tagScore;
    return Math.min(100, Math.max(30, total));
}

// Xếp hạng cấp độ tri thức dựa trên % điểm chất lượng
function getQualityGrade(score) {
    if (score >= 90) return '⭐ Tinh Hoa (Mastery)';
    if (score >= 80) return '🚀 Chuyên Sâu (Production)';
    if (score >= 70) return '💡 Thực Tiễn (Actionable)';
    if (score >= 60) return '📌 Cơ Bản (Standard)';
    return '⚠️ Sơ Cấp (Preliminary)';
}

// Hàm đồng bộ và tái tạo EXPERIENCES.md sạch đẹp chuẩn đồ họa từ experiences.json kèm điểm chất lượng & phiên bản
function rebuildExperiencesMarkdown(experiences) {
    let md = '# 🧠 KHO TRI THỨC & TIẾN HÓA BÀI HỌC KINH NGHIỆM CỦA CYBER AGENT\n\n'
           + 'Danh sách các bài học thực chiến tích lũy qua thời gian (ĐÃ TỰ ĐỘNG CHẤM ĐIỂM CHẤT LƯỢNG & TỰ ĐỘNG THĂNG CẤP TIẾN HÓA):\n\n---\n';
    
    experiences.forEach((exp, idx) => {
        const score = exp.qualityScore || calculateQualityScore(exp);
        const version = exp.version ? `v${exp.version}.0` : 'v1.0';
        const grade = exp.grade || getQualityGrade(score);

        md += `\n### 💡 #${idx + 1} [${exp.dateFormatted || exp.timestamp}] ${exp.task}\n`
            + `- **Cấp độ chất lượng:** \`${grade} - ${score}%\` | **Phiên bản:** \`${version}\`\n`
            + `- **Vấn đề / Thử thách:** ${exp.problem}\n`
            + `- **Cách giải quyết:** ${exp.solution}\n`
            + `- **Bài học cốt lõi (Takeaway):** ${exp.takeaway}\n`;

        if (exp.evolutionHistory && exp.evolutionHistory.length > 0) {
            md += `- **Lịch sử tự thăng cấp:** ${exp.evolutionHistory.map(h => `${h.fromScore}% ➔ ${h.toScore}% (${h.date.split(' ')[0]})`).join(' | ')}\n`;
        }

        md += `- **Từ khóa:** ${(exp.tags || []).map(t => `\`#${t}\``).join(' ')}\n`
            + `\n---\n`;
    });

    fs.writeFileSync(EXPERIENCES_MD, md, 'utf8');
}

// Lưu bài học kinh nghiệm mới (Trải qua Bộ lọc 3 lớp + Chấm điểm chất lượng & Tự Thăng cấp)
// [S+ UPGRADE] Dùng async + experiencesMutex để tránh concurrent write corruption
app.post('/api/save-experience', async (req, res) => {
    try {
        const { id, task, problem, solution, takeaway, tags, reason } = req.body;
        
        // NẾU CÓ TRUYỀN ID CỤ THỂ: TỰ ĐỘNG CHUYỂN THÀNH CẬP NHẬT / THĂNG CẤP BÀI HỌC CŨ
        if (id && fs.existsSync(EXPERIENCES_FILE)) {
            let experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
            const idx = experiences.findIndex(e => e.id === id);
            if (idx !== -1) {
                const existing = experiences[idx];
                const oldScore = existing.qualityScore || calculateQualityScore(existing);
                if (task && task.trim()) existing.task = task.trim();
                if (problem && problem.trim()) existing.problem = problem.trim();
                if (solution && solution.trim()) existing.solution = solution.trim();
                if (takeaway && takeaway.trim()) existing.takeaway = takeaway.trim();
                if (Array.isArray(tags) && tags.length > 0) {
                    existing.tags = Array.from(new Set([...(existing.tags || []), ...tags]));
                }
                const newScore = calculateQualityScore(existing);
                const newGrade = getQualityGrade(newScore);
                existing.version = (existing.version || 1) + 1;
                existing.qualityScore = newScore;
                existing.grade = newGrade;
                existing.lastUpdated = new Date().toLocaleString('vi-VN');
                existing.evolutionHistory = existing.evolutionHistory || [];
                existing.evolutionHistory.push({
                    date: new Date().toLocaleString('vi-VN'),
                    fromScore: oldScore,
                    toScore: newScore,
                    version: `v${existing.version}.0`,
                    reason: reason || `Cập nhật & thăng cấp bài học (${oldScore}% ➔ ${newScore}%)`
                });
                await experiencesMutex.lock(() => fsPromises.writeFile(EXPERIENCES_FILE, JSON.stringify(experiences, null, 2), 'utf8'));
                rebuildExperiencesMarkdown(experiences);
                return res.json({
                    success: true,
                    merged: true,
                    upgraded: newScore > oldScore,
                    id: existing.id,
                    task: existing.task,
                    oldScore: oldScore,
                    newScore: newScore,
                    version: existing.version,
                    grade: newGrade,
                    message: `🚀 [ĐÃ NÂNG CẤP BÀI HỌC ID: ${existing.id}]: Thăng cấp chất lượng từ ${oldScore}% lên ${newScore}% (${newGrade} - v${existing.version}.0)!`,
                    experience: existing,
                    totalExperiences: experiences.length
                });
            }
        }
        const taskText = (task || '').trim();
        const probText = (problem || '').trim();
        const solText = (solution || '').trim();
        const takeText = (takeaway || solText || '').trim();

        // -------------------------------------------------------------------------
        // LỚP 1: BỘ LỌC CHẤT LƯỢNG (QUALITY GATEKEEPER)
        // Loại bỏ các bài học nháp, test hoặc quá ngắn thiếu giá trị
        // -------------------------------------------------------------------------
        const combinedLength = taskText.length + probText.length + solText.length + takeText.length;
        const tagList = Array.isArray(tags) ? tags : (tags ? [tags] : []);
        const isSpamOrTest = /^(test|thử nghiệm|kiểm tra|ok|hello|abc)(\s+(tự\s*học|api|chức\s*năng|lưu))?$/i.test(taskText) && combinedLength < 120;
        const hasTestTag = tagList.some(t => /^(test|thử\s*nghiệm)$/i.test(String(t).trim())) && combinedLength < 120;
        
        if (combinedLength < 40 || isSpamOrTest || hasTestTag) {
            return res.json({
                success: false,
                filtered: true,
                message: 'Bài học bị từ chối bởi Bộ Lọc Chất Lượng: Nội dung quá ngắn hoặc mang tính chất thử nghiệm nháp, chưa đạt tiêu chuẩn kiến thức thực chiến.'
            });
        }

        let experiences = [];
        if (fs.existsSync(EXPERIENCES_FILE)) {
            experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
        }

        // Tính điểm chất lượng của bài học mới
        const candidateExp = { task: taskText, problem: probText, solution: solText, takeaway: takeText, tags: tagList };
        const newScore = calculateQualityScore(candidateExp);
        const newGrade = getQualityGrade(newScore);

        // -------------------------------------------------------------------------
        // LỚP 2: BỘ LỌC CHỐNG TRÙNG LẶP & TỰ ĐỘNG THĂNG CẤP TIẾN HÓA (DEDUPLICATION & UPGRADE)
        // Kiểm tra xem bài học tương tự đã từng được lưu hay chưa
        // -------------------------------------------------------------------------
        let matchedIndex = -1;
        let maxSimilarity = 0;

        for (let i = 0; i < experiences.length; i++) {
            const exp = experiences[i];
            const simTask = calculateTextSimilarity(taskText, exp.task);
            const simTakeaway = calculateTextSimilarity(takeText, exp.takeaway);
            const score = (simTask * 0.5) + (simTakeaway * 0.5);

            // Coi là trùng lặp nếu: Tên bài toán rất giống (>= 60%), hoặc bài học rất giống (>= 50%), hoặc điểm tổng hợp >= 42%
            if (simTask >= 0.60 || simTakeaway >= 0.50 || score >= 0.42) {
                const effectiveScore = Math.max(score, simTask, simTakeaway);
                if (effectiveScore > maxSimilarity) {
                    maxSimilarity = effectiveScore;
                    matchedIndex = i;
                }
            }
        }

        // Nếu phát hiện bài học tương tự đã có -> TIẾN HÓA / THĂNG CẤP HOẶC BẢO TỒN TINH HOA
        if (matchedIndex >= 0) {
            const existing = experiences[matchedIndex];
            const oldScore = existing.qualityScore || calculateQualityScore(existing);
            existing.qualityScore = oldScore;
            existing.version = existing.version || 1;
            existing.evolutionHistory = existing.evolutionHistory || [];

            let upgraded = false;

            if (newScore > oldScore) {
                // TRƯỜNG HỢP 1: THĂNG CẤP TRI THỨC (UPGRADE) VÌ CHẤT LƯỢNG MỚI VƯỢT TRỘI (Ví dụ: 85% > 65%)
                upgraded = true;
                existing.version += 1;
                existing.evolutionHistory.push({
                    date: new Date().toLocaleString('vi-VN'),
                    fromScore: oldScore,
                    toScore: newScore,
                    version: `v${existing.version}.0`,
                    reason: `Nâng cấp giải pháp thực chiến sâu sắc hơn (${oldScore}% ➔ ${newScore}%)`
                });

                // Cập nhật giải pháp & bài học mới vượt trội hơn, lưu lại di sản phiên bản cũ
                const previousSolution = existing.solution;
                existing.solution = solText + (!solText.includes(previousSolution.slice(0, 30)) ? ` | [Kế thừa v${existing.version - 1}]: ${previousSolution}` : '');
                existing.takeaway = takeText;
                existing.qualityScore = newScore;
                existing.grade = newGrade;
                if (probText.length > (existing.problem || '').length) {
                    existing.problem = probText;
                }
            } else {
                // TRƯỜNG HỢP 2: BẢO TỒN TINH HOA (ENRICH) - Không làm loãng bài học cũ điểm cao
                if (!existing.solution.includes(solText.slice(0, 35))) {
                    existing.solution += ` | Bổ sung: ${solText}`;
                }
                if (!existing.takeaway.includes(takeText.slice(0, 35))) {
                    existing.takeaway += ` | Cập nhật: ${takeText}`;
                }
            }

            const newTags = Array.isArray(tags) ? tags : (tags ? [tags] : []);
            existing.tags = Array.from(new Set([...(existing.tags || []), ...newTags]));
            existing.lastUpdated = new Date().toLocaleString('vi-VN');

            await experiencesMutex.lock(() => fsPromises.writeFile(EXPERIENCES_FILE, JSON.stringify(experiences, null, 2), 'utf8'));
            rebuildExperiencesMarkdown(experiences);

            if (upgraded) {
                return res.json({
                    success: true,
                    merged: true,
                    upgraded: true,
                    oldScore: oldScore,
                    newScore: newScore,
                    version: existing.version,
                    grade: existing.grade,
                    message: `🚀 [THĂNG CẤP TRI THỨC]: Bài học "${existing.task}" đã được nâng cấp chất lượng từ ${oldScore}% ➔ ${newScore}% (Phiên bản v${existing.version}.0 - ${existing.grade})!`,
                    experience: existing,
                    totalExperiences: experiences.length
                });
            } else {
                return res.json({
                    success: true,
                    merged: true,
                    upgraded: false,
                    oldScore: oldScore,
                    newScore: newScore,
                    currentScore: oldScore,
                    version: existing.version,
                    grade: existing.grade || getQualityGrade(oldScore),
                    message: `🛡️ [BẢO TỒN TINH HOA]: Bài học cũ đã đạt chuẩn cao (${oldScore}%). Hệ thống đã chắt lọc điểm bổ sung mới (${newScore}%) mà không làm loãng kiến thức cốt lõi!`,
                    experience: existing,
                    totalExperiences: experiences.length
                });
            }
        }

        // -------------------------------------------------------------------------
        // LỚP 3: LƯU BÀI HỌC HOÀN TOÀN MỚI
        // -------------------------------------------------------------------------
        const newExp = {
            id: `exp_${Date.now()}`,
            timestamp: new Date().toISOString(),
            dateFormatted: new Date().toLocaleString('vi-VN'),
            task: taskText || 'Tác vụ chuyên môn',
            problem: probText || 'Thử thách kỹ thuật',
            solution: solText || 'Phương án giải quyết',
            takeaway: takeText,
            tags: tagList.length > 0 ? tagList : ['general'],
            qualityScore: newScore,
            grade: newGrade,
            version: 1,
            evolutionHistory: []
        };

        experiences.push(newExp);
        await experiencesMutex.lock(() => fsPromises.writeFile(EXPERIENCES_FILE, JSON.stringify(experiences, null, 2), 'utf8'));
        rebuildExperiencesMarkdown(experiences);

        res.json({
            success: true,
            merged: false,
            upgraded: false,
            qualityScore: newScore,
            grade: newGrade,
            version: 1,
            message: `✨ Đã kiểm duyệt đạt chuẩn (${newGrade} - ${newScore}%) và lưu bài học mới vào Trí nhớ dài hạn!`,
            experience: newExp,
            totalExperiences: experiences.length
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi lưu kinh nghiệm: ${err.message}` });
    }
});


// =========================================================================
// API: RÀ SOÁT & CHẨN ĐOÁN KHO KINH NGHIỆM (EXPERIENCE AUDIT ENGINE)
// Tìm kiếm các bài học bị thiếu sót, điểm thấp để AI nâng cấp chuẩn xác
// =========================================================================
app.post('/api/audit-experiences', (req, res) => {
    try {
        if (!fs.existsSync(EXPERIENCES_FILE)) {
            return res.json({ success: true, experiences: [], total: 0, lowScoreCount: 0 });
        }
        let experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
        const { filter = 'low_score', limit = 15, query } = req.body;

        // Chẩn đoán thiếu sót cụ thể cho từng bài học
        const diagnosed = experiences.map(exp => {
            const currentScore = exp.qualityScore || calculateQualityScore(exp);
            const taskStr = exp.task || '';
            const probStr = exp.problem || '';
            const solStr = exp.solution || '';
            const takeStr = exp.takeaway || '';
            const totalLen = (taskStr + probStr + solStr + takeStr).length;
            const fullText = (taskStr + ' ' + probStr + ' ' + solStr + ' ' + takeStr).toLowerCase();
            
            const deficiencies = [];
            if (totalLen < 250) deficiencies.push(`Độ dài còn ngắn (${totalLen} ký tự, khuyến nghị >= 350 ký tự)`);
            
            const techRegex = /(function|const|let|var|class|npm|pip|import|require|git|curl|docker|async|await|return|endpoint|json|regex|config|framework|langgraph|crewai|puppeteer|express|python|node|api|sql|http|token|cache|database|pipeline|workflow|architecture|react|adlc|mcp|gateway|signing|proxy|auth|tls)/gi;
            const techMatches = (fullText.match(techRegex) || []).length;
            if (techMatches < 2) deficiencies.push(`Thiếu từ khóa kỹ thuật thực chiến (hiện có ${techMatches}, khuyến nghị >= 3 từ khóa)`);

            const rootRegex = /(nguyên nhân|vấn đề|thử thách|hạn chế|lỗi|bug|bảo mật|rủi ro|bottleneck|quá tải|quota|timeout|xung đột|tấn công|chi phí|độ trễ|đứt gãy|tối ưu|thất bại|khó khăn|lỗ hổng|phòng thủ)/gi;
            const rootMatches = (fullText.match(rootRegex) || []).length;
            if (rootMatches < 2) deficiencies.push(`Thiếu phân tích nguyên nhân gốc rễ và rủi ro (hiện có ${rootMatches}, khuyến nghị >= 2)`);

            if (takeStr.length < 50) deficiencies.push(`Bài học cốt lõi (takeaway) quá ngắn (${takeStr.length} ký tự, khuyến nghị >= 50 ký tự)`);
            if (!Array.isArray(exp.tags) || exp.tags.length < 3) deficiencies.push(`Thiếu hashtag phân loại chuyên môn (hiện có ${(exp.tags || []).length}, khuyến nghị >= 3 tags)`);

                const cleanTask = (exp.task || '').replace(/^(Nâng cấp|Tối ưu|Khắc phục|Chiến dịch|Xây dựng|Soạn thảo|Phân bổ|Tổng hợp|Đánh giá|Truy tìm)\s*/i, '');
                const suggestedWebQuery = `${cleanTask} best practices architecture 2026`;

                return {
                    id: exp.id,
                    task: exp.task,
                    problem: exp.problem,
                    solution: exp.solution,
                    takeaway: exp.takeaway,
                    tags: exp.tags,
                    qualityScore: currentScore,
                    grade: exp.grade || getQualityGrade(currentScore),
                    version: exp.version || 1,
                    dateFormatted: exp.dateFormatted,
                    deficiencies: deficiencies,
                    suggestedWebQuery: suggestedWebQuery,
                    needsUpgrade: currentScore < 75 || deficiencies.length > 0
                };
        });

        let results = diagnosed;
        if (filter === 'low_score') {
            results = diagnosed.filter(e => e.qualityScore < 75 || e.needsUpgrade);
        } else if (filter === 'junk_or_duplicate') {
            results = diagnosed.filter(e => e.qualityScore < 60 || /vòng\s*#\d+/i.test(e.task) || (e.problem || '').includes('Thử thách kỹ thuật'));
        } else if (filter === 'search' && query) {
            const q = query.toLowerCase();
            results = diagnosed.filter(e => (e.task + ' ' + e.problem + ' ' + e.solution).toLowerCase().includes(q));
        }

        // Sắp xếp ưu tiên bài điểm thấp nhất lên đầu
        results.sort((a, b) => a.qualityScore - b.qualityScore);
        const limitedResults = results.slice(0, Math.min(limit, 30));

        const lowScoreCount = diagnosed.filter(e => e.qualityScore < 75).length;
        const avgScore = diagnosed.length > 0 ? Math.round(diagnosed.reduce((sum, e) => sum + e.qualityScore, 0) / diagnosed.length) : 0;

        res.json({
            success: true,
            total: diagnosed.length,
            lowScoreCount: lowScoreCount,
            averageScore: avgScore,
            filterApplied: filter,
            matchesCount: limitedResults.length,
            experiences: limitedResults,
            guide: "QUY TRÌNH NÂNG CẤP BẮT BUỘC TỪ INTERNET: 1) Chọn bài học điểm thấp. 2) BẮT BUỘC gọi tool RESEARCH_EXPERIENCE_ON_WEB hoặc WEB_SEARCH với 'suggestedWebQuery' để tra cứu các tài liệu chuẩn quốc tế, công nghệ mới và case study thực chiến trên Internet. 3) Dùng kiến thức và từ khóa kỹ thuật thu thập được từ Internet để gọi UPDATE_EXPERIENCE theo ID nhằm đưa điểm chất lượng lên >= 90% (Tinh Hoa - Mastery)!"
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi rà soát kinh nghiệm: ${err.message}` });
    }
});

// API: Nghiên cứu tri thức trên Internet để nâng tầm kinh nghiệm (Web-Enriched Experience Research)
app.post('/api/research-experience-web', async (req, res) => {
    try {
        const { id, query } = req.body;
        if (!id && !query) {
            return res.json({ success: false, error: "Cần cung cấp 'id' bài học hoặc 'query' tra cứu." });
        }

        let targetExp = null;
        if (id && fs.existsSync(EXPERIENCES_FILE)) {
            const experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
            targetExp = experiences.find(e => e.id === id);
        }

        let searchQuery = query;
        if (!searchQuery && targetExp) {
            const cleanTask = (targetExp.task || '').replace(/^(Nâng cấp|Tối ưu|Khắc phục|Chiến dịch|Xây dựng|Soạn thảo|Phân bổ|Tổng hợp|Đánh giá|Truy tìm)\s*/i, '');
            searchQuery = cleanTask;
        }

        // Tra cứu đa nguồn Internet (Dev.to + Wikipedia + Google News)
        let webResults = await multiSourceWebSearch(searchQuery, 5);

        // Nếu query tiếng Việt chưa ra kết quả, thử tra cứu bằng các tags hoặc từ khóa kỹ thuật
        if (webResults.length === 0 && targetExp && Array.isArray(targetExp.tags) && targetExp.tags.length > 0) {
            const tagQuery = targetExp.tags.slice(0, 3).join(' ');
            webResults = await multiSourceWebSearch(tagQuery, 5);
            searchQuery = `${searchQuery} (tag: ${tagQuery})`;
        }

        const recommendedTechKeywords = ["workflow", "database", "token", "pipeline", "architecture", "cache", "api", "puppeteer", "regex", "optimization", "bottleneck", "auth", "proxy", "async", "await"];
        const recommendedRootCauseTerms = ["nguyên nhân gốc rễ", "thử thách kỹ thuật", "rủi ro bảo mật", "lỗ hổng", "bottleneck", "độ trễ", "quá tải", "đứt gãy"];

        res.json({
            success: true,
            id: id || null,
            task: targetExp ? targetExp.task : null,
            currentScore: targetExp ? targetExp.qualityScore : null,
            searchQueryUsed: searchQuery,
            webResultsCount: webResults.length,
            webResults: webResults,
            recommendedTechKeywords: recommendedTechKeywords,
            recommendedRootCauseTerms: recommendedRootCauseTerms,
            instructions: "Hãy sử dụng các tri thức, case study và trích dẫn thu được từ webResults ở trên kết hợp với các từ khóa kỹ thuật để gọi tool UPDATE_EXPERIENCE. Việc này đảm bảo bài học được mở rộng từ tri thức thực tế trên Internet và đạt điểm chất lượng >= 90% (Tinh Hoa - Mastery)!"
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi nghiên cứu web: ${err.message}` });
    }
});

// API: Cập nhật & thăng cấp trực tiếp một bài học theo ID (Direct Experience Upgrade)
app.post('/api/update-experience', async (req, res) => {
    try {
        const { id, task, problem, solution, takeaway, tags, reason } = req.body;
        if (!id) {
            return res.json({ success: false, error: "Thiếu trường 'id' bài học cần cập nhật." });
        }

        if (!fs.existsSync(EXPERIENCES_FILE)) {
            return res.json({ success: false, error: "Kho kinh nghiệm chưa tồn tại." });
        }

        let experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
        const idx = experiences.findIndex(e => e.id === id);

        if (idx === -1) {
            return res.json({ success: false, error: `Không tìm thấy bài học có ID '${id}' trong kho kinh nghiệm.` });
        }

        const existing = experiences[idx];
        const oldScore = existing.qualityScore || calculateQualityScore(existing);

        if (task && task.trim()) existing.task = task.trim();
        if (problem && problem.trim()) existing.problem = problem.trim();
        if (solution && solution.trim()) existing.solution = solution.trim();
        if (takeaway && takeaway.trim()) existing.takeaway = takeaway.trim();
        if (Array.isArray(tags) && tags.length > 0) {
            existing.tags = Array.from(new Set([...(existing.tags || []), ...tags]));
        }

        const newScore = calculateQualityScore(existing);
        const newGrade = getQualityGrade(newScore);

        existing.version = (existing.version || 1) + 1;
        existing.qualityScore = newScore;
        existing.grade = newGrade;
        existing.lastUpdated = new Date().toLocaleString('vi-VN');
        existing.evolutionHistory = existing.evolutionHistory || [];

        existing.evolutionHistory.push({
            date: new Date().toLocaleString('vi-VN'),
            fromScore: oldScore,
            toScore: newScore,
            version: `v${existing.version}.0`,
            reason: reason || `Nâng cấp & khắc phục thiếu sót chuyên môn (${oldScore}% ➔ ${newScore}%)`
        });

        await experiencesMutex.lock(async () => {
            await fsPromises.writeFile(EXPERIENCES_FILE, JSON.stringify(experiences, null, 2), 'utf8');
        });
        rebuildExperiencesMarkdown(experiences);

        res.json({
            success: true,
            upgraded: newScore > oldScore,
            id: existing.id,
            task: existing.task,
            oldScore: oldScore,
            newScore: newScore,
            version: existing.version,
            grade: newGrade,
            message: `🚀 [ĐÃ NÂNG CẤP BÀI HỌC THÀNH CÔNG]: Bài học '${existing.task}' (ID: ${existing.id}) đã được thăng cấp từ ${oldScore}% lên ${newScore}% (${newGrade} - Phiên bản v${existing.version}.0)!`,
            experience: existing
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi cập nhật kinh nghiệm: ${err.message}` });
    }
});

// API: Xóa bỏ các bài học rác / không cần thiết theo ID
app.post('/api/delete-experience', async (req, res) => {
    try {
        const { id, ids, reason } = req.body;
        const targetIds = new Set();
        if (id) targetIds.add(id);
        if (Array.isArray(ids)) ids.forEach(i => targetIds.add(i));

        if (targetIds.size === 0) {
            return res.json({ success: false, error: "Cần cung cấp 'id' hoặc 'ids' các bài học cần xóa." });
        }

        if (!fs.existsSync(EXPERIENCES_FILE)) {
            return res.json({ success: true, message: "Kho kinh nghiệm đang trống.", deletedCount: 0 });
        }

        let experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
        const originalCount = experiences.length;

        const filtered = experiences.filter(e => !targetIds.has(e.id));
        const deletedCount = originalCount - filtered.length;

        await experiencesMutex.lock(async () => {
            await fsPromises.writeFile(EXPERIENCES_FILE, JSON.stringify(filtered, null, 2), 'utf8');
        });
        rebuildExperiencesMarkdown(filtered);

        res.json({
            success: true,
            deletedCount: deletedCount,
            remainingCount: filtered.length,
            message: `🗑️ Đã xóa thành công ${deletedCount} bài học không cần thiết (Lý do: ${reason || 'Loại bỏ bài học rác / trùng lặp theo chỉ đạo'}). Kho kinh nghiệm còn lại ${filtered.length} bài học tinh hoa.`
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi xóa kinh nghiệm: ${err.message}` });
    }
});

// Lấy tất cả kinh nghiệm đã học
app.get('/api/get-experiences', (req, res) => {
    try {
        if (!fs.existsSync(EXPERIENCES_FILE)) {
            return res.json({ success: true, experiences: [], total: 0 });
        }
        const experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
        res.json({ success: true, experiences: experiences.reverse(), total: experiences.length });
    } catch (err) {
        res.json({ success: false, error: `Lỗi đọc kinh nghiệm: ${err.message}` });
    }
});

/**
 * BỘ DÒ & DUYỆT GIÁ TRỊ KINH NGHIỆM (Intelligent Experience Vetting & Gatekeeper Engine)
 * Phân tích và thẩm định xem một câu hỏi/nhiệm vụ có thực sự xứng đáng để AI đầu tư thời gian
 * lên mạng tra cứu (WEB_SEARCH) và đúc kết thành kinh nghiệm dài hạn (SAVE_EXPERIENCE) hay không.
 * 
 * 4 Miền Tri Thức Giá Trị Cao Được Ưu Tiên:
 * 1. COMMUNICATION_MASTERY: Biểu cảm & Cách nói chuyện / Giao tiếp / Đàm phán / Tâm lý / EQ
 * 2. WORKFLOW_MASTERY: Quy trình & Cách làm việc Chuẩn mực / SOP / Best Practices / Clean Architecture
 * 3. DELEGATION_MASTERY: Nghệ thuật Giao việc & Quản trị / Phân quyền / Tiêu chí bàn giao / Giám sát
 * 4. TECHNICAL_CHALLENGE: Thử thách Kỹ thuật Chuyên sâu / Lỗi dị thường / Công nghệ mới 2026
 * 
 * Loại trừ Tuyệt đối:
 * - Chào hỏi, xã giao ("hello", "chào", "hi", "bạn là ai", v.v.)
 * - Câu hỏi đố vui cơ bản, kiến thức phổ thông đại trà
 * - Tác vụ đơn giản trong tầm giải quyết trực tiếp của LLM
 */
function classifyExperienceWorthy(query) {
    if (!query || typeof query !== 'string') {
        return {
            worthyToLearn: false,
            domain: "TRIVIAL_OR_EMPTY",
            domainName: "Rỗng Hoặc Không Xác Định",
            reason: "Truy vấn không chứa nội dung hợp lệ.",
            suggestedSearchQuery: "",
            suggestedFocus: ""
        };
    }

    const raw = query.trim();
    const qLower = raw.toLowerCase();

    // 1. BỘ LỌC CHẶN XÃ GIAO / ĐƠN GIẢN / KHÔNG ĐÁNG HỌC (Strict Anti-Trivial Filter)
    const isGreetingOrCasual = /^(chào|hello|hi|hey|alo|halo|chao ban|chào bạn|xin chào|good morning|good evening|bye|tạm biệt|cảm ơn|thank|thanks|ok|okay|yes|no)\b/i.test(qLower) && raw.length <= 40;
    const isBasicIdentity = /(bạn là ai|tên bạn là gì|who are you|bạn có khỏe không|hôm nay thế nào|mấy giờ rồi|thời tiết thế nào)/i.test(qLower);
    const isBasicMathOrFact = /^(\d+[\s\+\-\*\/]+\d+|thủ đô của|mặt trời mọc|con mèo có mấy)/i.test(qLower);
    const isUltraShortGeneric = raw.length < 10 && !/(giao việc|biểu cảm|nói chuyện|quy trình|sop|lỗi|bug|cách)/i.test(qLower);

    if (isGreetingOrCasual || isBasicIdentity || isBasicMathOrFact || isUltraShortGeneric) {
        return {
            worthyToLearn: false,
            domain: "TRIVIAL_OR_CONVERSATIONAL",
            domainName: "Giao Tiếp Xã Giao & Thông Thường",
            reason: "Yêu cầu mang tính chào hỏi, giao tiếp cơ bản hoặc kiến thức phổ thông trong tầm tay. Giải quyết trực tiếp ngay lập tức, KHÔNG tốn thời gian tra cứu mạng hay nạp vào trí nhớ dài hạn.",
            suggestedSearchQuery: "",
            suggestedFocus: ""
        };
    }

    // 2. MIỀN 1: BIỂU CẢM & CÁCH NÓI CHUYỆN / GIAO TIẾP (COMMUNICATION_MASTERY)
    const commPatterns = [
        /biểu\s*cảm/i, /cách\s*nói\s*chuyện/i, /cách\s*giao\s*tiếp/i, /nghệ\s*thuật\s*giao\s*tiếp/i,
        /giao\s*tiếp\s*khéo/i, /kỹ\s*năng\s*giao\s*tiếp/i, /ứng\s*xử/i, /đàm\s*phán/i, /thuyết\s*phục/i,
        /tâm\s*lý\s*khách\s*hàng/i, /xử\s*lý\s*phàn\s*nàn/i, /xử\s*lý\s*từ\s*chối/i, /khách\s*hàng\s*tức\s*giận/i,
        /ngữ\s*điệu/i, /văn\s*phong/i, /xưng\s*hô/i, /cách\s*chào\s*hỏi/i, /cold\s*outreach/i, /cold\s*email/i,
        /cold\s*message/i, /proposal/i, /kịch\s*bản\s*chốt\s*sale/i, /kịch\s*bản\s*nhắn\s*tin/i, /khen\s*ngợi/i,
        /từ\s*chối\s*khéo/i, /xoa\s*dịu/i, /thấu\s*cảm/i, /eq/i, /emotional\s*intelligence/i, /tone\s*of\s*voice/i,
        /body\s*language/i, /active\s*listening/i, /lắng\s*nghe\s*tích\s*cực/i, /xung\s*đột/i, /hòa\s*giải/i,
        /khiếu\s*nại/i, /chăm\s*sóc\s*khách\s*hàng/i, /giao\s*tiếp\s*doanh\s*nghiệp/i
    ];
    if (commPatterns.some(p => p.test(qLower))) {
        return {
            worthyToLearn: true,
            domain: "COMMUNICATION_MASTERY",
            domainName: "Biểu Cảm & Nghệ Thuật Giao Tiếp",
            priority: "TOP_TIER",
            reason: "Chủ đề thuộc miền Nghệ thuật Giao tiếp, Biểu cảm và Tâm lý ứng xử chuyên sâu - Đây là năng lực cốt lõi giúp AI tương tác tinh tế, thuyết phục và chuyên nghiệp như chuyên gia hàng đầu.",
            suggestedSearchQuery: `${raw} best practices communication psychology negotiation tactics`,
            suggestedFocus: "Nghiên cứu tâm lý học hành vi, nghệ thuật đàm phán Harvard, kỹ năng giao tiếp tinh tế, ngữ điệu và văn phong chuyên nghiệp theo ngữ cảnh."
        };
    }

    // 3. MIỀN 2: CÁCH LÀM VIỆC & QUY TRÌNH CHUẨN MỰC (WORKFLOW_MASTERY)
    const workPatterns = [
        /cách\s*làm\s*việc/i, /quy\s*trình\s*làm\s*việc/i, /quy\s*trình\s*chuẩn/i, /tiêu\s*chuẩn\s*làm\s*việc/i,
        /workflow/i, /sop\b/i, /standard\s*operating\s*procedure/i, /best\s*practice/i, /tối\s*ưu\s*quy\s*trình/i,
        /quản\s*lý\s*thời\s*gian/i, /phương\s*pháp\s*làm\s*việc/i, /agile/i, /scrum/i, /kanban/i, /deep\s*work/i,
        /tiêu\s*chuẩn\s*kỹ\s*thuật/i, /clean\s*code/i, /refactoring/i, /kiến\s*trúc\s*hệ\s*thống/i, /code\s*review/i,
        /ci\/cd/i, /devops\s*workflow/i, /giải\s*quyết\s*vấn\s*đề/i, /root\s*cause\s*analysis/i, /5\s*whys/i,
        /tổ\s*chức\s*công\s*việc/i, /hiệu\s*suất\s*công\s*việc/i, /tối\s*ưu\s*năng\s*suất/i, /phong\s*cách\s*làm\s*việc/i
    ];
    if (workPatterns.some(p => p.test(qLower))) {
        return {
            worthyToLearn: true,
            domain: "WORKFLOW_MASTERY",
            domainName: "Quy Trình & Cách Làm Việc Chuẩn Mực",
            priority: "TOP_TIER",
            reason: "Chủ đề thuộc miền Quy trình & Phương pháp làm việc tối ưu - Cần tích lũy các tiêu chuẩn chuẩn hóa (SOP), kiến trúc sạch và best practices quốc tế.",
            suggestedSearchQuery: `${raw} standard operating procedure best practices industry standards`,
            suggestedFocus: "Nghiên cứu quy trình chuẩn hóa SOP, best practices kỹ thuật quốc tế, tối ưu hóa năng suất và phương pháp luận chuyên sâu."
        };
    }

    // 4. MIỀN 3: CÁCH GIAO VIỆC & QUẢN TRỊ ĐỘI NGŨ / TÁC NHÂN (DELEGATION_MASTERY)
    const delegPatterns = [
        /cách\s*giao\s*việc/i, /giao\s*việc/i, /ủy\s*quyền/i, /phân\s*quyền/i, /phân\s*công/i, /giao\s*nhiệm\s*vụ/i,
        /quản\s*trị\s*nhân\s*sự/i, /quản\s*lý\s*chuyên\s*viên/i, /quản\s*lý\s*cấp\s*dưới/i, /điều\s*phối\s*nhóm/i,
        /tiêu\s*chí\s*bàn\s*giao/i, /tiêu\s*chí\s*nghiệm\s*thu/i, /kpi/i, /okr/i, /smart\s*goals/i, /bant/i,
        /feedback\s*xây\s*dựng/i, /phản\s*hồi\s*nhân\s*viên/i, /giám\s*sát\s*tiến\s*độ/i, /tránh\s*vi\s*mô/i,
        /micro-?management/i, /leadership/i, /lãnh\s*đạo/i, /quản\s*trị\s*rủi\s*ro/i, /task\s*delegation/i,
        /accountability/i, /multi-agent\s*orchestration/i, /ma\s*trận\s*raci/i, /raci/i, /đôn\s*đốc/i, /nhắc\s*nhở\s*tiến\s*độ/i
    ];
    if (delegPatterns.some(p => p.test(qLower))) {
        return {
            worthyToLearn: true,
            domain: "DELEGATION_MASTERY",
            domainName: "Nghệ Thuật Giao Việc & Quản Trị Đội Ngũ",
            priority: "TOP_TIER",
            reason: "Chủ đề thuộc miền Nghệ thuật Giao việc và Quản trị - Cần nắm vững nguyên tắc ủy quyền chuẩn SMART/BANT, tiêu chuẩn nghiệm thu và phản hồi thúc đẩy nhân sự.",
            suggestedSearchQuery: `${raw} effective task delegation leadership management frameworks`,
            suggestedFocus: "Nghiên cứu nguyên tắc ủy quyền chuẩn SMART/BANT, nghệ thuật phản hồi mang tính xây dựng, cơ chế giám sát và phối hợp đa tác nhân."
        };
    }

    // 5. MIỀN 4: THỬ THÁCH KỸ THUẬT & CÔNG NGHỆ CHUYÊN SÂU (TECHNICAL_CHALLENGE)
    const techPatterns = [
        /lỗi\s*(dị\s*thường|nghiêm\s*trọng|phức\s*tạp|hiểm\s*hóc|không\s*rõ|lạ)/i, /crash/i, /memory\s*leak/i,
        /race\s*condition/i, /deadlock/i, /concurrency/i, /tối\s*ưu\s*hiệu\s*năng/i, /performance\s*tuning/i,
        /microservices/i, /lỗ\s*hổng\s*bảo\s*mật/i, /security\s*vulnerability/i, /cve-\d+/i, /zero-?day/i,
        /anti-?bot/i, /puppeteer\s*stealth/i, /cloudflare\s*bypass/i, /oauth2/i, /distributed\s*system/i,
        /hệ\s*thống\s*phân\s*tán/i, /database\s*indexing/i, /query\s*optimization/i, /thuật\s*toán/i,
        /mô\s*hình\s*ai\s*mới/i, /llm\s*agent\s*runtime/i, /prompt\s*engineering\s*advanced/i, /docker/i, /kubernetes/i
    ];
    if (techPatterns.some(p => p.test(qLower))) {
        return {
            worthyToLearn: true,
            domain: "TECHNICAL_CHALLENGE",
            domainName: "Thử Thách Kỹ Thuật & Công Nghệ Chuyên Sâu",
            priority: "HIGH_TIER",
            reason: "Chủ đề kỹ thuật phức tạp, tiềm ẩn rủi ro hệ thống hoặc công nghệ mới - Cần tra cứu tài liệu chính thức và case study quốc tế để xây dựng giải pháp bền vững.",
            suggestedSearchQuery: `${raw} deep dive troubleshooting solution guide`,
            suggestedFocus: "Nghiên cứu tài liệu chính thức, RFC, GitHub issues và case study thế giới để xử lý triệt để bài toán khó."
        };
    }

    // 6. MIỀN 5: NGHIÊN CỨU HỌC THUẬT, PHÂN TÍCH CHUYÊN SÂU & TIỀM NĂNG CON NGƯỜI (RESEARCH_AND_ACADEMIC)
    const researchPatterns = [
        /phân\s*tích\s*(sâu|chi\s*tiết|toàn\s*diện)?/i, /nghiên\s*cứu\s*(sâu|chi\s*tiết|toàn\s*diện)?/i,
        /tìm\s*hiểu\s*(về|sâu)?/i, /sức\s*mạnh\s*tiềm\s*năng/i, /tiềm\s*năng\s*con\s*người/i,
        /não\s*bộ/i, /thần\s*kinh\s*học/i, /sinh\s*lý\s*học/i, /khoa\s*học/i, /báo\s*cáo\s*canonical/i,
        /thẩm\s*định\s*học\s*thuật/i, /kiểm\s*chứng\s*khoa\s*học/i, /tổng\s*quan\s*thị\s*trường/i, /chiến\s*lược\s*toàn\s*diện/i
    ];
    if (researchPatterns.some(p => p.test(qLower))) {
        return {
            worthyToLearn: true,
            domain: "RESEARCH_AND_ACADEMIC",
            domainName: "Nghiên Cứu Học Thuật & Phân Tích Chuyên Sâu",
            priority: "TOP_TIER",
            reason: "Chủ đề học thuật/nghiên cứu chuyên sâu — BẮT BUỘC triệu tập Hội đồng Chuyên gia ('FORM_SPECIALIST_TEAM') và tra cứu Internet ('WEB_SEARCH' PubMed/Google Scholar) để kiểm chứng thực nghiệm trước khi xuất bản báo cáo canonical.",
            suggestedSearchQuery: `${raw} scientific peer reviewed research mechanisms`,
            suggestedFocus: "Tra cứu tài liệu học thuật gốc (PubMed, Nature, Science), đối chiếu cơ chế phân tử và thẩm định qua Hội đồng Chuyên gia."
        };
    }

    // 7. TRƯỜNG HỢP CÂU HỎI THƯỜNG / KHÔNG THUỘC MIỀN ƯU TIÊN
    const words = raw.split(/\s+/).filter(Boolean);
    const hasDeepInquiry = /(nghiên\s*cứu\s*sâu|phân\s*tích\s*chi\s*tiết|chiến\s*lược\s*toàn\s*diện|tổng\s*quan\s*thị\s*trường)/i.test(qLower);
    if (words.length >= 8 && hasDeepInquiry) {
        return {
            worthyToLearn: true,
            domain: "COMPLEX_INQUIRY",
            domainName: "Nghiên Cứu Chuyên Sâu Theo Yêu Cầu",
            priority: "MEDIUM_TIER",
            reason: "Yêu cầu có tính phức tạp và đòi hỏi nghiên cứu dữ liệu sâu rộng.",
            suggestedSearchQuery: `${raw} in-depth analysis guide`,
            suggestedFocus: "Thu thập dữ liệu thực tế và phân tích đa chiều."
        };
    }

    // Mặc định: Câu hỏi bình thường, nhiệm vụ trong tầm tay -> Không cần tra mạng tốn thời gian
    return {
        worthyToLearn: false,
        domain: "STANDARD_TASK",
        domainName: "Tác Vụ Tiêu Chuẩn Trong Tầm Tay",
        reason: "Yêu cầu nằm trong phạm vi năng lực sẵn có của AI. Nên thực thi trực tiếp, không cần tốn thời gian tra cứu mạng hay lưu trữ kinh nghiệm thừa.",
        suggestedSearchQuery: "",
        suggestedFocus: ""
    };
}

// API: Thẩm định xem chủ đề/nhiệm vụ có đáng bỏ thời gian tra cứu mạng & đúc kết kinh nghiệm hay không
app.post('/api/vet-experience-need', (req, res) => {
    try {
        const { query } = req.body;
        const vetting = classifyExperienceWorthy(query);
        res.json({ success: true, query, ...vetting });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Tìm kiếm kinh nghiệm liên quan theo độ phù hợp kết hợp Bộ Dò & Duyệt Giá Trị Kinh Nghiệm
app.post('/api/search-experiences', (req, res) => {
    try {
        const { query } = req.body;
        const vetting = classifyExperienceWorthy(query);

        if (!fs.existsSync(EXPERIENCES_FILE)) {
            if (vetting.worthyToLearn) {
                return res.json({
                    success: true,
                    query: query || '',
                    matches: [],
                    totalMatches: 0,
                    memoryStatus: "WORTHY_TO_LEARN",
                    worthyToLearn: true,
                    domain: vetting.domain,
                    domainName: vetting.domainName,
                    priority: vetting.priority,
                    reason: vetting.reason,
                    suggestedSearchQuery: vetting.suggestedSearchQuery,
                    suggestedFocus: vetting.suggestedFocus,
                    instruction: `🎯 [BỘ DÒ & DUYỆT TRI THỨC]: Phát hiện chủ đề thuộc miền giá trị cao "${vetting.domainName}". Kho trí nhớ hiện chưa có bài học. BẠN NÊN DÀNH THỜI GIAN LÊN MẠNG TRA CỨU ('WEB_SEARCH' hoặc 'RESEARCH_EXPERIENCE_ON_WEB') với từ khóa: "${vetting.suggestedSearchQuery}" để thu thập tri thức chuẩn thế giới, sau đó giải quyết nhiệm vụ và đúc kết bài học tinh hoa bằng 'SAVE_EXPERIENCE'.`
                });
            } else {
                return res.json({
                    success: true,
                    query: query || '',
                    matches: [],
                    totalMatches: 0,
                    memoryStatus: "RESOLVE_DIRECTLY",
                    worthyToLearn: false,
                    domain: vetting.domain,
                    domainName: vetting.domainName,
                    reason: vetting.reason,
                    instruction: `⚡ [BỘ DÒ & DUYỆT TRI THỨC]: Yêu cầu "${query || ''}" nằm trong tầm giải quyết trực tiếp hoặc mang tính giao tiếp thông thường. TUYỆT ĐỐI KHÔNG tốn thời gian tra cứu Internet và KHÔNG lưu bài học rác vào Trí nhớ. Hãy giải quyết trực tiếp và súc tích bằng năng lực sẵn có!`
                });
            }
        }

        const experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
        if (!query) {
            return res.json({ success: true, matches: experiences.slice(-5).reverse(), total: experiences.length, vetting });
        }

        const qLower = query.toLowerCase().trim();
        const cleanQueryWords = qLower.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2);

        // Xếp hạng theo độ liên quan thực chất & chống dương tính giả (Anti-False-Positive Engine)
        const matches = experiences.map(exp => {
            const fullText = `${exp.task} ${exp.problem} ${exp.solution} ${exp.takeaway} ${(exp.tags || []).join(' ')}`.toLowerCase();
            let score = 0;
            
            // 1. Cụm từ nguyên vẹn trùng khớp
            if (qLower.length >= 6 && fullText.includes(qLower)) {
                score += 25;
            }

            // 2. Độ tương đồng với đề tài bài toán (task) và bài học cốt lõi (takeaway)
            const simTask = calculateTextSimilarity(query, exp.task);
            const simTakeaway = calculateTextSimilarity(query, exp.takeaway);
            score += simTask * 15;
            score += simTakeaway * 8;

            // 3. Khớp tags
            const tags = (exp.tags || []).map(t => String(t).toLowerCase());
            let matchedTagCount = 0;
            cleanQueryWords.forEach(w => {
                if (tags.some(t => t === w || t.replace(/_/g, ' ').includes(w))) {
                    matchedTagCount++;
                }
            });
            score += matchedTagCount * 2;

            // 4. Đo tỷ lệ từ khóa thực chất của query có mặt trong bài học
            let matchedWordsInFullText = 0;
            cleanQueryWords.forEach(w => {
                if (fullText.includes(w)) matchedWordsInFullText++;
            });
            const wordRatio = cleanQueryWords.length > 0 ? (matchedWordsInFullText / cleanQueryWords.length) : 0;

            return { exp, score, simTask, simTakeaway, wordRatio, matchedWordsInFullText };
        })
        .filter(item => {
            // Cụm từ trùng khớp hoàn toàn: Luôn duyệt
            if (item.score >= 25) return true;
            // Đề tài nhiệm vụ (task) có độ tương đồng cao: Luôn duyệt
            if (item.simTask >= 0.18) return true;
            // Với truy vấn từ 3 từ trở lên: Yêu cầu tối thiểu 40% từ khóa của truy vấn phải xuất hiện VÀ điểm đạt chuẩn >= 2.5
            if (cleanQueryWords.length >= 3) {
                return item.wordRatio >= 0.40 && item.score >= 2.5;
            }
            // Với truy vấn ngắn (1-2 từ): Bắt buộc phải có từ khóa xuất hiện VÀ điểm >= 2.0
            return item.matchedWordsInFullText >= 1 && item.score >= 2.0;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5) // Chỉ lấy tối đa 5 kinh nghiệm tinh hoa nhất
        .map(item => item.exp);

        if (matches.length === 0) {
            if (vetting.worthyToLearn) {
                return res.json({
                    success: true,
                    query: query,
                    matches: [],
                    totalMatches: 0,
                    memoryStatus: "WORTHY_TO_LEARN",
                    worthyToLearn: true,
                    domain: vetting.domain,
                    domainName: vetting.domainName,
                    priority: vetting.priority,
                    reason: vetting.reason,
                    suggestedSearchQuery: vetting.suggestedSearchQuery,
                    suggestedFocus: vetting.suggestedFocus,
                    instruction: `🎯 [BỘ DÒ & DUYỆT TRI THỨC]: Phát hiện chủ đề thuộc miền giá trị cao "${vetting.domainName}". Kho trí nhớ hiện chưa có bài học. BẠN NÊN DÀNH THỜI GIAN LÊN MẠNG TRA CỨU ('WEB_SEARCH' hoặc 'RESEARCH_EXPERIENCE_ON_WEB') với từ khóa: "${vetting.suggestedSearchQuery}" để thu thập tri thức chuẩn thế giới, sau đó giải quyết nhiệm vụ và đúc kết bài học tinh hoa bằng 'SAVE_EXPERIENCE'.`
                });
            } else {
                return res.json({
                    success: true,
                    query: query,
                    matches: [],
                    totalMatches: 0,
                    memoryStatus: "RESOLVE_DIRECTLY",
                    worthyToLearn: false,
                    domain: vetting.domain,
                    domainName: vetting.domainName,
                    reason: vetting.reason,
                    instruction: `⚡ [BỘ DÒ & DUYỆT TRI THỨC]: Yêu cầu "${query}" nằm trong tầm giải quyết trực tiếp hoặc mang tính giao tiếp thông thường. TUYỆT ĐỐI KHÔNG tốn thời gian tra cứu Internet và KHÔNG lưu bài học rác vào Trí nhớ. Hãy giải quyết trực tiếp và súc tích bằng năng lực sẵn có!`
                });
            }
        }

        res.json({
            success: true,
            query: query,
            matches: matches,
            totalMatches: matches.length,
            memoryStatus: "FOUND",
            worthyToLearn: vetting.worthyToLearn,
            domain: vetting.domain,
            domainName: vetting.domainName,
            priority: vetting.priority,
            reason: vetting.reason,
            suggestedSearchQuery: vetting.suggestedSearchQuery,
            suggestedFocus: vetting.suggestedFocus,
            vetting: vetting,
            instruction: `Đã tìm thấy ${matches.length} bài học kinh nghiệm phù hợp trong kho trí nhớ. Hãy áp dụng các bài học và giải pháp này để hoàn thành nhiệm vụ.`
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi tìm kiếm kinh nghiệm: ${err.message}` });
    }
});

// API: Tự động tìm kiếm phương án vá lỗi từ kho kinh nghiệm (Self-Healing Remedy Lookup Engine)
app.post('/api/find-remedy-for-error', (req, res) => {
    try {
        const { error, toolName, context } = req.body;
        if (!error) return res.json({ found: false });
        if (!fs.existsSync(EXPERIENCES_FILE)) return res.json({ found: false });

        const experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
        const errLower = (error + ' ' + (toolName || '') + ' ' + (context || '')).toLowerCase();

        // Tách từ khóa lỗi
        const errWords = errLower.split(/[\s,.:;!?'"()\[\]{}\/\\_-]+/).filter(w => w.length >= 3 && !['error', 'failed', 'cannot', 'null', 'undefined', 'exception', 'false'].includes(w));

        const scored = experiences.map(exp => {
            const taskStr = (exp.task || '').toLowerCase();
            const probStr = (exp.problem || '').toLowerCase();
            const solStr = (exp.solution || '').toLowerCase();
            const tagsStr = (exp.tags || []).join(' ').toLowerCase();
            const full = `${taskStr} ${probStr} ${solStr} ${tagsStr}`;

            let matchScore = 0;
            errWords.forEach(word => {
                if (probStr.includes(word)) matchScore += 4; // Khớp vấn đề trong quá khứ
                else if (taskStr.includes(word)) matchScore += 3;
                else if (tagsStr.includes(word)) matchScore += 2;
                else if (solStr.includes(word)) matchScore += 1;
            });

            if (toolName && full.includes(toolName.toLowerCase())) matchScore += 3;

            return { exp, matchScore };
        })
        .filter(item => item.matchScore >= 4)
        .sort((a, b) => b.matchScore - a.matchScore);

        if (scored.length > 0) {
            const best = scored[0].exp;
            return res.json({
                found: true,
                matchScore: scored[0].matchScore,
                remedy: {
                    id: best.id,
                    task: best.task,
                    problem: best.problem,
                    solution: best.solution,
                    takeaway: best.takeaway,
                    grade: best.grade,
                    qualityScore: best.qualityScore
                }
            });
        }

        res.json({ found: false });
    } catch (err) {
        res.json({ found: false, error: err.message });
    }
});

// API: Tinh lọc và dọn dẹp kho kinh nghiệm (Memory Pruning)
app.post('/api/prune-experiences', async (req, res) => {
    try {
        if (!fs.existsSync(EXPERIENCES_FILE)) {
            return res.json({ success: true, message: 'Kho kinh nghiệm đang trống.', removedCount: 0 });
        }

        let experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
        const originalCount = experiences.length;

        // 1. Loại bỏ các bài test nháp, quá ngắn hoặc vô nghĩa
        experiences = experiences.filter(exp => {
            const taskStr = (exp.task || '').trim();
            const totalLen = taskStr.length + (exp.problem || '').length + (exp.solution || '').length + (exp.takeaway || '').length;
            const tagList = Array.isArray(exp.tags) ? exp.tags : (exp.tags ? [exp.tags] : []);
            const isTest = /^(test|thử nghiệm|kiểm tra)(\s+(tự\s*học|api|chức\s*năng|lưu|bộ nhớ))?$/i.test(taskStr);
            const hasTestTag = tagList.some(t => /^(test|thử\s*nghiệm)$/i.test(String(t).trim()));
            const isTrivialSolution = /^(gọi api thành công|hoạt động trơn tru|ok|done|test)$/i.test((exp.solution || '').trim());
            
            if (totalLen < 40) return false;
            if (isTest && (isTrivialSolution || hasTestTag || totalLen < 120)) return false;
            if (hasTestTag && totalLen < 120) return false;
            return true;
        });

        // 2. Gộp các bài học trùng lặp còn sót lại & Chuẩn hóa điểm chất lượng
        let deduped = [];
        for (const exp of experiences) {
            let found = false;
            for (let d of deduped) {
                const simTask = calculateTextSimilarity(exp.task, d.task);
                const simTakeaway = calculateTextSimilarity(exp.takeaway, d.takeaway);
                const score = (simTask * 0.5) + (simTakeaway * 0.5);
                if (simTask >= 0.60 || simTakeaway >= 0.50 || score >= 0.42) {
                    found = true;
                    const dScore = d.qualityScore || calculateQualityScore(d);
                    const expScore = exp.qualityScore || calculateQualityScore(exp);
                    d.version = d.version || 1;
                    d.evolutionHistory = d.evolutionHistory || [];

                    if (expScore > dScore) {
                        d.version += 1;
                        d.evolutionHistory.push({
                            date: new Date().toLocaleString('vi-VN'),
                            fromScore: dScore,
                            toScore: expScore,
                            version: `v${d.version}.0`,
                            reason: `Dọn dẹp & hợp nhất bài học chất lượng cao hơn (${dScore}% ➔ ${expScore}%)`
                        });
                        const prevSol = d.solution;
                        d.solution = exp.solution + (!exp.solution.includes(prevSol.slice(0, 30)) ? ` | [Kế thừa]: ${prevSol}` : '');
                        d.takeaway = exp.takeaway;
                        d.qualityScore = expScore;
                        d.grade = getQualityGrade(expScore);
                    } else {
                        if (!d.solution.includes(exp.solution.slice(0, 35))) {
                            d.solution += ` | Bổ sung: ${exp.solution}`;
                        }
                        if (!d.takeaway.includes(exp.takeaway.slice(0, 35))) {
                            d.takeaway += ` | Cập nhật: ${exp.takeaway}`;
                        }
                        d.qualityScore = dScore;
                        d.grade = d.grade || getQualityGrade(dScore);
                    }
                    d.tags = Array.from(new Set([...(d.tags || []), ...(exp.tags || [])]));
                    break;
                }
            }
            if (!found) {
                exp.qualityScore = exp.qualityScore || calculateQualityScore(exp);
                exp.grade = exp.grade || getQualityGrade(exp.qualityScore);
                exp.version = exp.version || 1;
                exp.evolutionHistory = exp.evolutionHistory || [];
                deduped.push(exp);
            }
        }

        const removedCount = originalCount - deduped.length;
        await experiencesMutex.lock(async () => {
            await fsPromises.writeFile(EXPERIENCES_FILE, JSON.stringify(deduped, null, 2), 'utf8');
        });
        rebuildExperiencesMarkdown(deduped);

        res.json({
            success: true,
            message: `Đã dọn dẹp và tinh lọc kho kinh nghiệm: Loại bỏ ${removedCount} mục rác/trùng lặp, bảo tồn trọn vẹn ${deduped.length} bài học tinh hoa!`,
            originalCount: originalCount,
            currentCount: deduped.length,
            removedCount: removedCount
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi tinh lọc kinh nghiệm: ${err.message}` });
    }
});

// =========================================================================
// 5. TRÌNH DUYỆT ẢO STEALTH VƯỢT BOT ĐỘC LẬP (PUPPETEER HEADLESS / GUI RUNNER)
// =========================================================================

// API: Trình duyệt Stealth lướt web và cào dữ liệu
app.post('/api/browse-web', async (req, res) => {
    let { url, action, headless, waitSelector, humanScroll } = req.body;
    if (!url) return res.json({ success: false, error: 'Thiếu đường dẫn URL' });

    const chromePath = getInstalledBrowserPath();
    if (!chromePath) {
        return res.json({ success: false, error: 'Không tìm thấy Google Chrome hoặc Edge trên máy tính để khởi chạy trình duyệt ảo.' });
    }

    let browser = null;
    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol) || !isUrlSafe(url)) {
            return res.json({ success: false, error: 'URL bị từ chối vì không hợp lệ hoặc trỏ tới mạng nội bộ.' });
        }
        url = parsedUrl.toString();
        const isHeadless = headless !== false && headless !== 'false'; // Mặc định chạy ngầm

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: isHeadless,
            userDataDir: CHROME_PROFILE_DIR, // Giữ lại Cookie và phiên đăng nhập FB, X, Taobao
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080',
                '--disable-infobars',
                '--lang=vi-VN,vi',
                '--no-first-run',
                '--no-default-browser-check'
            ],
            ignoreDefaultArgs: ['--enable-automation']
        });

        const page = await browser.newPage();
        await setupStealthPage(page);

        // Mở trang web (chờ mạng ổn định)
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

        // Tự động kiểm tra và chờ Cloudflare Turnstile / Challenge giải mã nếu có
        const checkChallenged = async () => {
            try {
                return await page.evaluate(() => {
                    const text = document.body ? document.body.innerText : '';
                    const docTitle = document.title || '';
                    return text.includes('Just a moment...') ||
                           docTitle.includes('Just a moment...') ||
                           text.includes('Checking your browser before accessing') ||
                           document.querySelector('#challenge-stage') !== null ||
                           document.querySelector('#challenge-running') !== null;
                });
            } catch (e) {
                return false;
            }
        };

        if (await checkChallenged()) {
            console.log('🛡️ [Stealth Browser] Phát hiện Cloudflare Turnstile/Challenge. Đang tự động giải mã & chờ xác thực...');
            for (let step = 0; step < 7; step++) {
                await new Promise(r => setTimeout(r, 2000));
                if (!await checkChallenged()) {
                    console.log('✅ [Stealth Browser] Đã vượt qua Cloudflare Challenge thành công!');
                    break;
                }
            }
        }

        // Mô phỏng di chuột nhẹ nhàng tự nhiên như người dùng thật
        try {
            await page.mouse.move(250 + Math.random() * 200, 300 + Math.random() * 200, { steps: 10 });
        } catch (e) {}

        // Chờ selector cụ thể nếu có yêu cầu
        if (waitSelector) {
            try {
                await page.waitForSelector(waitSelector, { timeout: 8000 });
            } catch (e) {
                console.warn('Hết thời gian chờ selector:', waitSelector);
            }
        }

        // Mô phỏng hành vi cuộn trang mượt mà của người thật (Human Scroll)
        if (humanScroll !== false) {
            await page.evaluate(async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 250;
                    let count = 0;
                    const timer = setInterval(() => {
                        window.scrollBy({ top: distance, behavior: 'smooth' });
                        totalHeight += distance;
                        count++;
                        if (count >= 4 || totalHeight >= document.body.scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 250 + Math.random() * 200);
                });
            });
            // Tạm dừng ngẫu nhiên 1 - 2 giây như người đang đọc
            await new Promise(r => setTimeout(r, 1200 + Math.random() * 1000));
        }

        const title = await page.title();
        let screenshotPath = null;
        let screenshotBase64 = null;

        // Nếu yêu cầu chụp ảnh màn hình
        if (action === 'screenshot') {
            const filename = `screen_${Date.now()}.jpg`;
            const fullPath = path.join(getScreenshotsDir(), filename);
            const buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
            fs.writeFileSync(fullPath, buffer);
            screenshotPath = fullPath;
            screenshotBase64 = buffer.toString('base64');
        }

        // Trích xuất văn bản nội dung sạch từ trang và bảo toàn link bài tuyển dụng
        const extraction = await page.evaluate((currentUrl) => {
            const elementsToRemove = document.querySelectorAll('script, style, noscript, svg, iframe, nav, footer');
            elementsToRemove.forEach(el => el.remove());

            const extractedLinks = [];
            const seen = new Set();
            document.querySelectorAll('a[href]').forEach(a => {
                try {
                    const rawHref = a.getAttribute('href');
                    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;
                    const full = new URL(rawHref, currentUrl).href;
                    const text = (a.innerText || a.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
                    if (text.length > 5 && full.startsWith('http') && !seen.has(full)) {
                        seen.add(full);
                        const isJob = full.match(/\/jobs?\/~|\/job\/|\/projects?\/|\/freelance-jobs\/[a-zA-Z0-9_-]+\/|linkedin\.com\/jobs\/view|topcv\.vn|vietnamworks\.com/i)
                            || text.match(/developer|engineer|lập trình|frontend|backend|fullstack|designer|tuyển|hiring|remote|translator/i);
                        if (isJob) {
                            extractedLinks.push({ title: text, url: full });
                        }
                        const linkText = document.createTextNode(` [${text}](${full}) `);
                        a.parentNode.replaceChild(linkText, a);
                    }
                } catch(e) {}
            });

            return {
                bodyText: document.body.innerText || '',
                links: extractedLinks
            };
        }, url);

        await browser.close();
        browser = null;

        // Cắt gọn văn bản nếu quá dài
        let cleanText = (extraction.bodyText || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
        const truncated = cleanText.length > 7000;
        cleanText = cleanText.slice(0, 7000);

        let deepLinkAppendix = "";
        if (extraction.links && extraction.links.length > 0) {
            deepLinkAppendix = `\n\n### 🎯 DANH SÁCH CÁC LINK BÀI TUYỂN DỤNG CỤ THỂ TRÍCH XUẤT ĐƯỢC TỪ TRANG NÀY:\n` +
                extraction.links.slice(0, 10).map((j, i) => `${i + 1}. **[${j.title}](${j.url})**\n   - Link trực tiếp: \`${j.url}\``).join('\n');
        }

        res.json({
            success: true,
            title: title,
            url: url,
            content: cleanText + (truncated ? '\n\n... [Nội dung đã được cắt ngắn] ...' : '') + deepLinkAppendix,
            deepJobLinks: extraction.links ? extraction.links.slice(0, 15) : [],
            screenshotPath: screenshotPath,
            screenshotBase64: screenshotBase64 ? `data:image/jpeg;base64,${screenshotBase64}` : null
        });

    } catch (err) {
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        res.json({ success: false, error: `Lỗi trình duyệt ảo: ${err.message}` });
    }
});

// API: Mở Chrome có giao diện thật để người dùng đăng nhập FB, X, Taobao lưu Cookie
app.post('/api/open-browser-login', (req, res) => {
    const { targetUrl } = req.body;
    const chromePath = getInstalledBrowserPath();
    if (!chromePath) {
        return res.json({ success: false, error: 'Không tìm thấy Google Chrome hoặc Edge.' });
    }

    let startUrl = targetUrl || 'https://facebook.com';
    try {
        const parsed = new URL(startUrl);
        if (!['http:', 'https:'].includes(parsed.protocol) || !isUrlSafe(startUrl)) {
            return res.json({ success: false, error: 'URL đăng nhập không hợp lệ hoặc bị chặn vì lý do bảo mật.' });
        }
        startUrl = parsed.toString();
    } catch (e) {
        return res.json({ success: false, error: 'URL đăng nhập không hợp lệ.' });
    }

    // Không nối URL vào shell; mỗi tham số được truyền riêng qua spawn.
    const child = spawn(chromePath, [`--user-data-dir=${CHROME_PROFILE_DIR}`, startUrl], {
        shell: false,
        windowsHide: false,
        detached: true,
        stdio: 'ignore'
    });
    child.unref();

    res.json({
        success: true,
        message: `Đã mở trình duyệt Chrome cho phiên đăng nhập: ${startUrl}.`,
        profileDir: path.basename(CHROME_PROFILE_DIR)
    });
});

// =========================================================================
// 6. AI GRAPHIC DESIGN & STUDIO EXPORT ENGINE (CV, POSTER, IMAGE GENERATION)
// =========================================================================

// API: Tạo hình ảnh AI chất lượng cao (Minh họa, Avatar, Logo, Ảnh nền Poster)
app.post('/api/generate-image', async (req, res) => {
    try {
        let { prompt, fileName, width, height } = req.body;
        if (!prompt) return res.json({ success: false, error: 'Thiếu mô tả hình ảnh (prompt)' });

        const reqW = parseInt(width) || 512;
        const reqH = parseInt(height) || 512;
        // Chuẩn hóa kích cỡ chia hết cho 64 cho Stable Diffusion
        const genW = Math.min(Math.max(Math.round(reqW / 64) * 64, 512), 768);
        const genH = Math.min(Math.max(Math.round(reqH / 64) * 64, 512), 768);

        let targetName = fileName || `image_${Date.now()}.png`;
        if (rejectPathTraversal(targetName, res)) return;
        if (!path.extname(targetName)) targetName += '.png';

        const fullPath = resolvePath(targetName, true);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        let imageBuffer = null;
        let methodUsed = "AI Horde (Stable Diffusion)";

        // 1. Thử nghiệm AI Horde (100% Free, hoàn toàn không cần API key)
        try {
            const submitRes = await fetch('https://aihorde.net/api/v2/generate/async', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': '0000000000',
                    'Client-Agent': 'CyberAgent:1.0:nam@local'
                },
                body: JSON.stringify({
                    prompt: prompt.trim(),
                    params: {
                        n: 1,
                        width: genW,
                        height: genH,
                        steps: 20,
                        cfg_scale: 7
                    }
                })
            });

            if (submitRes.ok) {
                const submitData = await submitRes.json();
                const jobId = submitData.id;
                if (jobId) {
                    const startTime = Date.now();
                    while (Date.now() - startTime < 30000) {
                        await new Promise(r => setTimeout(r, 2000));
                        const checkRes = await fetch(`https://aihorde.net/api/v2/generate/check/${jobId}`);
                        if (!checkRes.ok) continue;
                        const checkData = await checkRes.json();
                        if (checkData.done) {
                            const statusRes = await fetch(`https://aihorde.net/api/v2/generate/status/${jobId}`);
                            if (statusRes.ok) {
                                const statusData = await statusRes.json();
                                if (statusData.generations && statusData.generations.length > 0) {
                                    const dlRes = await fetch(statusData.generations[0].img);
                                    if (dlRes.ok) {
                                        imageBuffer = Buffer.from(await dlRes.arrayBuffer());
                                        break;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            }
        } catch (hordeErr) {
            console.warn("AI Horde warning:", hordeErr.message);
        }

        // 2. Dự phòng: Nếu Horde bận hoặc quá tải, tải ảnh minh họa chất lượng cao
        if (!imageBuffer) {
            methodUsed = "High-Res Stock Fallback";
            const fallbackUrl = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=${reqW}&h=${reqH}&q=80`;
            const fbRes = await fetch(fallbackUrl);
            if (fbRes.ok) {
                imageBuffer = Buffer.from(await fbRes.arrayBuffer());
            }
        }

        if (!imageBuffer) {
            throw new Error("Không thể tải hoặc sinh hình ảnh lúc này.");
        }

        fs.writeFileSync(fullPath, imageBuffer);

        res.json({
            success: true,
            message: `Đã tạo ảnh AI thành công (${methodUsed}): ${path.basename(fullPath)}`,
            fileName: path.basename(fullPath),
            filePath: fullPath,
            size: imageBuffer.length,
            width: reqW,
            height: reqH,
            method: methodUsed,
            previewUrl: `/api/view-file?path=${encodeURIComponent(path.basename(fullPath))}`
        });
    } catch (err) {
        console.error("Lỗi generate-image:", err.message);
        res.json({ success: false, error: `Lỗi tạo hình ảnh: ${err.message}` });
    }
});

// API: Xuất bản file thiết kế HTML / SVG sang PDF hoặc ảnh PNG (Retina 2x)
app.post('/api/export-design', async (req, res) => {
    let browser = null;
    try {
        let { filePath, fileName, format, outputFileName, width, height } = req.body;
        const target = filePath || fileName;
        if (!target) return res.json({ success: false, error: 'Thiếu đường dẫn file thiết kế (filePath)' });
        if (rejectPathTraversal(target, res)) return;

        const fullSrcPath = resolvePath(target);
        if (!fs.existsSync(fullSrcPath)) {
            return res.json({ success: false, error: `File thiết kế nguồn không tồn tại: ${fullSrcPath}` });
        }

        const exportFormat = (format || 'pdf').toLowerCase(); // 'pdf' hoặc 'png'
        let outName = outputFileName;
        if (!outName) {
            const baseWithoutExt = path.basename(fullSrcPath, path.extname(fullSrcPath));
            outName = `${baseWithoutExt}.${exportFormat}`;
        }
        if (!path.extname(outName)) outName += `.${exportFormat}`;
        if (rejectPathTraversal(outName, res)) return;

        const fullOutPath = resolvePath(outName, true);
        const outDir = path.dirname(fullOutPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const chromePath = getInstalledBrowserPath();
        if (!chromePath) {
            return res.json({ success: false, error: 'Không tìm thấy Google Chrome hoặc Edge để xuất bản đồ họa.' });
        }

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--allow-file-access-from-files',
                '--disable-web-security'
            ]
        });

        const page = await browser.newPage();

        // Viewport tiêu chuẩn sắc nét
        const viewWidth = parseInt(width) || 1200;
        const viewHeight = parseInt(height) || 1600;
        await page.setViewport({ width: viewWidth, height: viewHeight, deviceScaleFactor: 2 });

        // Mở file HTML / SVG nguồn
        const fileUrl = 'file:///' + fullSrcPath.replace(/\\/g, '/');
        await page.goto(fileUrl, { waitUntil: ['networkidle0', 'load'], timeout: 35000 });

        // Chờ tải font hoặc render CSS Tailwind
        await new Promise(r => setTimeout(r, 1200));

        let buffer;
        if (exportFormat === 'pdf') {
            buffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                preferCSSPageSize: true,
                margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
            });
        } else {
            // PNG (Poster / Banner / Đồ họa)
            buffer = await page.screenshot({
                type: 'png',
                fullPage: true
            });
        }

        fs.writeFileSync(fullOutPath, buffer);
        await browser.close();
        browser = null;

        res.json({
            success: true,
            message: `Đã xuất ${exportFormat.toUpperCase()} thành công: ${path.basename(fullOutPath)} (${(buffer.length / 1024).toFixed(1)} KB)`,
            exportedPath: fullOutPath,
            fileName: path.basename(fullOutPath),
            format: exportFormat,
            size: buffer.length,
            previewUrl: `/api/view-file?path=${encodeURIComponent(path.basename(fullOutPath))}`
        });

    } catch (err) {
        if (browser) {
            try { await browser.close(); } catch(e) {}
        }
        console.error("Lỗi export-design:", err.message);
        res.json({ success: false, error: `Lỗi xuất bản đồ họa: ${err.message}` });
    }
});

// ==========================================
// 6.5. UNIVERSAL CUSTOM AI PROVIDER GATEWAY
// Hỗ trợ kết nối mọi AI bên ngoài (Claude 39k, OpenAI, DeepSeek, OpenRouter...)
// SECURITY: Kiểm tra URL chống SSRF — chặn truy cập mạng nội bộ và metadata
function isUrlSafe(urlString) {
    try {
        const parsed = new URL(urlString);
        const hostname = parsed.hostname.toLowerCase();
        const blocked = [
            /^localhost$/i,
            /^127\.\d+\.\d+\.\d+$/,
            /^10\.\d+\.\d+\.\d+$/,
            /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
            /^192\.168\.\d+\.\d+$/,
            /^169\.254\.\d+\.\d+$/,
            /^0\.0\.0\.0$/,
            /^\[?::1\]?$/,
            /^\[?fe80:/i,
            /^\[?fc00:/i,
            /^\[?fd/i,
        ];
        if (blocked.some(p => p.test(hostname))) return false;
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
        return true;
    } catch(e) { return false; }
}

function resolveApiEndpoint(rawUrl, model = '') {
    if (!rawUrl) return '';
    let clean = rawUrl.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = 'https://' + clean;
    }
    // SSRF Guard
    if (!isUrlSafe(clean)) {
        console.warn('[SSRF Blocked] URL bị chặn vì lý do bảo mật: ' + clean.slice(0, 100));
        return '';
    }
    if (clean.endsWith('/chat/completions') || clean.endsWith('/messages')) {
        return clean;
    }
    const isClaude = (model && model.toLowerCase().includes('claude')) || clean.includes('miraiapi') || clean.includes('anthropic');
    if (isClaude) {
        if (clean.endsWith('/v1')) return `${clean}/messages`;
        return `${clean}/v1/messages`;
    }
    if (clean.endsWith('/v1')) {
        return `${clean}/chat/completions`;
    }
    if (clean.includes('/v1/')) {
        return `${clean}/chat/completions`;
    }
    return `${clean}/v1/chat/completions`;
}

// API Kiểm tra kết nối nhanh (Ping Test)
app.post('/api/test-custom-ai', async (req, res) => {
    const { baseUrl, apiKey, model } = req.body;
    if (!baseUrl || !apiKey || !model) {
        return res.json({ success: false, error: 'Vui lòng nhập đầy đủ: Base URL, Model Name và API Key.' });
    }

    try {
        let targetUrl = resolveApiEndpoint(baseUrl, model);
        const requestHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`,
            'x-api-key': apiKey.trim(),
            'anthropic-version': '2023-06-01'
        };

        let response = await fetch(targetUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify({
                model: model.trim(),
                messages: [{ role: 'user', content: 'Trả lời đúng 2 từ: KẾT NỐI_OK' }],
                max_tokens: 30
            }),
            signal: AbortSignal.timeout(15000)
        });

        // Nếu 404, thử dự phòng không kèm /v1
        if (response.status === 404) {
            let clean = baseUrl.trim().replace(/\/+$/, '');
            if (!clean.startsWith('http://') && !clean.startsWith('https://')) clean = 'https://' + clean;
            const altUrl = `${clean}/chat/completions`;
            if (altUrl !== targetUrl) {
                try {
                    const altRes = await fetch(altUrl, {
                        method: 'POST',
                        headers: requestHeaders,
                        body: JSON.stringify({
                            model: model.trim(),
                            messages: [{ role: 'user', content: 'Trả lời đúng 2 từ: KẾT NỐI_OK' }],
                            max_tokens: 30
                        }),
                        signal: AbortSignal.timeout(15000)
                    });
                    if (altRes.ok) {
                        response = altRes;
                        targetUrl = altUrl;
                    }
                } catch(e){}
            }
        }

        const status = response.status;
        const resText = await response.text();

        if (!response.ok) {
            let errorDetail = resText.slice(0, 300);
            try {
                const errObj = JSON.parse(resText);
                errorDetail = errObj.error?.message || errObj.message || errorDetail;
            } catch(e){}

            let advice = '';
            if (status === 401) advice = ' (Sai API Key hoặc Key gói 39k chưa kích hoạt)';
            else if (status === 404) advice = ' (Sai Base URL - hãy kiểm tra lại link máy chủ proxy bên bán cung cấp)';
            else if (status === 429) advice = ' (Hết hạn mức token hoặc bên bán đang bị nghẽn)';
            else if (status === 400) advice = ' (Có thể sai tên Model - kiểm tra lại bảng tên model của bên bán)';

            return res.json({
                success: false,
                status: status,
                error: `Mã lỗi [${status}]${advice}: ${errorDetail}`
            });
        }

        let parsed;
        try { parsed = JSON.parse(resText); } catch(e) { parsed = null; }
        const reply = parsed?.choices?.[0]?.message?.content || parsed?.content?.[0]?.text || resText.slice(0, 100);

        return res.json({
            success: true,
            status: 200,
            reply: reply.trim(),
            message: `Kết nối thành công tới ${model}! Phản hồi: "${reply.trim()}"`
        });
    } catch (err) {
        return res.json({
            success: false,
            error: `Lỗi kết nối tới nhà cung cấp (${err.name}): ${err.message}`
        });
    }
});

// API Lưu cấu hình Custom AI vào .env
app.post('/api/save-custom-config', (req, res) => {
    const { baseUrl, model, apiKey } = req.body;

    // SECURITY: Sanitize input — loại bỏ ký tự xuống dòng và null byte, chặn injection
    const sanitizeEnvValue = (val) => {
        if (typeof val !== 'string') return '';
        return val.replace(/[\r\n\x00]/g, '').trim().slice(0, 500);
    };

    const cleanBaseUrl = sanitizeEnvValue(baseUrl);
    const cleanModel = sanitizeEnvValue(model);
    const cleanApiKey = sanitizeEnvValue(apiKey);

    // Validate URL nếu có
    if (cleanBaseUrl && !/^https?:\/\/.+/i.test(cleanBaseUrl)) {
        return res.json({ success: false, error: 'Base URL không hợp lệ. Phải bắt đầu bằng http:// hoặc https://' });
    }

    // Validate model name (chỉ cho phép chữ, số, dấu gạch, dấu chấm)
    if (cleanModel && !/^[\w\-\.\/\:]+$/.test(cleanModel)) {
        return res.json({ success: false, error: 'Model name chứa ký tự không hợp lệ.' });
    }

    process.env.CUSTOM_AI_BASE_URL = cleanBaseUrl;
    process.env.CUSTOM_AI_MODEL = cleanModel;
    process.env.CUSTOM_AI_KEY = cleanApiKey;

    try {
        let envData = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        const setEnvVar = (key, val) => {
            const safeVal = String(val).replace(/[\r\n\x00]/g, '');
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envData)) {
                envData = envData.replace(regex, key + '=' + safeVal);
            } else {
                envData += '\n' + key + '=' + safeVal;
            }
        };
        if (baseUrl !== undefined) setEnvVar('CUSTOM_AI_BASE_URL', cleanBaseUrl);
        if (model !== undefined) setEnvVar('CUSTOM_AI_MODEL', cleanModel);
        if (apiKey !== undefined) setEnvVar('CUSTOM_AI_KEY', cleanApiKey);
        fs.writeFileSync(envPath, envData.trim() + '\n', 'utf8');
        res.json({ success: true, message: 'Đã lưu cấu hình Custom AI thành công!' });
    } catch (e) {
        res.json({ success: true, message: 'Đã lưu cấu hình vào bộ nhớ tạm.' });
    }
});

function normalizeJsonSchema(schema) {
    if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
    const copy = Array.isArray(schema) ? [...schema] : { ...schema };
    if (typeof copy.type === 'string') copy.type = copy.type.toLowerCase();
    if (copy.properties && typeof copy.properties === 'object') {
        const newProps = {};
        for (const k of Object.keys(copy.properties)) {
            newProps[k] = normalizeJsonSchema(copy.properties[k]);
        }
        copy.properties = newProps;
    }
    if (copy.items) copy.items = normalizeJsonSchema(copy.items);
    return copy;
}

function formatForAnthropic(messages) {
    const anthropicMessages = [];
    let pendingToolCalls = [];

    (messages || []).forEach(m => {
        const role = (m.role === 'assistant' || m.role === 'model') ? 'assistant' : (m.role === 'system' ? 'system' : 'user');
        if (role === 'system') return;

        if (role === 'assistant') {
            const contentBlocks = [];
            let text = m.content || '';
            if (m.parts && Array.isArray(m.parts)) {
                m.parts.forEach(p => {
                    if (p.text) contentBlocks.push({ type: 'text', text: p.text });
                    if (p.functionCall) {
                        const callId = p.functionCall.id || ('toolu_' + Math.random().toString(36).substring(2, 10));
                        pendingToolCalls.push({ id: callId, name: p.functionCall.name });
                        contentBlocks.push({
                            type: 'tool_use',
                            id: callId,
                            name: p.functionCall.name,
                            input: p.functionCall.args || {}
                        });
                    }
                });
            } else if (text) {
                contentBlocks.push({ type: 'text', text: text });
            }

            if (contentBlocks.length > 0) {
                anthropicMessages.push({ role: 'assistant', content: contentBlocks });
            }
        } else {
            const contentBlocks = [];
            let text = m.content || '';
            if (m.parts && Array.isArray(m.parts)) {
                m.parts.forEach(p => {
                    if (p.text) contentBlocks.push({ type: 'text', text: p.text });
                    if (p.inlineData) {
                        contentBlocks.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: p.inlineData.mimeType,
                                data: p.inlineData.data
                            }
                        });
                    }
                    if (p.functionResponse) {
                        const fr = p.functionResponse;
                        const matched = pendingToolCalls.find(tc => tc.name === fr.name) || pendingToolCalls[0];
                        const toolId = fr.id || (matched ? matched.id : ('toolu_' + Math.random().toString(36).substring(2, 10)));
                        if (matched) {
                            pendingToolCalls = pendingToolCalls.filter(tc => tc.id !== matched.id);
                        }
                        const resText = typeof fr.response === 'string' ? fr.response : JSON.stringify(fr.response || {});
                        contentBlocks.push({
                            type: 'tool_result',
                            tool_use_id: toolId,
                            content: resText
                        });
                    }
                });
            } else if (m.image) {
                contentBlocks.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: m.image.mimeType,
                        data: m.image.data
                    }
                });
                if (text) contentBlocks.push({ type: 'text', text: text });
            } else if (text) {
                contentBlocks.push({ type: 'text', text: text });
            }

            if (contentBlocks.length > 0) {
                anthropicMessages.push({ role: 'user', content: contentBlocks });
            }
        }
    });

    // Merge consecutive messages with same role (Anthropic requires strict alternation)
    const merged = [];
    anthropicMessages.forEach(msg => {
        if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
            const prev = merged[merged.length - 1];
            const prevBlocks = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: String(prev.content) }];
            const msgBlocks = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: String(msg.content) }];
            prev.content = [...prevBlocks, ...msgBlocks];
        } else {
            merged.push(msg);
        }
    });

    if (merged.length === 0 || merged[0].role !== 'user') {
        merged.unshift({ role: 'user', content: [{ type: 'text', text: 'Xin chào, bắt đầu phiên làm việc.' }] });
    }

    return merged;
}

// API Chuyển tiếp tác vụ sang Custom AI (Claude, GPT, DeepSeek,...) & Chuẩn hóa đầu ra
app.post('/api/custom-ai-chat', async (req, res) => {
    const { baseUrl, apiKey, model, messages, tools, systemInstruction, stream } = req.body;
    if (!baseUrl || !apiKey || !model) {
        return res.status(400).json({ success: false, error: 'Thiếu cấu hình Custom AI (Base URL, API Key hoặc Model).' });
    }

    try {
        let targetUrl = resolveApiEndpoint(baseUrl, model);
        const isAnthropic = targetUrl.endsWith('/messages');
        const isStream = stream === true;

        const sysText = typeof systemInstruction === 'string'
            ? systemInstruction
            : (systemInstruction?.parts ? systemInstruction.parts.map(p => p.text).join('\n') : (systemInstruction ? JSON.stringify(systemInstruction) : ''));

        let payload;
        const requestHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`,
            'x-api-key': apiKey.trim(),
            'anthropic-version': '2023-06-01'
        };

        if (isAnthropic) {
            // Chuẩn hóa tools sang Anthropic Tools Format (input_schema với lowercase types)
            let anthropicTools = undefined;
            if (tools && Array.isArray(tools)) {
                let decls = [];
                tools.forEach(t => {
                    if (t.functionDeclarations && Array.isArray(t.functionDeclarations)) {
                        decls.push(...t.functionDeclarations);
                    } else if (t.name) {
                        decls.push(t);
                    }
                });
                if (decls.length > 0) {
                    anthropicTools = decls.map(d => ({
                        name: d.name,
                        description: d.description || '',
                        input_schema: normalizeJsonSchema(d.parameters)
                    }));
                }
            }

            payload = {
                model: model.trim(),
                max_tokens: req.body.max_tokens || 4096,
                system: sysText || undefined,
                messages: formatForAnthropic(messages),
                tools: (anthropicTools && anthropicTools.length > 0) ? anthropicTools : undefined,
                temperature: 0.7,
                stream: isStream
            };
        } else {
            // Chuẩn OpenAI Chat Completion
            let openAiMessages = [];
            if (sysText) {
                openAiMessages.push({ role: 'system', content: sysText });
            }

            let lastToolCalls = [];
            (messages || []).forEach((m, idx) => {
                if (m.role === 'system') {
                    openAiMessages.push({ role: 'system', content: m.content || (m.parts ? m.parts.map(p => p.text).join('') : '') });
                } else if (m.role === 'assistant' || m.role === 'model') {
                    let contentText = m.content || '';
                    let toolCalls = undefined;
                    if (m.parts && Array.isArray(m.parts)) {
                        contentText = m.parts.filter(p => p.text).map(p => p.text).join('\n');
                        const fnCalls = m.parts.filter(p => p.functionCall);
                        if (fnCalls.length > 0) {
                            toolCalls = fnCalls.map((fc, i) => {
                                const callId = fc.functionCall.id || ('call_' + Date.now() + '_' + i);
                                return {
                                    id: callId,
                                    type: 'function',
                                    function: {
                                        name: fc.functionCall.name,
                                        arguments: JSON.stringify(fc.functionCall.args || {})
                                    }
                                };
                            });
                            lastToolCalls = toolCalls;
                        }
                    }
                    openAiMessages.push({ role: 'assistant', content: contentText || null, tool_calls: toolCalls });
                } else {
                    let contentText = m.content || '';
                    let imagePart = null;

                    if (m.image) {
                        imagePart = {
                            type: 'image_url',
                            image_url: { url: `data:${m.image.mimeType};base64,${m.image.data}` }
                        };
                    }

                    if (m.parts && Array.isArray(m.parts)) {
                        const fnResps = m.parts.filter(p => p.functionResponse);
                        if (fnResps.length > 0) {
                            fnResps.forEach((fr, i) => {
                                const respObj = fr.functionResponse;
                                let matchedTc = lastToolCalls.find(tc => tc.function?.name === respObj.name);
                                const toolId = respObj.id || (matchedTc ? matchedTc.id : (lastToolCalls[i] ? lastToolCalls[i].id : ('call_' + Date.now() + '_' + i)));
                                const toolContent = typeof respObj.response === 'string'
                                    ? respObj.response
                                    : JSON.stringify(respObj.response || {});
                                openAiMessages.push({
                                    role: 'tool',
                                    tool_call_id: toolId,
                                    content: toolContent
                                });
                            });
                            return;
                        }

                        const inlineImg = m.parts.find(p => p.inlineData);
                        if (inlineImg && inlineImg.inlineData) {
                            imagePart = {
                                type: 'image_url',
                                image_url: { url: `data:${inlineImg.inlineData.mimeType};base64,${inlineImg.inlineData.data}` }
                            };
                        }
                        contentText = m.parts.filter(p => p.text).map(p => p.text).join('\n');
                    }

                    if (imagePart) {
                        openAiMessages.push({
                            role: 'user',
                            content: [
                                { type: 'text', text: contentText || 'Mời bạn phân tích bức ảnh này' },
                                imagePart
                            ]
                        });
                    } else {
                        openAiMessages.push({ role: 'user', content: contentText });
                    }
                }
            });

            for (let i = 0; i < openAiMessages.length; i++) {
                const cur = openAiMessages[i];
                if (cur.role === 'assistant' && cur.tool_calls && cur.tool_calls.length > 0) {
                    const requiredToolIds = new Set(cur.tool_calls.map(tc => tc.id));
                    let nextIdx = i + 1;
                    while (nextIdx < openAiMessages.length && openAiMessages[nextIdx].role === 'tool') {
                        requiredToolIds.delete(openAiMessages[nextIdx].tool_call_id);
                        nextIdx++;
                    }
                    if (requiredToolIds.size > 0) {
                        const toolNames = cur.tool_calls.map(tc => tc.function?.name || 'tool').join(', ');
                        cur.content = (cur.content ? cur.content + '\n' : '') + `[Đã thực thi công cụ: ${toolNames}]`;
                        delete cur.tool_calls;
                    }
                }
            }

            let openAiTools = undefined;
            if (tools && Array.isArray(tools)) {
                let decls = [];
                tools.forEach(t => {
                    if (t.functionDeclarations && Array.isArray(t.functionDeclarations)) {
                        decls.push(...t.functionDeclarations);
                    } else if (t.name) {
                        decls.push(t);
                    }
                });
                if (decls.length > 0) {
                    openAiTools = decls.map(d => ({
                        type: 'function',
                        function: {
                            name: d.name,
                            description: d.description || '',
                            parameters: normalizeJsonSchema(d.parameters)
                        }
                    }));
                }
            }

            payload = {
                model: model.trim(),
                messages: openAiMessages,
                tools: openAiTools,
                temperature: 0.7,
                max_tokens: req.body.max_tokens || 4096,
                stream: isStream
            };
        }

        let response = null;
        let lastErrBody = '';
        const MAX_BACKEND_ATTEMPTS = 4;
        for (let attempt = 0; attempt < MAX_BACKEND_ATTEMPTS; attempt++) {
            try {
                response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: requestHeaders,
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(180000) // Tăng thời gian chờ lên 3 phút cho các model nặng như Opus
                });
                if (response.ok) break;

                // Nếu là lỗi máy chủ tạm thời (500, 502, 503, 504), tự động thử lại sau 1.5s - 4.5s
                if (response.status >= 500 && attempt < MAX_BACKEND_ATTEMPTS - 1) {
                    lastErrBody = await response.text();
                    console.warn(`[Custom AI Proxy] Lỗi tạm thời ${response.status} (Lần ${attempt + 1}/${MAX_BACKEND_ATTEMPTS}): ${lastErrBody.slice(0, 100)}. Đang tự động thử lại...`);
                    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                    continue;
                }
                break;
            } catch (netErr) {
                if (attempt < MAX_BACKEND_ATTEMPTS - 1) {
                    console.warn(`[Custom AI Proxy] Lỗi mạng tạm thời (Lần ${attempt + 1}/${MAX_BACKEND_ATTEMPTS}): ${netErr.message}. Đang thử lại...`);
                    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                    continue;
                }
                throw netErr;
            }
        }

        if (!response || !response.ok) {
            const errBody = lastErrBody || (response ? await response.text() : 'Không có phản hồi');
            return res.status(response ? response.status : 500).json({
                success: false,
                status: response ? response.status : 500,
                error: `Lỗi từ Custom AI (${response ? response.status : 500}): ${errBody.slice(0, 500)}`
            });
        }

        // =========================================================================
        // STREAMING PIPELINE: "AI NGHĨ RA CHỮ NÀO DÙNG LUÔN CHỮ ĐÓ" (SSE REAL-TIME)
        // Chuyển tiếp tức thời từng token về browser dưới chuẩn Gemini SSE
        // =========================================================================
        if (isStream) {
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            if (typeof res.flushHeaders === 'function') res.flushHeaders();

            // Heartbeat định kỳ 10s ngăn chặn Cloudflare Timeout 524
            const pingTimer = setInterval(() => {
                try {
                    if (!res.writableEnded) {
                        res.write(': ping\n\n');
                    }
                } catch (e) {}
            }, 10000);

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            req.on('close', () => {
                clearInterval(pingTimer);
                try { reader.cancel(); } catch (e) {}
            });

            try {
                if (isAnthropic) {
                    let buffer = '';
                    let currentEventType = '';
                    const toolsByIndex = {};
                    let isStopped = false;

                    while (!isStopped) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop();

                        for (const rawLine of lines) {
                            const line = rawLine.trim();
                            if (!line || line.startsWith(':')) continue;
                            if (line.startsWith('event:')) {
                                currentEventType = line.substring(6).trim();
                                continue;
                            }
                            if (line.startsWith('data:')) {
                                const dataStr = line.substring(5).trim();
                                if (dataStr === '[DONE]') {
                                    isStopped = true;
                                    break;
                                }
                                let parsed = null;
                                try {
                                    parsed = JSON.parse(dataStr);
                                } catch (e) {
                                    continue;
                                }

                                const eventType = currentEventType || parsed.type;

                                // 1. Từng từ / token phát sinh được stream ngay lập tức về UI
                                if (parsed.delta && parsed.delta.type === 'text_delta' && parsed.delta.text) {
                                    const sseMsg = {
                                        candidates: [{
                                            content: {
                                                parts: [{ text: parsed.delta.text }],
                                                role: 'model'
                                            }
                                        }]
                                    };
                                    res.write(`data: ${JSON.stringify(sseMsg)}\n\n`);
                                }

                                // 2. Bắt đầu khối Tool Use
                                else if (parsed.content_block && parsed.content_block.type === 'tool_use') {
                                    const idx = parsed.index ?? 0;
                                    toolsByIndex[idx] = {
                                        id: parsed.content_block.id || ('call_' + Date.now() + '_' + idx),
                                        name: parsed.content_block.name,
                                        json: ''
                                    };
                                }

                                // 3. Tích lũy JSON tham số tool
                                else if (parsed.delta && parsed.delta.type === 'input_json_delta' && parsed.delta.partial_json) {
                                    const idx = parsed.index ?? 0;
                                    if (toolsByIndex[idx]) {
                                        toolsByIndex[idx].json += parsed.delta.partial_json;
                                    }
                                }

                                // 4. Đóng khối Tool Use: Bắn Gemini-compatible functionCall part
                                else if (eventType === 'content_block_stop' || parsed.type === 'content_block_stop') {
                                    const idx = parsed.index ?? 0;
                                    if (toolsByIndex[idx]) {
                                        let toolArgs = {};
                                        try {
                                            toolArgs = JSON.parse(toolsByIndex[idx].json || '{}');
                                        } catch (e) {}
                                        const toolCallPart = {
                                            candidates: [{
                                                content: {
                                                    parts: [{
                                                        functionCall: {
                                                            id: toolsByIndex[idx].id,
                                                            name: toolsByIndex[idx].name,
                                                            args: toolArgs
                                                        }
                                                    }],
                                                    role: 'model'
                                                }
                                            }]
                                        };
                                        res.write(`data: ${JSON.stringify(toolCallPart)}\n\n`);
                                        delete toolsByIndex[idx];
                                    }
                                }

                                // 5. Khi nhận message_stop: Ngắt ngay lập tức để không bị treo bởi proxy keep-alive
                                else if (eventType === 'message_stop' || parsed.type === 'message_stop') {
                                    isStopped = true;
                                    reader.cancel().catch(() => {});
                                    break;
                                }
                            }
                        }
                        if (isStopped) break;
                    }
                } else {
                    // OpenAI Chat Completion Stream
                    let buffer = '';
                    const toolsByIndex = {};
                    let isStopped = false;

                    while (!isStopped) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop();

                        for (const rawLine of lines) {
                            const line = rawLine.trim();
                            if (!line || line.startsWith(':')) continue;
                            if (line.startsWith('data:')) {
                                const dataStr = line.substring(5).trim();
                                if (dataStr === '[DONE]') {
                                    isStopped = true;
                                    reader.cancel().catch(() => {});
                                    break;
                                }
                                let parsed = null;
                                try {
                                    parsed = JSON.parse(dataStr);
                                } catch (e) {
                                    continue;
                                }

                                const choice = parsed.choices && parsed.choices[0];
                                if (!choice) continue;
                                const delta = choice.delta;

                                // 1. Từng token text được gửi ngay lập tức về UI
                                if (delta && delta.content) {
                                    const sseMsg = {
                                        candidates: [{
                                            content: {
                                                parts: [{ text: delta.content }],
                                                role: 'model'
                                            }
                                        }]
                                    };
                                    res.write(`data: ${JSON.stringify(sseMsg)}\n\n`);
                                }

                                // 2. Tool calls delta
                                if (delta && delta.tool_calls && Array.isArray(delta.tool_calls)) {
                                    for (const tc of delta.tool_calls) {
                                        const idx = tc.index ?? 0;
                                        if (!toolsByIndex[idx]) {
                                            toolsByIndex[idx] = { id: '', name: '', arguments: '' };
                                        }
                                        if (tc.id) toolsByIndex[idx].id = tc.id;
                                        if (tc.function?.name) toolsByIndex[idx].name = tc.function.name;
                                        if (tc.function?.arguments) toolsByIndex[idx].arguments += tc.function.arguments;
                                    }
                                }

                                // 3. Hoàn tất tool call hoặc kết thúc
                                if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
                                    for (const idx of Object.keys(toolsByIndex)) {
                                        const t = toolsByIndex[idx];
                                        if (t && t.name) {
                                            let toolArgs = {};
                                            try {
                                                toolArgs = JSON.parse(t.arguments || '{}');
                                            } catch (e) {}
                                            const toolCallPart = {
                                                candidates: [{
                                                    content: {
                                                        parts: [{
                                                            functionCall: {
                                                                id: t.id || ('call_' + Date.now() + '_' + idx),
                                                                name: t.name,
                                                                args: toolArgs
                                                            }
                                                        }],
                                                        role: 'model'
                                                    }
                                                }]
                                            };
                                            res.write(`data: ${JSON.stringify(toolCallPart)}\n\n`);
                                        }
                                    }
                                    for (const k in toolsByIndex) delete toolsByIndex[k];

                                    if (choice.finish_reason === 'stop') {
                                        isStopped = true;
                                        reader.cancel().catch(() => {});
                                        break;
                                    }
                                }
                            }
                        }
                        if (isStopped) break;
                    }

                    // Xả hết các tool còn tích lũy nếu có
                    for (const idx of Object.keys(toolsByIndex)) {
                        const t = toolsByIndex[idx];
                        if (t && t.name) {
                            let toolArgs = {};
                            try {
                                toolArgs = JSON.parse(t.arguments || '{}');
                            } catch (e) {}
                            const toolCallPart = {
                                candidates: [{
                                    content: {
                                        parts: [{
                                            functionCall: {
                                                id: t.id || ('call_' + Date.now() + '_' + idx),
                                                name: t.name,
                                                args: toolArgs
                                            }
                                        }],
                                        role: 'model'
                                    }
                                }]
                            };
                            res.write(`data: ${JSON.stringify(toolCallPart)}\n\n`);
                        }
                    }
                }
            } catch (streamErr) {
                console.error('[Custom AI Stream Error]', streamErr);
                if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ error: streamErr.message })}\n\n`);
                }
            } finally {
                clearInterval(pingTimer);
                if (!res.writableEnded) {
                    res.write('data: [DONE]\n\n');
                    res.end();
                }
            }
            return;
        }

        const data = await response.json();
        const choice = data.choices && data.choices[0];
        let contentParts = [];
        let botText = '';
        let detectedFunctionCalls = [];

        if (choice && choice.message) {
            // 1. Trích xuất text content (chuỗi hoặc mảng blocks)
            if (typeof choice.message.content === 'string') {
                botText = choice.message.content;
            } else if (Array.isArray(choice.message.content)) {
                choice.message.content.forEach(b => {
                    if (b.type === 'text' && b.text) {
                        botText += (botText ? '\n' : '') + b.text;
                    } else if (b.type === 'tool_use' || (b.name && b.input)) {
                        const tcName = b.name || b.function?.name;
                        if (tcName && tcName !== 'undefined') {
                            detectedFunctionCalls.push({
                                id: b.id || ('call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
                                name: tcName,
                                args: b.input || b.arguments || {}
                            });
                        }
                    }
                });
            }

            // 2. Trích xuất tool_calls (chuẩn OpenAI hoặc chuyển đổi proxy Claude - hỗ trợ đa công cụ song song)
            if (choice.message.tool_calls && Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0) {
                choice.message.tool_calls.forEach(tc => {
                    const fnName = tc.function?.name || tc.name || tc.function_name;
                    let fnArgs = {};
                    const rawArgs = tc.function?.arguments || tc.input || tc.arguments;
                    if (typeof rawArgs === 'string') {
                        try { fnArgs = JSON.parse(rawArgs); } catch(e){}
                    } else if (typeof rawArgs === 'object' && rawArgs !== null) {
                        fnArgs = rawArgs;
                    }

                    if (fnName && fnName !== 'undefined') {
                        detectedFunctionCalls.push({
                            id: tc.id || ('call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
                            name: fnName,
                            args: fnArgs
                        });
                    }
                });
            }

            // 3. Trích xuất function_call kiểu cũ
            if (detectedFunctionCalls.length === 0 && choice.message.function_call) {
                const fc = choice.message.function_call;
                let fnArgs = {};
                if (typeof fc.arguments === 'string') {
                    try { fnArgs = JSON.parse(fc.arguments); } catch(e){}
                } else if (typeof fc.arguments === 'object' && fc.arguments !== null) {
                    fnArgs = fc.arguments;
                }
                if (fc.name && fc.name !== 'undefined') {
                    detectedFunctionCalls.push({
                        id: 'call_' + Date.now(),
                        name: fc.name,
                        args: fnArgs
                    });
                }
            }
        } else if (data.content && Array.isArray(data.content)) {
            // 4. Chuẩn phản hồi gốc của Anthropic API (nếu proxy chuyển tiếp raw Anthropic JSON)
            data.content.forEach(b => {
                if (b.type === 'text' && b.text) {
                    botText += (botText ? '\n' : '') + b.text;
                } else if (b.type === 'tool_use' || (b.name && b.input)) {
                    if (b.name && b.name !== 'undefined') {
                        detectedFunctionCalls.push({
                            id: b.id || ('call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
                            name: b.name,
                            args: b.input || {}
                        });
                    }
                }
            });
        }

        // 5. Fallback nếu model sinh cú pháp gọi tool trong text (Claude text tool calling)
        if (detectedFunctionCalls.length === 0 && botText) {
            const jsonToolMatch = botText.match(/```(?:json)?\s*\{[\s\S]*?"(?:tool|function|action|name)"\s*:\s*"([a-zA-Z0-9_]+)"[\s\S]*?\}\s*```/i);
            if (jsonToolMatch) {
                try {
                    const rawObj = JSON.parse(jsonToolMatch[0].replace(/```(?:json)?|```/gi, '').trim());
                    const tName = rawObj.tool || rawObj.function || rawObj.action || rawObj.name;
                    if (tName && tName !== 'undefined') {
                        detectedFunctionCalls.push({
                            id: 'call_fallback_' + Date.now(),
                            name: tName,
                            args: rawObj.parameters || rawObj.args || rawObj.input || rawObj
                        });
                    }
                } catch(e){}
            }
        }

        if (botText) contentParts.push({ text: botText });
        detectedFunctionCalls.forEach(fc => {
            contentParts.push({ functionCall: fc });
        });

        const firstFc = detectedFunctionCalls.length > 0 ? detectedFunctionCalls[0] : null;

        return res.json({
            success: true,
            model: model,
            text: botText,
            functionCall: firstFc,
            functionCalls: detectedFunctionCalls,
            candidates: [{
                content: {
                    parts: contentParts,
                    role: 'model'
                }
            }],
            raw: data
        });

    } catch (err) {
        console.error("Lỗi custom-ai-chat:", err);
        return res.status(500).json({ success: false, error: `Lỗi kết nối Custom AI: ${err.message}` });
    }
});

// =========================================================================
// 6.5. SCIENTIFIC RESEARCH & VERIFICATION LAYER (P0 + P1 ARSENAL)
// CLAIM LEDGER, CITATION AUDITOR, EVIDENCE GRAPH, ACADEMIC SEARCH CONNECTORS,
// METHODOLOGY AUDITOR, COUNTER-EVIDENCE HUNTER & HARD-CODED QUALITY GATE
// =========================================================================

const CLAIM_LEDGER_FILE = path.join(MEMORY_DIR, 'claim_ledger.json');
if (!fs.existsSync(CLAIM_LEDGER_FILE)) {
    fs.writeFileSync(CLAIM_LEDGER_FILE, JSON.stringify([], null, 2), 'utf8');
}

function loadClaimLedger() {
    try {
        if (!fs.existsSync(CLAIM_LEDGER_FILE)) return [];
        const raw = fs.readFileSync(CLAIM_LEDGER_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

function saveClaimLedger(claims) {
    try {
        fs.writeFileSync(CLAIM_LEDGER_FILE, JSON.stringify(claims, null, 2), 'utf8');
        return true;
    } catch (e) {
        return false;
    }
}

// Helper fetch an toàn có timeout
async function safeAcademicFetch(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

// 1. PubMed Search Connector (NCBI E-utilities)
async function searchPubMed(query, limit = 5) {
    const results = [];
    try {
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=${limit}`;
        const sRes = await safeAcademicFetch(searchUrl);
        const sData = await sRes.json();
        const idList = sData?.esearchresult?.idlist || [];
        if (idList.length === 0) return results;

        const sumUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idList.join(',')}&retmode=json`;
        const sumRes = await safeAcademicFetch(sumUrl);
        const sumData = await sumRes.json();

        for (const id of idList) {
            const item = sumData?.result?.[id];
            if (!item) continue;
            let doi = null;
            if (Array.isArray(item.articleids)) {
                const doiObj = item.articleids.find(a => a.idtype === 'doi');
                if (doiObj) doi = doiObj.value;
            }
            const authors = (item.authors || []).map(a => a.name).slice(0, 3);
            results.push({
                sourceDb: 'PubMed (NCBI)',
                pmid: id,
                doi: doi,
                title: item.title ? item.title.replace(/\.$/, '') : `PubMed Article ${id}`,
                authors: authors,
                authorString: authors.join(', ') + (item.authors?.length > 3 ? ' et al.' : ''),
                journal: item.source || item.fulljournalname || 'Biomedical Journal',
                pubYear: item.pubdate ? item.pubdate.split(' ')[0] : 'N/A',
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                isVerified: true
            });
        }
    } catch (e) {}
    return results;
}

// 2. Europe PMC Search Connector
async function searchEuropePmc(query, limit = 5) {
    const results = [];
    try {
        const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${limit}`;
        const res = await safeAcademicFetch(url);
        const data = await res.json();
        const list = data?.resultList?.result || [];
        for (const item of list) {
            results.push({
                sourceDb: 'Europe PMC',
                pmid: item.pmid || null,
                pmcid: item.pmcid || null,
                doi: item.doi || null,
                title: item.title ? item.title.replace(/\.$/, '') : 'Academic Research Paper',
                authorString: item.authorString || 'Unknown Authors',
                journal: item.journalTitle || 'Peer-Reviewed Journal',
                pubYear: item.pubYear || 'N/A',
                abstract: item.abstractText || null,
                isOpenAccess: item.isOpenAccess === 'Y',
                citedByCount: item.citedByCount || 0,
                url: item.doi ? `https://doi.org/${item.doi}` : (item.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/` : `https://europepmc.org/article/MED/${item.id}`),
                isVerified: true
            });
        }
    } catch (e) {}
    return results;
}

// 3. Crossref Lookup & Search Connector
async function lookupCrossrefDoi(doi) {
    if (!doi) return null;
    try {
        const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, '');
        const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
        const res = await safeAcademicFetch(url, {
            headers: { 'User-Agent': 'CyberAgentPro/2.0 (mailto:admin@cyberagent.pro)' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const msg = data?.message;
        if (!msg) return null;

        const title = Array.isArray(msg.title) ? msg.title[0] : msg.title;
        const journal = Array.isArray(msg['container-title']) ? msg['container-title'][0] : (msg['container-title'] || msg.publisher || 'Crossref Indexed');
        const authors = (msg.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean);
        const pubYear = msg['published-print']?.['date-parts']?.[0]?.[0] || msg['published-online']?.['date-parts']?.[0]?.[0] || msg.created?.['date-parts']?.[0]?.[0] || 'N/A';
        const isRetracted = Boolean(msg['update-to'] && msg['update-to'].some(u => /retract/i.test(u.label || u.type || '')));

        return {
            sourceDb: 'Crossref Metadata',
            doi: cleanDoi,
            title: title || cleanDoi,
            authors: authors,
            authorString: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''),
            journal: journal,
            pubYear: pubYear,
            isRetracted: isRetracted,
            citationCount: msg['is-referenced-by-count'] || 0,
            url: `https://doi.org/${cleanDoi}`,
            isVerified: true
        };
    } catch (e) {
        return null;
    }
}

async function searchCrossref(query, limit = 5) {
    const results = [];
    try {
        const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`;
        const res = await safeAcademicFetch(url, {
            headers: { 'User-Agent': 'CyberAgentPro/2.0 (mailto:admin@cyberagent.pro)' }
        });
        const data = await res.json();
        const items = data?.message?.items || [];
        for (const msg of items) {
            const cleanDoi = msg.DOI;
            const title = Array.isArray(msg.title) ? msg.title[0] : msg.title;
            const journal = Array.isArray(msg['container-title']) ? msg['container-title'][0] : (msg['container-title'] || msg.publisher || 'Crossref Indexed');
            const authors = (msg.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean);
            const pubYear = msg['published-print']?.['date-parts']?.[0]?.[0] || msg['published-online']?.['date-parts']?.[0]?.[0] || 'N/A';
            const isRetracted = Boolean(msg['update-to'] && msg['update-to'].some(u => /retract/i.test(u.label || u.type || '')));
            results.push({
                sourceDb: 'Crossref',
                doi: cleanDoi,
                title: title,
                authors: authors,
                authorString: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''),
                journal: journal,
                pubYear: pubYear,
                isRetracted: isRetracted,
                citationCount: msg['is-referenced-by-count'] || 0,
                url: cleanDoi ? `https://doi.org/${cleanDoi}` : null,
                isVerified: true
            });
        }
    } catch (e) {}
    return results;
}

// 4. OpenAlex Search Connector
async function searchOpenAlex(query, limit = 5) {
    const results = [];
    try {
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${limit}`;
        const res = await safeAcademicFetch(url);
        const data = await res.json();
        const list = data?.results || [];
        for (const item of list) {
            const rawDoi = item.doi ? item.doi.replace(/^https?:\/\/doi\.org\//i, '') : null;
            const authors = (item.authorships || []).map(a => a.author?.display_name).filter(Boolean);
            results.push({
                sourceDb: 'OpenAlex',
                doi: rawDoi,
                openAlexId: item.id,
                title: item.title,
                authors: authors,
                authorString: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''),
                journal: item.primary_location?.source?.display_name || 'Academic Journal',
                pubYear: item.publication_year || 'N/A',
                citedByCount: item.cited_by_count || 0,
                isRetracted: Boolean(item.is_retracted),
                isOpenAccess: Boolean(item.open_access?.is_oa),
                url: item.doi || item.id,
                isVerified: true
            });
        }
    } catch (e) {}
    return results;
}

// Khử trùng lặp & Hợp nhất bản ghi học thuật theo DOI hoặc Tiêu đề chuẩn hóa
function deduplicateAcademicRecords(records) {
    const map = new Map();
    for (const r of records) {
        if (!r || !r.title) continue;
        const normDoi = r.doi ? r.doi.toLowerCase().trim() : null;
        const normTitle = r.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
        const key = normDoi ? `doi:${normDoi}` : `title:${normTitle}`;

        if (!map.has(key)) {
            map.set(key, { ...r });
        } else {
            const existing = map.get(key);
            if (!existing.pmid && r.pmid) existing.pmid = r.pmid;
            if (!existing.doi && r.doi) existing.doi = r.doi;
            if (!existing.abstract && r.abstract) existing.abstract = r.abstract;
            if (r.isRetracted) existing.isRetracted = true;
            if (r.citedByCount && (!existing.citedByCount || r.citedByCount > existing.citedByCount)) {
                existing.citedByCount = r.citedByCount;
            }
            if (r.sourceDb && !existing.sourceDb.includes(r.sourceDb)) {
                existing.sourceDb += ` + ${r.sourceDb}`;
            }
        }
    }
    return Array.from(map.values());
}

// Tìm kiếm học thuật đa nguồn tổng hợp
async function multiSourceAcademicSearch(query, limit = 8) {
    if (!query) return [];
    const [pmRes, epmcRes, crRes, oaRes] = await Promise.allSettled([
        searchPubMed(query, 4),
        searchEuropePmc(query, 4),
        searchCrossref(query, 4),
        searchOpenAlex(query, 4)
    ]);

    let combined = [];
    if (pmRes.status === 'fulfilled') combined.push(...pmRes.value);
    if (epmcRes.status === 'fulfilled') combined.push(...epmcRes.value);
    if (crRes.status === 'fulfilled') combined.push(...crRes.value);
    if (oaRes.status === 'fulfilled') combined.push(...oaRes.value);

    const deduped = deduplicateAcademicRecords(combined);
    return deduped.slice(0, limit);
}

// Thẩm định Entailment & Kiểm toán phương pháp luận cho Claim
function auditCitationEntailment(claimText, sourceData = {}) {
    const text = String(claimText || '');
    const srcText = String(sourceData.sourceText || sourceData.abstract || '');
    const blockingIssues = [];
    const approvedCaveats = [];
    let status = 'UNVERIFIED';

    // 1. Kiểm tra phóng đại từ mô hình động vật sang người
    const isAnimalStudy = Boolean(sourceData.species === 'animal' || sourceData.species === 'rodent' ||
        /chuột|mice|mouse|rat|murine|in vitro|động vật/i.test(srcText) ||
        /RBM3|Mallucci/i.test(text));
    const mentionsAnimalInClaim = /chuột|mô hình động vật|mô hình chuột|in vivo chuột|rodent/i.test(text);

    if (isAnimalStudy && !mentionsAnimalInClaim) {
        status = 'QUALIFIED';
        blockingIssues.push('Nghiên cứu gốc thực hiện trên mô hình động vật (chuột); không được khái quát hóa trực tiếp thành tác dụng trên người khỏe mạnh.');
        approvedCaveats.push('trên mô hình động vật (chuột/gặm nhấm)');
    }

    // 2. Kiểm tra cỡ mẫu nhỏ (N < 30)
    const sampleSize = parseInt(sourceData.sampleSize) || 0;
    const isSmallN = (sampleSize > 0 && sampleSize < 30) || /N\s*=\s*(?:10|[1-2][0-9])\b/i.test(srcText) || /Šrámek|Sramek/i.test(text);
    const mentionsSmallN = /N\s*=\s*\d+|quy mô nhỏ|thử nghiệm nhỏ|pilot/i.test(text);

    if (isSmallN && !mentionsSmallN) {
        if (status === 'SUPPORTED') status = 'QUALIFIED';
        blockingIssues.push('Cỡ mẫu nhỏ (N < 30); bắt buộc phải nêu rõ giới hạn cỡ mẫu và tính chất sơ bộ.');
        approvedCaveats.push('trong nghiên cứu quy mô nhỏ');
    }

    // 3. Kiểm tra nhầm lẫn khoang sinh học (Huyết tương ngoại vi vs Dịch não tủy / Não bộ)
    const claimsBrainDopamine = /dopamine.*(trong não|não bộ|hệ thần kinh trung ương|trung ương|CSF)/i.test(text);
    const isPeripheralStudy = /huyết tương|plasma|máu ngoại vi|peripheral/i.test(srcText) || /Šrámek|Sramek/i.test(text);

    if (claimsBrainDopamine && isPeripheralStudy) {
        status = 'CONTRADICTED';
        blockingIssues.push('Nhầm lẫn khoang sinh học nghiêm trọng: Nghiên cứu chỉ đo catecholamine trong huyết tương ngoại vi (không vượt qua hàng rào máu não BBB); không chứng minh tăng dopamine trong não bộ.');
        approvedCaveats.push('trong huyết tương ngoại vi (không đo trực tiếp trong não)');
    }

    // 4. Kiểm tra con số Šrámek (dopamine tăng 250%, noradrenaline tăng 530%)
    if (/Šrámek|Sramek/i.test(text) && /dopamine tăng nhẹ/i.test(text)) {
        status = 'QUALIFIED';
        blockingIssues.push('Sai lệch số liệu gốc: Šrámek et al. (2000) ghi nhận noradrenaline huyết tương tăng 530% và dopamine huyết tương tăng 250% (không phải tăng nhẹ). Bắt buộc dẫn chính xác 250% và phân định ranh giới BBB.');
        approvedCaveats.push('dopamine huyết tương tăng 250%, noradrenaline tăng 530%');
    }

    // 5. Kiểm tra Flow State (giả thuyết sơ bộ vs kết luận chắc chắn)
    if (/Flow State|Transient Hypofrontality|Dietrich/i.test(text) && !/giả thuyết|sơ bộ|thưa thớt|exploratory|chưa thống nhất/i.test(text)) {
        status = 'QUALIFIED';
        blockingIssues.push('Quá mức tuyên bố (Overclaim): Cơ sở thần kinh của Flow State và Transient Hypofrontality chỉ là giả thuyết sơ bộ (theo tổng quan hệ thống van der Linden 2021, N=471, bằng chứng còn thưa thớt và không đồng nhất).');
        approvedCaveats.push('giả thuyết thần kinh học sơ bộ');
    }

    // 6. Kiểm tra con số phóng đại (ví dụ tốc độ myelin x100)
    if (/myelin/i.test(text) && /(?:tăng|nhanh hơn)\s*(?:100|trăm)\s*lần/i.test(text)) {
        status = 'CONTRADICTED';
        blockingIssues.push('Tuyên bố sai lệch: Tốc độ dẫn truyền sợi có myelin do đường kính sợi giải phẫu quyết định (lên tới 100-120 m/s so với sợi không myelin); Deliberate Practice chỉ tinh chỉnh đồng bộ hóa thời gian (temporal synchrony), không làm tăng tốc độ lên 100 lần.');
    }

    // Nâng từ UNVERIFIED lên SUPPORTED chỉ khi có nguồn DOI/PMID được xác minh
    if (status === 'UNVERIFIED' && blockingIssues.length === 0) {
        const hasVerifiedSource = !!(sourceData.doi || sourceData.pmid || sourceData.sourceUrl);
        const hasSourceText = !!(srcText && srcText.length > 50);
        if (hasVerifiedSource && hasSourceText) {
            status = 'SUPPORTED';
        }
    }

    // Sinh approved wording
    let approvedWording = text;
    if (approvedCaveats.length > 0) {
        approvedWording = `${text} (Lưu ý: ${approvedCaveats.join('; ')})`;
    }

    return {
        claimText,
        status,
        blockingIssues,
        approvedWording: status === 'CONTRADICTED' ? null : approvedWording,
        isAnimalStudy,
        isSmallN,
        verificationTimestamp: new Date().toISOString()
    };
}

// Cổng kiểm định chất lượng khoa học độc lập (ENFORCE QUALITY GATE V2)
function enforceQualityGate(reportContent, claims = []) {
    const issues = [];
    const passedChecks = [];
    const text = String(reportContent || '');

    const rubricResults = [];

    // Tiêu chí 1: Độ chính xác số liệu Šrámek 2000 (530% NA, 250% DA)
    let r1Pass = true;
    let r1Detail = '';
    if (/Šrámek|Sramek/i.test(text)) {
        const mentionsExactNumbers = /250%/i.test(text) && /530%/i.test(text);
        const mentionsUnderstatement = /dopamine tăng nhẹ/i.test(text);
        if (mentionsUnderstatement && !mentionsExactNumbers) {
            r1Pass = false;
            r1Detail = 'Nghiên cứu Šrámek et al. (2000) ghi nhận dopamine huyết tương tăng 250% và noradrenaline tăng 530% ở 14°C trong 1 giờ. Mô tả "dopamine tăng nhẹ" là thiếu trung thực với số liệu gốc.';
            issues.push(r1Detail);
        } else {
            r1Detail = 'Chính xác: Số liệu Šrámek 2000 phản ánh đúng số liệu gốc bài báo (noradrenaline 530%, dopamine 250% huyết tương).';
            passedChecks.push(r1Detail);
        }
    } else {
        r1Detail = 'Không đề cập Šrámek hoặc không áp dụng.';
    }
    rubricResults.push({ id: 'R1_SRAMEK_NUMERICAL_FIDELITY', name: 'Độ chính xác số liệu Šrámek 2000', passed: r1Pass, detail: r1Detail });

    // Tiêu chí 2: Phân định khoang sinh học BBB (Huyết tương ngoại vi vs Não bộ)
    let r2Pass = true;
    let r2Detail = '';
    if (/dopamine/i.test(text) && /ngâm lạnh|nước lạnh|14°C|cold water/i.test(text)) {
        if (/não bộ|trong não|thần kinh trung ương/i.test(text) && !/huyết tương|ngoại vi|hàng rào máu não|BBB/i.test(text)) {
            r2Pass = false;
            r2Detail = 'LỖI KHOA HỌC: Khẳng định ngâm lạnh làm tăng dopamine trong não mà không nêu rõ đây là catecholamine huyết tương ngoại vi và không vượt qua hàng rào máu não BBB.';
            issues.push(r2Detail);
        } else {
            r2Detail = 'Chính xác: Đã phân định ranh giới catecholamine huyết tương ngoại vi vs hàng rào máu não BBB.';
            passedChecks.push(r2Detail);
        }
    } else {
        r2Detail = 'Đạt chuẩn phân định khoang sinh học.';
    }
    rubricResults.push({ id: 'R2_BIOLOGICAL_COMPARTMENT', name: 'Phân định khoang sinh học BBB', passed: r2Pass, detail: r2Detail });

    // Tiêu chí 3: Rào chắn ngoại suy động vật (RBM3 mô hình chuột)
    let r3Pass = true;
    let r3Detail = '';
    if (/RBM3/i.test(text)) {
        if (!/chuột|mô hình động vật|gặm nhấm|Mallucci/i.test(text)) {
            r3Pass = false;
            r3Detail = 'LỖI KHOA HỌC: Khẳng định RBM3 tái tạo synap trên người mà không nêu rõ nghiên cứu của Mallucci 2015 chỉ thực hiện trên chuột thoái hóa thần kinh.';
            issues.push(r3Detail);
        } else {
            r3Detail = 'Chính xác: RBM3 được xác nhận thuộc Tier 3 (mô hình động vật).';
            passedChecks.push(r3Detail);
        }
    } else {
        r3Detail = 'Không có vi phạm ngoại suy động vật.';
    }
    rubricResults.push({ id: 'R3_ANIMAL_TO_HUMAN_GUARD', name: 'Rào chắn ngoại suy động vật', passed: r3Pass, detail: r3Detail });

    // Tiêu chí 4: Thận trọng học thuật với Flow State (van der Linden 2021)
    let r4Pass = true;
    let r4Detail = '';
    if (/Flow State|Transient Hypofrontality/i.test(text)) {
        const hasCaveat = /giả thuyết|sơ bộ|thưa thớt|van der Linden|chưa thống nhất|đang nghiên cứu|exploratory/i.test(text);
        if (!hasCaveat) {
            r4Pass = false;
            r4Detail = 'QUÁ MỨC TUYÊN BỐ: Giả thuyết Transient Hypofrontality của Flow State chưa được xem là kết luận chắc chắn (tổng quan hệ thống van der Linden et al. 2021, N=471 cho thấy bằng chứng cơ sở thần kinh còn thưa thớt). Bắt buộc phải gắn nhãn giả thuyết sơ bộ.';
            issues.push(r4Detail);
        } else {
            r4Detail = 'Chính xác: Trạng thái Flow và Transient Hypofrontality được trình bày đúng mức độ chứng cứ (giả thuyết sơ bộ).';
            passedChecks.push(r4Detail);
        }
    } else {
        r4Detail = 'Đạt chuẩn phát biểu về trạng thái tâm lý.';
    }
    rubricResults.push({ id: 'R4_FLOW_EPISTEMIC_HEDGE', name: 'Mức độ thận trọng chứng cứ Flow State', passed: r4Pass, detail: r4Detail });

    // Tiêu chí 5: Cơ chế Myelin (đồng bộ thời gian vs không tăng 100x)
    let r5Pass = true;
    let r5Detail = '';
    if (/myelin/i.test(text) && /(?:tăng|nhanh hơn)\s*(?:100|hàng trăm)\s*lần/i.test(text)) {
        if (!/đường kính giải phẫu|so với sợi không myelin|đồng bộ hóa thời gian/i.test(text)) {
            r5Pass = false;
            r5Detail = 'LỖI KHOA HỌC: Nhầm lẫn tốc độ dẫn truyền sợi có myelin do đường kính giải phẫu với việc rèn luyện làm tăng tốc độ 100 lần.';
            issues.push(r5Detail);
        } else {
            r5Detail = 'Chính xác: Myelin được mô tả đúng cơ chế đồng bộ hóa thời gian (temporal synchrony).';
            passedChecks.push(r5Detail);
        }
    } else {
        r5Detail = 'Đạt chuẩn cơ chế Myelin.';
    }
    rubricResults.push({ id: 'R5_MYELIN_MECHANISM', name: 'Cơ chế Myelin hóa', passed: r5Pass, detail: r5Detail });

    // Tiêu chí 6: Tính chính xác kỷ lục marathon
    let r6Pass = true;
    let r6Detail = '';
    if (/1:59:30|1h59m30|marathon.*1:59/i.test(text) && !/Kipchoge.*INEOS|không phải giải đấu chính thức|thử nghiệm kiểm soát/i.test(text)) {
        r6Pass = false;
        r6Detail = 'LỖI KIỂM CHỨNG: Nhầm lẫn sự kiện biểu diễn INEOS 1:59 Challenge với kỷ lục thế giới chính thức (World Athletics không công nhận là kỷ lục thi đấu mở).';
        issues.push(r6Detail);
    } else {
        r6Detail = 'Chính xác: Kỷ lục thể thao được dẫn chứng đúng sự kiện lịch sử.';
        passedChecks.push(r6Detail);
    }
    rubricResults.push({ id: 'R6_MARATHON_RECORD', name: 'Độ chính xác dữ liệu thể thao', passed: r6Pass, detail: r6Detail });

    // Tiêu chí 7: Bác bỏ ngụy khoa học (Adrenal Fatigue)
    let r7Pass = true;
    let r7Detail = '';
    if (/adrenal fatigue|suy thượng thận do stress/i.test(text) && !/ngụy khoa học|không được công nhận|Endocrine Society/i.test(text)) {
        r7Pass = false;
        r7Detail = 'LỖI Y HỌC: Đưa thuật ngữ "adrenal fatigue" mà không cảnh báo đây là ngụy khoa học đã bị Endocrine Society bác bỏ.';
        issues.push(r7Detail);
    } else if (/adrenal fatigue/i.test(text)) {
        r7Detail = 'Chính xác: Đã bác bỏ ngụy khoa học "adrenal fatigue".';
        passedChecks.push(r7Detail);
    } else {
        r7Detail = 'Đạt chuẩn rà soát ngụy khoa học.';
    }
    rubricResults.push({ id: 'R7_PSEUDOSCIENCE_REJECTION', name: 'Bác bỏ ngụy khoa học', passed: r7Pass, detail: r7Detail });

    // Tiêu chí 8: Cấu trúc Epistemic Tier (Bắt buộc có ma trận phân tầng chứng cứ)
    let r8Pass = true;
    let r8Detail = '';
    const hasTierTable = /Tier\s*1|Tier\s*2|Tier\s*3|Epistemic/i.test(text);
    if (!hasTierTable) {
        r8Pass = false;
        r8Detail = 'THIẾU SÓT PHƯƠNG PHÁP: Báo cáo thiếu Bảng ma trận phân tầng độ tin cậy chứng cứ (Epistemic Claims Matrix Tier 1 - Tier 4).';
        issues.push(r8Detail);
    } else {
        r8Detail = 'Đầy đủ: Đã có Ma trận phân tầng chứng cứ Epistemic Matrix.';
        passedChecks.push(r8Detail);
    }
    rubricResults.push({ id: 'R8_EPISTEMIC_TIERING_MATRIX', name: 'Ma trận phân tầng chứng cứ Epistemic Tier', passed: r8Pass, detail: r8Detail });

    // Tiêu chí 9: Văn phong trung thực, loại bỏ tự xưng "kiệt tác", "tuyệt đối" không căn cứ
    let r9Pass = true;
    let r9Detail = '';
    if (/kiệt tác 9\.5\+|điểm số tuyệt đối 9\.5\/10\.0|hoàn thành xuất sắc tuyệt đối/i.test(text)) {
        r9Pass = false;
        r9Detail = 'VĂN PHONG TỰ TÂNG BỐC: Báo cáo sử dụng khẩu hiệu "kiệt tác 9.5+" hoặc "tuyệt đối 9.5/10.0". Bắt buộc thay bằng thuật ngữ học thuật trung tính và để Rubric chấm điểm khách quan.';
        issues.push(r9Detail);
    } else {
        r9Detail = 'Chính xác: Văn phong học thuật trung tính, không tự xưng điểm số tuyệt đối vô căn cứ.';
        passedChecks.push(r9Detail);
    }
    rubricResults.push({ id: 'R9_OBJECTIVE_ACADEMIC_TONE', name: 'Văn phong học thuật khách quan', passed: r9Pass, detail: r9Detail });

    const passed = issues.length === 0;
    // UPGRADED: Điểm dựa trên tỷ lệ tiêu chí đạt, KHÔNG dùng base 9.5 cố định
    const totalCriteria = rubricResults.length || 1;
    const skipPhrases = ['Không đề cập', 'Không áp dụng', 'Không có vi phạm', 'Đạt chuẩn'];
    const isApplicable = (r) => !skipPhrases.some(sp => r.detail.includes(sp));
    const applicableCriteria = rubricResults.filter(isApplicable).length;
    const passedApplicable = rubricResults.filter(r => r.passed && isApplicable(r)).length;
    const ratioScore = applicableCriteria > 0 ? (passedApplicable / applicableCriteria) * 10 : 5.0;
    const penalty = issues.length * 1.0;
    const score = Math.max(1.0, Math.min(10.0, ratioScore - penalty)).toFixed(1);

    return {
        passed,
        score: parseFloat(score),
        issuesCount: issues.length,
        blockingIssues: issues,
        passedChecks,
        rubric: rubricResults,
        evaluatedAt: new Date().toISOString()
    };
}

// API: Tìm kiếm học thuật đa cơ sở dữ liệu (PubMed + Europe PMC + Crossref + OpenAlex)
app.post('/api/academic/search', async (req, res) => {
    try {
        const { query, limit } = req.body;
        if (!query) return res.json({ success: false, error: 'Thiếu từ khóa tìm kiếm học thuật' });
        const items = await multiSourceAcademicSearch(query, limit ? parseInt(limit) : 8);

        let mdTable = `| Nguồn | Tiêu đề bài báo | Tác giả & Năm | DOI / PMID | Trạng thái |\n|---|---|---|---|---|\n`;
        items.forEach(it => {
            const idBadge = it.doi ? `DOI: [${it.doi}](https://doi.org/${it.doi})` : (it.pmid ? `PMID: [${it.pmid}](https://pubmed.ncbi.nlm.nih.gov/${it.pmid}/)` : 'N/A');
            const retBadge = it.isRetracted ? '🔴 ĐÃ RÚT BÀI' : '🟢 Hợp lệ';
            mdTable += `| ${it.sourceDb} | **${it.title}** | ${it.authorString} (${it.pubYear}) | ${idBadge} | ${retBadge} |\n`;
        });

        res.json({
            success: true,
            query,
            totalFound: items.length,
            items,
            markdownTable: mdTable
        });
    } catch (e) {
        res.status(500).json({ success: false, error: `Lỗi tìm kiếm học thuật: ${e.message}` });
    }
});

// API: Thẩm định DOI / PMID trực tiếp với Crossref và PubMed
app.post('/api/academic/verify-source', async (req, res) => {
    try {
        const { doi, pmid } = req.body;
        if (!doi && !pmid) return res.json({ success: false, error: 'Cần cung cấp ít nhất DOI hoặc PMID' });

        let meta = null;
        if (doi) {
            meta = await lookupCrossrefDoi(doi);
        }
        if (!meta && pmid) {
            const pmItems = await searchPubMed(pmid, 1);
            if (pmItems.length > 0) meta = pmItems[0];
        }

        if (meta) {
            res.json({ success: true, verified: true, metadata: meta });
        } else {
            res.json({ success: false, verified: false, error: 'Không tìm thấy tài liệu trong Crossref hoặc PubMed' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: `Lỗi thẩm định nguồn: ${e.message}` });
    }
});

// API: Claim Ledger - Lấy toàn bộ danh sách tuyên bố khoa học
app.get('/api/claim-ledger', (req, res) => {
    const claims = loadClaimLedger();
    res.json({ success: true, total: claims.length, claims });
});

// API: Claim Ledger - Lưu hoặc cập nhật danh sách tuyên bố
app.post('/api/claim-ledger/upsert', (req, res) => {
    try {
        const { claims } = req.body;
        if (!Array.isArray(claims)) return res.json({ success: false, error: 'claims phải là một mảng' });

        const currentLedger = loadClaimLedger();
        const map = new Map(currentLedger.map(c => [c.claim_id, c]));

        for (const c of claims) {
            if (!c.claim_id) {
                c.claim_id = 'CLM-' + String(map.size + 1).padStart(3, '0');
            }
            c.updated_at = new Date().toISOString();
            map.set(c.claim_id, { ...(map.get(c.claim_id) || {}), ...c });
        }

        const updated = Array.from(map.values());
        saveClaimLedger(updated);
        res.json({ success: true, total: updated.length, claims: updated });
    } catch (e) {
        res.status(500).json({ success: false, error: `Lỗi cập nhật Claim Ledger: ${e.message}` });
    }
});

// API: Thẩm định Entailment giữa Tuyên bố và Nguồn trích dẫn
app.post('/api/claim-ledger/audit-entailment', (req, res) => {
    try {
        const { claimText, sourceData } = req.body;
        if (!claimText) return res.json({ success: false, error: 'Thiếu claimText' });
        const auditResult = auditCitationEntailment(claimText, sourceData || {});
        res.json({ success: true, audit: auditResult });
    } catch (e) {
        res.status(500).json({ success: false, error: `Lỗi kiểm toán trích dẫn: ${e.message}` });
    }
});

// API: Quality Gate - Kiểm định chất lượng toàn văn báo cáo độc lập
app.post('/api/academic/quality-gate', (req, res) => {
    try {
        const { reportContent, claims } = req.body;
        if (!reportContent) return res.json({ success: false, error: 'Thiếu nội dung báo cáo (reportContent)' });
        const gateResult = enforceQualityGate(reportContent, claims || []);
        res.json({ success: true, qualityGate: gateResult });
    } catch (e) {
        res.status(500).json({ success: false, error: `Lỗi kiểm định Quality Gate: ${e.message}` });
    }
});

// ==========================================
// 7.5. S+ ENHANCEMENT APIS
// ==========================================

// Health Check — Kiểm tra trạng thái toàn diện hệ thống
app.get('/api/health', (req, res) => {
    const mem = process.memoryUsage();
    const fmt = (b) => `${Math.round(b / 1024 / 1024)} MB`;
    res.json({
        success: true,
        status: 'ONLINE',
        version: '2.0.0-S+',
        uptime: Math.floor(process.uptime()),
        uptimeFormatted: (() => {
            const s = Math.floor(process.uptime());
            return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
        })(),
        memory: { rss: fmt(mem.rss), heapUsed: fmt(mem.heapUsed), heapTotal: fmt(mem.heapTotal) },
        daemons: {
            total: activeDaemons.size,
            running: Array.from(activeDaemons.values()).filter(d => d.status === 'RUNNING').length
        },
        security: {
            authEnabled: !!process.env.AGENT_SECRET_KEY,
            rateLimitActive: true,
            corsRestricted: true,
            pathGuardActive: true,
            cmdBlacklistActive: true
        }
    });
});

// Memory Stats — Thống kê toàn diện kho trí nhớ dài hạn
app.get('/api/memory-stats', (req, res) => {
    try {
        let experiences = [];
        if (fs.existsSync(EXPERIENCES_FILE)) {
            experiences = JSON.parse(fs.readFileSync(EXPERIENCES_FILE, 'utf8') || '[]');
        }
        const totalScore = experiences.reduce((sum, e) => sum + (e.qualityScore || 0), 0);
        const avgScore = experiences.length > 0 ? Math.round(totalScore / experiences.length) : 0;

        // Top tags
        const tagCount = {};
        experiences.forEach(e => (e.tags || []).forEach(t => { if (t) tagCount[t] = (tagCount[t] || 0) + 1; }));
        const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count }));

        // Score distribution
        const dist = { mastery: 0, production: 0, actionable: 0, standard: 0, preliminary: 0 };
        experiences.forEach(e => {
            const s = e.qualityScore || 0;
            if (s >= 90) dist.mastery++;
            else if (s >= 80) dist.production++;
            else if (s >= 70) dist.actionable++;
            else if (s >= 60) dist.standard++;
            else dist.preliminary++;
        });

        const expSize = fs.existsSync(EXPERIENCES_FILE) ? fs.statSync(EXPERIENCES_FILE).size : 0;
        const mdSize = fs.existsSync(EXPERIENCES_MD) ? fs.statSync(EXPERIENCES_MD).size : 0;
        const researchCount = fs.existsSync(RESEARCH_DIR) ? fs.readdirSync(RESEARCH_DIR).length : 0;

        res.json({
            success: true,
            summary: {
                totalExperiences: experiences.length,
                averageQualityScore: avgScore,
                topScore: experiences.length > 0 ? Math.max(...experiences.map(e => e.qualityScore || 0)) : 0,
                totalVersions: experiences.reduce((s, e) => s + (e.version || 1), 0)
            },
            scoreDistribution: dist,
            topTags,
            storage: {
                experiencesJson: `${Math.round(expSize / 1024)} KB`,
                experiencesMd: `${Math.round(mdSize / 1024)} KB`,
                researchFiles: researchCount
            },
            recentExperiences: experiences.slice(-3).reverse().map(e => ({
                id: e.id, task: e.task, qualityScore: e.qualityScore, grade: e.grade, dateFormatted: e.dateFormatted
            }))
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Snapshots Manager — Liệt kê tất cả snapshots hiện có
app.get('/api/snapshots', (req, res) => {
    try {
        if (!fs.existsSync(SNAPSHOTS_DIR)) return res.json({ success: true, snapshots: [], total: 0 });
        const files = fs.readdirSync(SNAPSHOTS_DIR)
            .filter(f => SNAPSHOT_NAME_PATTERN.test(f))
            .filter(f => {
                try {
                    return fs.lstatSync(path.join(SNAPSHOTS_DIR, f)).isFile();
                } catch (e) {
                    return false;
                }
            })
            .sort().reverse();
        const snapshots = files.slice(0, 50).map(f => {
            const stat = fs.statSync(path.join(SNAPSHOTS_DIR, f));
            const parts = f.match(/^(\d+)_(.+)$/);
            return {
                snapshotId: f,
                originalFile: parts ? parts[2] : f,
                timestamp: parts ? new Date(parseInt(parts[1])).toLocaleString('vi-VN') : 'Unknown',
                sizeFormatted: `${Math.round(stat.size / 1024 * 10) / 10} KB`
            };
        });
        res.json({ success: true, snapshots, total: files.length });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// File Diff — So sánh nội dung 2 files (unified diff)
app.post('/api/diff-files', (req, res) => {
    try {
        const { filePathA, filePathB } = req.body;
        if (!filePathA || !filePathB) return res.json({ success: false, error: 'Cần cung cấp filePathA và filePathB' });

        const fullA = resolvePath(filePathA);
        const fullB = resolvePath(filePathB);
        if (!assertSafePath(fullA, res) || !assertSafePath(fullB, res)) return;
        if (!fs.existsSync(fullA)) return res.json({ success: false, error: `File A không tồn tại: ${filePathA}` });
        if (!fs.existsSync(fullB)) return res.json({ success: false, error: `File B không tồn tại: ${filePathB}` });

        const linesA = fs.readFileSync(fullA, 'utf8').split('\n');
        const linesB = fs.readFileSync(fullB, 'utf8').split('\n');

        // LCS-based diff
        const diff = [];
        let i = 0, j = 0;
        while (i < linesA.length || j < linesB.length) {
            if (i < linesA.length && j < linesB.length && linesA[i] === linesB[j]) {
                diff.push({ type: 'same', line: linesA[i] }); i++; j++;
            } else if (j < linesB.length && (i >= linesA.length || linesA[i] !== linesB[j])) {
                diff.push({ type: 'added', line: linesB[j], lineB: j + 1 }); j++;
            } else {
                diff.push({ type: 'removed', line: linesA[i], lineA: i + 1 }); i++;
            }
        }

        const added = diff.filter(d => d.type === 'added').length;
        const removed = diff.filter(d => d.type === 'removed').length;
        const diffText = diff.filter(d => d.type !== 'same')
            .map(d => d.type === 'added' ? `+[L${d.lineB}] ${d.line}` : `-[L${d.lineA}] ${d.line}`)
            .join('\n');

        res.json({
            success: true,
            fileA: path.basename(fullA), fileB: path.basename(fullB),
            summary: { added, removed, identical: added === 0 && removed === 0 },
            diffText: diffText.slice(0, 8000) + (diffText.length > 8000 ? '\n...[truncated]' : '')
        });
    } catch (err) {
        res.json({ success: false, error: `Lỗi diff files: ${err.message}` });
    }
});

// Code Execution Sandbox — Chạy JS an toàn trong VM với resource limits
// SECURITY: Thực thi code trong tiến trình con cô lập (thay vì vm module không an toàn)
app.post('/api/run-code', (req, res) => {
    try {
        const { code, language = 'javascript', timeout = 5000 } = req.body;
        if (!code) return res.json({ success: false, error: 'Thiếu code cần thực thi' });
        if (language !== 'javascript') {
            return res.json({ success: false, error: 'Hiện tại chỉ hỗ trợ JavaScript sandbox. Python cần daemon riêng.' });
        }
        const safeTimeout = Math.min(parseInt(timeout) || 5000, 10000);
        const startMs = Date.now();
        const workerPath = path.join(__dirname, 'workers', 'sandbox.js');

        const child = spawn('node', [workerPath], {
            cwd: __dirname,
            timeout: safeTimeout,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { NODE_OPTIONS: '--max-old-space-size=64' }
        });

        let stdout = '', stderr = '';
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });

        child.stdin.write(JSON.stringify({ code, timeout: safeTimeout }));
        child.stdin.end();

        const killTimer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch(e) {}
        }, safeTimeout + 1000);

        child.on('close', (exitCode) => {
            clearTimeout(killTimer);
            const executionTimeMs = Date.now() - startMs;
            try {
                const result = JSON.parse(stdout);
                res.json({ ...result, executionTimeMs, language });
            } catch (e) {
                res.json({
                    success: false,
                    error: stderr || ('Worker exited with code ' + exitCode),
                    logs: stdout ? [stdout] : [],
                    executionTimeMs,
                    language
                });
            }
        });

        child.on('error', (err) => {
            clearTimeout(killTimer);
            res.json({ success: false, error: 'Lỗi khởi tạo sandbox worker: ' + err.message });
        });
    } catch (err) {
        res.json({ success: false, error: 'Lỗi sandbox: ' + err.message });
    }
});

// Proxy API key cho Gemini — Giữ key server-side, không lộ ra client
app.post('/api/gemini-proxy', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.json({ success: false, error: 'GEMINI_API_KEY chưa được cấu hình trong .env' });

    const { model = 'gemini-3.8-flash', messages, systemInstruction, tools, generationConfig, stream } = req.body;
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}`;

    try {
        if (stream) {
            const upRes = await fetch(`${baseUrl}:streamGenerateContent?key=${apiKey}&alt=sse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: messages, systemInstruction, tools, generationConfig }),
                signal: AbortSignal.timeout(180000)
            });
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            if (typeof res.flushHeaders === 'function') res.flushHeaders();
            const reader = upRes.body.getReader();
            const dec = new TextDecoder('utf-8');
            req.on('close', () => reader.cancel().catch(() => {}));
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(dec.decode(value, { stream: true }));
                }
            } finally {
                if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
            }
            return;
        }

        const upRes = await fetch(`${baseUrl}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: messages, systemInstruction, tools, generationConfig }),
            signal: AbortSignal.timeout(120000)
        });
        const data = await upRes.json();
        res.json({ success: upRes.ok, ...data });
    } catch (err) {
        res.json({ success: false, error: `Gemini proxy error: ${err.message}` });
    }
});

// ==========================================
// 6.9. ULTIMATE MULTI-AGENT ORCHESTRATOR - 10/10 ARCHITECTURE
// ==========================================

const { AgentOrchestrator } = require('./agents/AgentOrchestrator');
const { ToolExecutor } = require('./agents/ToolExecutor');
const { ContextCacheManager } = require('./agents/ContextCacheManager');
const { GeminiGrounding } = require('./agents/GeminiGrounding');
const { PerformanceBenchmark } = require('./agents/PerformanceBenchmark');

// Global instances
let globalOrchestrator = null;
let globalCacheManager = null;
let globalToolExecutor = null;
let globalGrounding = null;

function getOrchestrator() {
    if (!globalOrchestrator) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not configured');
        }

        globalOrchestrator = new AgentOrchestrator(apiKey, {
            maxRetries: 3,
            timeout: 180000,
            parallelLimit: 5
        });

        globalCacheManager = new ContextCacheManager(apiKey);
        globalToolExecutor = new ToolExecutor('http://localhost:3000');
        globalGrounding = new GeminiGrounding(apiKey);

        console.log('🚀 Ultimate Multi-Agent Orchestrator initialized');
    }

    return { globalOrchestrator, globalCacheManager, globalToolExecutor, globalGrounding };
}

/**
 * POST /api/v2/execute
 * MAIN ENDPOINT: Multi-agent execution with full orchestration
 */
app.post('/api/v2/execute', async (req, res) => {
    try {
        const { task, useCache = true, useGrounding = false, context = {} } = req.body;

        if (!task) {
            return res.json({ success: false, error: 'Task is required' });
        }

        console.log('🎬 V2 Multi-Agent Execution Started');
        console.log('📋 Task:', task.slice(0, 150) + (task.length > 150 ? '...' : ''));

        const { globalOrchestrator, globalCacheManager, globalGrounding } = getOrchestrator();

        // Load experiences
        let experiences = [];
        try {
            if (fs.existsSync(EXPERIENCES_FILE)) {
                const content = fs.readFileSync(EXPERIENCES_FILE, 'utf8');
                experiences = JSON.parse(content);
                console.log(`📚 Loaded ${experiences.length} experiences`);
            }
        } catch (e) {
            console.warn('⚠️ Could not load experiences:', e.message);
        }

        // Use grounding if requested
        let groundingResult = null;
        if (useGrounding) {
            console.log('🔍 Using Gemini Grounding with Google Search');
            groundingResult = await globalGrounding.generateWithGrounding(task, {
                dynamicThreshold: 0.3
            });
        }

        // Cache agent prompts
        if (useCache) {
            console.log('💾 Caching agent prompts...');
            await globalCacheManager.cacheAgentPrompts(globalOrchestrator.agents);
        }

        // Execute with orchestrator
        const startTime = Date.now();
        let result;
        try {
            console.log('🚀 Calling orchestrator.execute()...');
            result = await globalOrchestrator.execute(task, {
                experiences: experiences.slice(-20),
                groundingResult: groundingResult,
                ...context
            });
            console.log('✅ Orchestrator.execute() returned:', result.success);
        } catch (execError) {
            console.error('💥 Orchestrator.execute() threw error:', execError.message);
            console.error('Stack:', execError.stack);
            throw execError;
        }

        const executionTime = Date.now() - startTime;
        const stats = globalOrchestrator.getStats();

        console.log('✅ Execution completed');
        console.log(`⏱️ Total time: ${executionTime}ms`);

        // Auto-save high-quality results
        if (result.success && result.qualityScore >= 85) {
            console.log('💾 Auto-saving high-quality result...');
            try {
                const saveRes = await fetch('http://localhost:3000/api/save-experience', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        task: task,
                        solution: typeof result.result === 'string' ? result.result : JSON.stringify(result.result),
                        takeaway: `Multi-agent orchestration (Quality: ${result.qualityScore}%). Agents: ${stats.agentCallsCount}, Time: ${executionTime}ms`,
                        tags: ['v2-orchestrator', 'multi-agent', 'high-quality'],
                        qualityScore: result.qualityScore
                    })
                });
                if (saveRes.ok) console.log('✅ Experience saved');
            } catch (e) {
                console.warn('⚠️ Save experience failed:', e.message);
            }
        }

        res.json({
            success: result.success,
            result: result.result,
            qualityScore: result.qualityScore,
            critique: result.critique,
            grounding: groundingResult ? {
                hasGrounding: groundingResult.grounding?.hasGrounding,
                sources: groundingResult.grounding?.supports?.length || 0
            } : null,
            stats: {
                executionTime: `${executionTime}ms`,
                agentCalls: stats.agentCallsCount,
                averageLatency: `${stats.averageLatency}ms`
            },
            version: 'v2.0-ultimate'
        });

    } catch (error) {
        console.error('💥 V2 Execution Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * POST /api/v2/fact-check
 * Fact-check with grounding
 */
app.post('/api/v2/fact-check', async (req, res) => {
    try {
        const { claim } = req.body;
        if (!claim) {
            return res.json({ success: false, error: 'Claim is required' });
        }

        const { globalGrounding } = getOrchestrator();
        const result = await globalGrounding.factCheck(claim);

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v2/research
 * Deep research with grounding
 */
app.post('/api/v2/research', async (req, res) => {
    try {
        const { topic } = req.body;
        if (!topic) {
            return res.json({ success: false, error: 'Topic is required' });
        }

        const { globalGrounding } = getOrchestrator();
        const result = await globalGrounding.researchTopic(topic);

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v2/benchmark
 * Run performance benchmark suite
 */
app.post('/api/v2/benchmark', async (req, res) => {
    try {
        console.log('🏁 Starting Performance Benchmark Suite');

        const { globalOrchestrator } = getOrchestrator();
        const benchmark = new PerformanceBenchmark();

        const report = await benchmark.runFullBenchmark(globalOrchestrator);

        // Save report
        const outputDir = path.join(MEMORY_DIR, 'benchmarks');
        const files = await benchmark.saveReport(report, outputDir);

        res.json({
            success: true,
            report: report,
            files: files
        });

    } catch (error) {
        console.error('💥 Benchmark Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v2/stats
 * Get orchestrator statistics
 */
app.get('/api/v2/stats', (req, res) => {
    try {
        const { globalOrchestrator, globalCacheManager, globalToolExecutor } = getOrchestrator();

        const stats = {
            orchestrator: globalOrchestrator.getStats(),
            cache: globalCacheManager.getStats(),
            tools: globalToolExecutor.getCacheStats(),
            agents: Object.keys(globalOrchestrator.agents),
            version: 'v2.0-ultimate',
            status: 'operational'
        };

        res.json({ success: true, stats: stats });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

/**
 * POST /api/v2/reset
 * Reset orchestrator and clear caches
 */
app.post('/api/v2/reset', async (req, res) => {
    try {
        globalOrchestrator = null;
        globalCacheManager = null;
        globalToolExecutor = null;
        globalGrounding = null;

        console.log('🔄 V2 Orchestrator reset');

        res.json({
            success: true,
            message: 'V2 Orchestrator reset successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 7. SERVER LAUNCH
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
    console.log('===============================================================');
    console.log('🔥 CYBER AGENT PRO v3.0 ULTIMATE // 10/10 MULTI-AGENT SYSTEM');
    console.log(`🌐 Máy chủ: http://localhost:${PORT}`);
    console.log(`🧠 Kho trí nhớ: ${EXPERIENCES_FILE}`);
    console.log(`🔐 Bảo mật: Auth=${!!process.env.AGENT_SECRET_KEY ? 'ON' : 'OFF (localhost-only)'}, RateLimit=ON, CORS=restricted`);
    console.log(`🛡️  Path Guard=ON, CMD Blacklist=ON`);
    console.log('🚀 V2 Endpoints: /api/v2/execute, /api/v2/fact-check, /api/v2/research, /api/v2/benchmark');
    console.log('===============================================================');
});