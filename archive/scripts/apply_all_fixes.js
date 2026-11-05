const fs = require('fs');
const path = require('path');

console.log('🔧 [1/2] Đang cập nhật server.js (hỗ trợ UTF-8 cho Python trên Windows)...');
const serverPath = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

// Thay thế spawn trong runSafeCommand
const targetSpawn = `    const child = spawn(parsed.file, parsed.args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });`;

const targetSpawnCRLF = targetSpawn.replace(/\n/g, '\r\n');

const replacementSpawn = `    const child = spawn(parsed.file, parsed.args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PYTHONUTF8: '1',
            PYTHONIOENCODING: 'utf-8'
        }
    });`;

const replacementSpawnCRLF = replacementSpawn.replace(/\n/g, '\r\n');

if (serverContent.includes(targetSpawnCRLF)) {
    serverContent = serverContent.replace(targetSpawnCRLF, replacementSpawnCRLF);
    fs.writeFileSync(serverPath, serverContent, 'utf8');
    console.log('✅ Đã cập nhật server.js thành công (CRLF).');
} else if (serverContent.includes(targetSpawn)) {
    serverContent = serverContent.replace(targetSpawn, replacementSpawn);
    fs.writeFileSync(serverPath, serverContent, 'utf8');
    console.log('✅ Đã cập nhật server.js thành công (LF).');
} else {
    console.log('⚠️ Không tìm thấy vị trí spawn chính xác trong server.js.');
}

console.log('\n🔧 [2/2] Đang cập nhật agents/AgentOrchestrator.js (Model pool, Temporal grounding, Ground truth)...');
const orchPath = path.join(__dirname, 'agents', 'AgentOrchestrator.js');
let orchContent = fs.readFileSync(orchPath, 'utf8');

// 1. Cập nhật MODEL_POOL
const oldModelPool = `            const MODEL_POOL = [
                'gemini-3.5-flash-lite',
                'gemini-3.1-flash-lite',
                'gemini-3-flash-preview',
                'gemini-3.5-flash'
            ];`;

const newModelPool = `            const MODEL_POOL = [
                'gemini-3.5-flash-lite',
                'gemini-3.1-flash-lite',
                'gemini-3.1-flash-lite-preview',
                'gemini-flash-lite-latest'
            ];`;

if (orchContent.includes(oldModelPool)) {
    orchContent = orchContent.replace(oldModelPool, newModelPool);
    console.log('✅ Đã cập nhật MODEL_POOL thành công.');
} else {
    console.log('⚠️ Không tìm thấy old MODEL_POOL.');
}

// 2. Cập nhật model mặc định của Director, Coordinator, Researcher
orchContent = orchContent.replace("role: 'director',\n                model: 'gemini-3.5-flash',", "role: 'director',\n                model: 'gemini-3.5-flash-lite',");
orchContent = orchContent.replace("role: 'coordinator',\n                model: 'gemini-3.1-flash-lite',", "role: 'coordinator',\n                model: 'gemini-3.1-flash-lite-preview',");
orchContent = orchContent.replace("role: 'researcher',\n                model: 'gemini-3-flash-preview',", "role: 'researcher',\n                model: 'gemini-3.5-flash-lite',");

// 3. Thêm Temporal Grounding & Ground Truth vào System Prompts
const temporalNote = `\n\n**THỜI GIAN HỆ THỐNG:** Hôm nay là ngày 23 tháng 10 năm 2026. Mọi ấn phẩm, bài báo khoa học, video hoặc tài liệu năm 2026 là hoàn toàn hợp lệ trong thời gian thực. TUYỆT ĐỐI KHÔNG coi năm 2026 là tương lai hay ảo giác.`;

// Director prompt
orchContent = orchContent.replace(
    "- Tận dụng dữ liệu kiểm chứng (grounding) nếu có",
    `- Tận dụng dữ liệu kiểm chứng (grounding) nếu có${temporalNote}`
);

// Researcher prompt
orchContent = orchContent.replace(
    "4. Luôn phân biệt rõ ràng giữa Fact (sự thật có bằng chứng) và Opinion (ý kiến)",
    `4. Luôn phân biệt rõ ràng giữa Fact (sự thật có bằng chứng) và Opinion (ý kiến)
5. TUYỆT ĐỐI KHÔNG dùng domain giả mạo (.example, dummy URLs). Mọi link BẮT BUỘC phải lấy từ nguồn thực tế (WEB_SEARCH, ACADEMIC_SEARCH, READ_URL).${temporalNote}`
);

// Developer prompt
orchContent = orchContent.replace(
    "4. Tuân thủ nghiêm ngặt chuẩn mực bảo mật và clean code",
    `4. Tuân thủ nghiêm ngặt chuẩn mực bảo mật và clean code
5. QUY TẮC BẮT BUỘC KHI KIỂM TOÁN/PHÂN TÍCH MÃ NGUỒN CỤC BỘ: BẮT BUỘC dùng LIST_FILES để quét các file thực tế trong thư mục (ví dụ utils/, middleware/) trước khi đọc hoặc báo cáo. TUYỆT ĐỐI KHÔNG tự bịa đặt, phỏng đoán hoặc đặt tên file giả (như fileHandler.js, runner.js, session.js, dbWriter.js). Mọi tên file được nêu trong báo cáo BẮT BUỘC phải tồn tại trên đĩa cứng.
6. TUYỆT ĐỐI KHÔNG dùng domain giả mạo (.example, dummy URLs). Mọi link BẮT BUỘC phải lấy từ nguồn thực tế.${temporalNote}`
);

// Critic prompt
orchContent = orchContent.replace(
    "- Với các nhiệm vụ yêu cầu tạo ra sản phẩm thực tế (code, file, media, video, tài liệu): Phải đối chiếu xem file đó có thực sự được tạo/tải về máy tính hay không.",
    `- Với các nhiệm vụ yêu cầu tạo ra sản phẩm thực tế (code, file, media, video, tài liệu): Phải đối chiếu xem file đó có thực sự được tạo/tải về máy tính hay không.
- QUY TẮC ĐỐI CHIẾU FILE THỰC TẾ: Khi kiểm định báo cáo mã nguồn, Critic BẮT BUỘC dùng LIST_FILES hoặc READ_FILE để đối chiếu xem các file Developer nhắc tới có tồn tại trên đĩa thật hay không. Nếu phát hiện file bịa đặt, BẮT BUỘC REJECT ngay lập tức.${temporalNote}`
);

fs.writeFileSync(orchPath, orchContent, 'utf8');
console.log('✅ Đã cập nhật agents/AgentOrchestrator.js thành công!');

