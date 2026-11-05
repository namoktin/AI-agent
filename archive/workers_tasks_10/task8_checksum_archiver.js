const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const workDir = process.env.WORK_DIR || process.cwd();
const outputFile = path.join(workDir, 'backup_manifest.json');

console.log('🚀 [TASK 8] Bắt đầu tính toán mã băm SHA256 xác thực toàn vẹn tệp...');

async function run() {
    // Scan all files in workDir
    const files = fs.readdirSync(workDir).filter(f => !f.endsWith('.log') && f !== 'backup_manifest.json');
    const total = Math.max(1, files.length);
    const manifest = [];

    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const p = path.join(workDir, f);
        const st = fs.statSync(p);
        if (st.isFile()) {
            const hash = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
            manifest.push({
                file: f,
                sizeBytes: st.size,
                sha256: hash,
                modified: st.mtime.toISOString()
            });
        }
        const percent = Math.round(((i + 1) / total) * 100);
        console.log(`[PROGRESS] ${i + 1}/${total} (${percent}%): Đã băm SHA256 cho tệp: ${f}`);
        await new Promise(r => setTimeout(r, 60));
    }

    fs.writeFileSync(outputFile, JSON.stringify({ verifiedFilesCount: manifest.length, manifest }, null, 2), 'utf8');
    console.log(`✅ [TASK 8] Đã tạo Backup Manifest với ${manifest.length} tệp tại ${outputFile}`);
}

run().catch(err => {
    console.error('❌ [TASK 8] Lỗi:', err);
    process.exit(1);
});
