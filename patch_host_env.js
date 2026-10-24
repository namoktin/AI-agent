const fs = require('fs');
const path = require('path');

const orchPath = path.join(__dirname, 'agents', 'AgentOrchestrator.js');
let orchContent = fs.readFileSync(orchPath, 'utf8');

const envNote = `\n\n**MÔI TRƯỜNG THỰC THI (HOST OS):** Hệ thống đang chạy TRỰC TIẾP trên máy trạm Windows 11 cục bộ của người dùng (Native Windows Host, KHÔNG PHẢI Linux Sandbox hay Docker container). Mọi đường dẫn tệp dạng "C:\\Users\\..." là ĐƯỜNG DẪN VẬT LÝ HỢP LỆ VÀ CÓ THẬT 100%. TUYỆT ĐỐI KHÔNG coi đường dẫn Windows ổ C:\\ là ảo giác hay sandbox error.`;

// Thêm vào Director prompt
if (!orchContent.includes('**MÔI TRƯỜNG THỰC THI (HOST OS):**')) {
    orchContent = orchContent.replace(
        "TUYỆT ĐỐI KHÔNG coi năm 2026 là tương lai hay ảo giác.",
        `TUYỆT ĐỐI KHÔNG coi năm 2026 là tương lai hay ảo giác.${envNote}`
    );
    fs.writeFileSync(orchPath, orchContent, 'utf8');
    console.log('✅ Đã thêm Host OS Grounding vào AgentOrchestrator.js!');
} else {
    console.log('ℹ️ Host OS Grounding đã tồn tại.');
}

