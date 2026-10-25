const fs = require('fs');
const path = require('path');

const workDir = process.env.WORK_DIR || process.cwd();
const outputFile = path.join(workDir, 'stress_test_b_results.json');

console.log('🚀 [TASK 9B] Bắt đầu tác vụ chạy song song B (Stress Test Thread B)...');

async function run() {
    const total = 8;
    for (let i = 1; i <= total; i++) {
        const percent = Math.round((i / total) * 100);
        console.log(`[PROGRESS] ${i}/${total} (${percent}%): Luồng song song B đang tính toán pha ${i}/${total}`);
        await new Promise(r => setTimeout(r, 120));
    }
    fs.writeFileSync(outputFile, JSON.stringify({ thread: 'B', status: 'COMPLETED', timestamp: new Date().toISOString() }), 'utf8');
    console.log(`✅ [TASK 9B] Hoàn thành luồng song song B!`);
}

run().catch(err => {
    console.error('❌ [TASK 9B] Lỗi:', err);
    process.exit(1);
});
