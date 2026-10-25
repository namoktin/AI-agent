const fs = require('fs');
const path = require('path');

const workDir = process.env.WORK_DIR || process.cwd();
const outputFile = path.join(workDir, 'stress_test_a_results.json');

console.log('🚀 [TASK 9A] Bắt đầu tác vụ chạy song song A (Stress Test Thread A)...');

async function run() {
    const total = 8;
    for (let i = 1; i <= total; i++) {
        const percent = Math.round((i / total) * 100);
        console.log(`[PROGRESS] ${i}/${total} (${percent}%): Luồng song song A đang tính toán pha ${i}/${total}`);
        await new Promise(r => setTimeout(r, 120));
    }
    fs.writeFileSync(outputFile, JSON.stringify({ thread: 'A', status: 'COMPLETED', timestamp: new Date().toISOString() }), 'utf8');
    console.log(`✅ [TASK 9A] Hoàn thành luồng song song A!`);
}

run().catch(err => {
    console.error('❌ [TASK 9A] Lỗi:', err);
    process.exit(1);
});
