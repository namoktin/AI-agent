const fs = require('fs');
const path = require('path');
const AgentOrchestrator = require('./agents/AgentOrchestrator');

// Load environment variables
const envPath = path.join(__dirname, '.env');
let geminiKey = '';
if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    env.split('\n').forEach(line => {
        const m = line.match(/^GEMINI_API_KEY=(.*)$/);
        if (m) geminiKey = m[1].trim();
    });
}

if (!geminiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env');
    process.exit(1);
}

const MASTER_COMMAND_PROMPT = `BẠN LÀ CYBER AGENT PRO — TỔ HỢP MULTI-AGENT THỰC THI DOANH NGHIỆP CẤP ENTERPRISE.
NHIỆM VỤ TỐI THƯỢNG: TỰ TAY THIẾT KẾ VÀ LẬP TRÌNH 100% HOÀN CHỈNH MỘT HỆ THỐNG AI AGENT TỰ TRỊ THẾ HỆ MỚI: "AURA-AGENT" (Autonomous Unified Revenue & Research Agent).

Chủ tịch và Tổng công trình sư muốn kiểm tra năng lực tối đa của bạn trong việc tạo ra một cỗ máy AI mới có khả năng tự vận hành và tự kinh doanh.

YÊU CẦU KIẾN TRÚC VÀ TÍNH NĂNG BẮT BUỘC CỦA AURA-AGENT:
1. KIẾN TRÚC MULTI-AGENT PHÂN TÁN (Autonomous Multi-Agent Architecture):
   - Có Director/Planner: Phân tích mục tiêu, đặt ra tiêu chuẩn nghiệm thu và chia việc.
   - Có Market Researcher: Tự động quét cơ hội, cào dữ liệu và phân tích nhu cầu thị trường.
   - Có Code/Product Builder: Tự động viết script, đóng gói sản phẩm số (bộ dữ liệu, công cụ mini).
   - Có Adversarial Verifier: Kiểm tra chéo chất lượng sản phẩm, phát hiện lỗi trước khi xuất bản.

2. MODULE VÍ TIỀN ẢO & SỔ CÁI P&L (Paper Trading Virtual Wallet & Financial Ledger):
   - Khởi tạo vốn ảo ban đầu (ví dụ: $100.00 USD ảo).
   - Tự động trừ chi phí vận hành ảo (tiền token API, chi phí proxy/server giả định).
   - Hàm ghi nhận doanh thu ảo khi có đơn hàng (record_revenue) từ khách hàng.
   - Tự động tính toán P&L (Profit & Loss), Net Profit, Tỷ suất lợi nhuận ròng (Net Margin %) và ROI.
   - Cơ chế Human-in-the-Loop (HITL) Gate: Khi một khoản chi vượt ngưỡng an toàn (ví dụ > $10) hoặc có rủi ro, hệ thống tự động tạm dừng để xin phê duyệt từ con người.

3. BỘ CÔNG CỤ THỰC THI TỰ HÀNH (Tool Calling Framework):
   - Công cụ cào web, tìm kiếm dữ liệu thị trường và bóc tách nội dung.
   - Công cụ quản lý tệp tin và lưu trữ dữ liệu an toàn.

4. YÊU CẦU VỀ ĐỘ HOÀN THIỆN MÃ NGUỒN (Zero-Placeholder Production Code):
   - Viết toàn bộ mã nguồn bằng Python 3 hoàn chỉnh, CHẠY ĐƯỢC NGAY LẬP TỨC.
   - Tuyệt đối KHÔNG ĐƯỢC có các đoạn dang dở kiểu: TODO, FIXME, unimplemented, pass, hay placeholder.
   - Cung cấp đầy đủ nội dung từng file trong các khối code block rõ ràng:
     + File 1: core/wallet.py (Virtual Wallet, P&L Ledger, HITL Approval Gate)
     + File 2: core/tools.py (Autonomous Web Scraper, Data Extractor, File Manager)
     + File 3: core/orchestrator.py (Multi-Agent Coordinator, Task Dispatcher, Adversarial Verifier)
     + File 4: main.py (File thực thi hoàn chỉnh, nạp $100 vốn ảo, chạy 1 chu trình tự tìm cơ hội, tự tính P&L và xuất báo cáo tài chính)
     + File 5: README.md (Bản thuyết minh kiến trúc, hướng dẫn chạy và đánh giá tiềm năng mở rộng)

Hãy khởi động toàn bộ trí tuệ, khả năng lập trình và chiều sâu kỹ thuật của bạn để tạo ra cỗ máy AI xuất sắc nhất!`;

async function main() {
    console.log('===============================================================');
    console.log('🚀 KHỞI ĐỘNG NHIỆM VỤ: CYBER AGENT PRO TỰ TẠO RA AI MỚI (AURA)');
    console.log('===============================================================');
    const startTime = Date.now();

    const orchestrator = new AgentOrchestrator(geminiKey, {
        timeout: 600000,
        maxRetries: 3
    });

    console.log('📡 Đang gửi Mệnh lệnh Tối thượng đến Cyber Agent Pro...');
    console.log('⏳ Quá trình suy luận và lập trình đa tác nhân đang diễn ra...\n');

    try {
        const response = await orchestrator.execute(MASTER_COMMAND_PROMPT, {
            mode: 'standard',
            useCustomAi: false // Sử dụng Google Gemini API chính thức đang hoạt động 100%
        });

        const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n🎉 CYBER AGENT PRO ĐÃ HOÀN THÀNH NHIỆM VỤ trong ${durationSec}s!`);

        const outputDir = path.join(__dirname, 'generated_new_ai');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const rawResult = response.result || '';
        const textResult = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);

        // Lưu toàn bộ kết quả phản hồi của Cyber Agent Pro
        fs.writeFileSync(path.join(outputDir, 'cyber_agent_response.txt'), textResult, 'utf8');

        // Bóc tách các file code do Cyber Agent Pro sinh ra
        const codeBlockRegex = /```(?:python|py|markdown|md|json)?\s*(?:#|<!--)?\s*(?:File(?:\s+\d+)?:?)?\s*([a-zA-Z0-9_\-\./\\]+\.(?:py|md|json))?\n([\s\S]*?)```/gi;
        let match;
        const extractedFiles = [];

        // Thử regex chuẩn
        while ((match = codeBlockRegex.exec(textResult)) !== null) {
            let fileName = match[1];
            const fileContent = match[2].trim();

            if (!fileName) {
                // Thử tìm tên file ở dòng đầu tiên của code
                const firstLine = fileContent.split('\n')[0];
                const fnMatch = firstLine.match(/(?:#|<!--|\/\/)\s*([a-zA-Z0-9_\-\./\\]+\.(?:py|md|json))/i);
                if (fnMatch) {
                    fileName = fnMatch[1];
                }
            }

            if (fileName && fileContent.length > 50) {
                extractedFiles.push({ fileName: fileName.trim(), content: fileContent });
            }
        }

        console.log(`\n📦 Số file mã nguồn bóc tách được từ phản hồi: ${extractedFiles.length}`);

        // Lưu các file bóc tách được vào thư mục generated_new_ai
        for (const file of extractedFiles) {
            const cleanName = file.fileName.replace(/^[\\\/]+/, '');
            const targetPath = path.join(outputDir, cleanName);
            const parentDir = path.dirname(targetPath);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }
            fs.writeFileSync(targetPath, file.content, 'utf8');
            console.log(`  💾 Đã lưu file do Cyber Agent Pro tạo: ${cleanName} (${file.content.length} ký tự)`);
        }

        const stats = response.stats || orchestrator.getStats();
        console.log('\n📊 THỐNG KÊ PHIÊN CHẠY:');
        console.log(`- Thời gian: ${durationSec}s`);
        console.log(`- Độ dài văn bản sinh ra: ${textResult.length} ký tự`);
        console.log(`- Tokens: ${stats.totalTokens || 'N/A'}`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi trong quá trình Cyber Agent Pro thực thi:', err);
        process.exit(1);
    }
}

main();

