const fs = require('fs');
const path = require('path');

const workDir = process.env.WORK_DIR || process.cwd();
const outputFile = path.join(workDir, 'entity_extraction_results.json');

console.log('🚀 [TASK 4] Bắt đầu trích xuất thực thể thông minh (Entity Extraction)...');

const corpus = [
    "Google DeepMind công bố hệ thống AlphaFold 3 vào ngày 08/05/2024 tại London với sự tài trợ 50,000,000 USD.",
    "OpenAI ra mắt GPT-4o tại San Francisco dưới sự điều hành của Sam Altman với chi phí vận hành 100,000 USD mỗi ngày.",
    "Microsoft đầu tư 10,000,000,000 USD vào trung tâm dữ liệu AI tại Wisconsin, Mỹ.",
    "NVIDIA thông báo kiến trúc GPU Blackwell B200 tại hội nghị GTC 2024 ở San Jose với giá 30,000 USD.",
    "Meta phát hành mô hình mã nguồn mở Llama 3 70B của Mark Zuckerberg với 15 nghìn tỷ token huấn luyện.",
    "Apple giới thiệu Apple Intelligence vào tháng 06/2024 tại Cupertino dưới sự dẫn dắt của Tim Cook.",
    "Anthropic huy động được 4,000,000,000 USD từ Amazon cho dòng mô hình Claude 3.5 Sonnet.",
    "Tesla triển khai Full Self-Driving V12 tại Texas dựa trên mạng nơ-ron đầu cuối của Elon Musk."
];

async function run() {
    const total = corpus.length;
    const results = [];

    for (let i = 0; i < total; i++) {
        const text = corpus[i];
        
        // Extract organizations
        const orgMatches = text.match(/\b(Google|DeepMind|OpenAI|Microsoft|NVIDIA|Meta|Apple|Anthropic|Tesla|Amazon)\b/g) || [];
        // Extract people
        const peopleMatches = text.match(/\b(Sam Altman|Mark Zuckerberg|Tim Cook|Elon Musk)\b/g) || [];
        // Extract monetary amounts
        const moneyMatches = text.match(/\b[\d,]+(?:\.\d+)?\s*(?:USD|nghìn tỷ|triệu)\b/g) || [];
        // Extract locations
        const locMatches = text.match(/\b(London|San Francisco|Wisconsin|Mỹ|San Jose|Cupertino|Texas)\b/g) || [];

        results.push({
            id: i + 1,
            originalText: text,
            entities: {
                organizations: [...new Set(orgMatches)],
                people: [...new Set(peopleMatches)],
                monetaryAmounts: moneyMatches,
                locations: [...new Set(locMatches)]
            }
        });

        const percent = Math.round(((i + 1) / total) * 100);
        console.log(`[PROGRESS] ${i + 1}/${total} (${percent}%): Đã phân tích văn bản #${i + 1}`);
        await new Promise(r => setTimeout(r, 90));
    }

    fs.writeFileSync(outputFile, JSON.stringify({ totalDocuments: total, extractions: results }, null, 2), 'utf8');
    console.log(`✅ [TASK 4] Đã hoàn thành trích xuất thực thể vào ${outputFile}`);
}

run().catch(err => {
    console.error('❌ [TASK 4] Lỗi:', err);
    process.exit(1);
});
