/**
 * batch_shorts_downloader.js
 * Regulated Multi-Platform Shorts Downloader Worker (Background Process)
 * Enforces duration <= 60 seconds, concurrent fragments, and live progress reporting.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
let targetQuery = args[0] || 'https://www.youtube.com/@TEDEd/shorts';
let maxCount = parseInt(args[1], 10) || 50;
let maxDurationSec = parseInt(args[2], 10) || 60;
let outputDir = args[3] || path.join('C:', 'Users', 'Nam', 'Desktop', 'gemini', '2026-10-25', 'shorts_50');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('================================================================');
console.log('🎬 [SHORTS WORKER] BẮT ĐẦU TÁC VỤ TẢI 50 VIDEO SHORT DƯỚI 1 PHÚT');
console.log(`🎯 Nguồn / Kênh: ${targetQuery}`);
console.log(`📊 Số lượng mục tiêu: ${maxCount} video`);
console.log(`⏱️ Thời lượng tối đa: <= ${maxDurationSec} giây (chuẩn Short/Reel)`);
console.log(`📁 Thư mục lưu trữ: ${outputDir}`);
console.log('================================================================\n');

function md5File(filePath) {
    try {
        const hash = crypto.createHash('md5');
        const data = fs.readFileSync(filePath);
        hash.update(data);
        return hash.digest('hex');
    } catch (e) {
        return 'N/A';
    }
}

async function run() {
    const existingBefore = new Set(
        fs.readdirSync(outputDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'))
    );

    const ytArgs = [
        '--no-warnings',
        '--ignore-errors',
        '--match-filter', `duration <= ${maxDurationSec} & duration >= 2`,
        '--playlist-end', String(Math.max(80, maxCount * 3)),
        '--max-downloads', String(maxCount),
        '--format', 'mp4/best[ext=mp4]/best',
        '--concurrent-fragments', '3',
        '-o', path.join(outputDir, '%(title).45s_%(id)s.%(ext)s'),
        targetQuery
    ];

    console.log('🚀 Đang chạy lệnh tải với bộ lọc Short <= 60s...');
    console.log('[PROGRESS] 0/' + maxCount + ' (0%): Bắt đầu quét và tải danh sách Shorts...');

    const child = spawn('yt-dlp', ytArgs, {
        cwd: outputDir,
        shell: false,
        windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let downloadedCount = 0;

    child.stdout.on('data', chunk => {
        const text = chunk.toString();
        stdout += text;

        const lines = text.split('\n');
        for (const line of lines) {
            const clean = line.trim();
            if (clean.includes('[download] Destination:') || clean.includes('100% of')) {
                try {
                    const currentFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'));
                    const newDownloaded = currentFiles.filter(f => !existingBefore.has(f));
                    downloadedCount = newDownloaded.length;
                    const percent = Math.min(100, Math.round((downloadedCount / maxCount) * 100));
                    console.log(`[PROGRESS] ${downloadedCount}/${maxCount} (${percent}%): Đã tải ${downloadedCount}/${maxCount} video ngắn`);
                } catch (e) {}
            }
        }
    });

    child.stderr.on('data', chunk => {
        stderr += chunk.toString();
    });

    child.on('close', code => {
        console.log(`\n🏁 Tiến trình tải hoàn tất (Mã thoát: ${code})`);

        const finalFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')).map((file, idx) => {
            const p = path.join(outputDir, file);
            const st = fs.statSync(p);
            return {
                index: idx + 1,
                name: file,
                sizeBytes: st.size,
                sizeMB: (st.size / 1024 / 1024).toFixed(2),
                md5: md5File(p),
                path: p,
                downloadedAt: st.mtime.toISOString()
            };
        });

        console.log(`\n================================================================`);
        console.log(`📊 TỔNG KẾT TÁC VỤ CHẠY NGẦM:`);
        console.log(`- Tổng số video Shorts/Reels có trong thư mục: ${finalFiles.length}`);
        console.log(`- Kích thước tổng cộng: ${(finalFiles.reduce((s, f) => s + f.sizeBytes, 0) / 1024 / 1024).toFixed(1)} MB`);
        console.log(`================================================================\n`);

        const auditReport = {
            task: 'Tải 50 video Short/Reel dưới 1 phút chạy ngầm',
            targetCount: maxCount,
            actualCount: finalFiles.length,
            isFullSuccess: finalFiles.length >= maxCount,
            outputDirectory: outputDir,
            maxDurationFilter: `${maxDurationSec}s`,
            completedAt: new Date().toISOString(),
            files: finalFiles
        };

        const jsonPath = path.join(outputDir, 'bao_cao_50_shorts.json');
        fs.writeFileSync(jsonPath, JSON.stringify(auditReport, null, 2), 'utf8');

        const mdPath = path.join(outputDir, 'BAO_CAO_50_SHORTS.md');
        let md = `# 📊 Báo Cáo Nghiệm Thu 50 Video Short (Thời Lượng < 1 Phút)\n\n`;
        md += `- **Thời điểm hoàn thành:** ${new Date().toLocaleString('vi-VN')}\n`;
        md += `- **Kênh nguồn:** \`${targetQuery}\`\n`;
        md += `- **Bộ lọc thời lượng:** Video ngắn $\\le 60$ giây (Shorts/Reels)\n`;
        md += `- **Tổng số video:** ${finalFiles.length} file MP4\n`;
        md += `- **Tổng dung lượng:** ${(finalFiles.reduce((s, f) => s + f.sizeBytes, 0) / 1024 / 1024).toFixed(1)} MB\n`;
        md += `- **Thư mục lưu trữ:** \`${outputDir}\`\n\n`;
        md += `| STT | Tên file video | Dung lượng | Mã MD5 |\n| :---: | :--- | :---: | :--- |\n`;
        finalFiles.forEach(f => {
            md += `| ${f.index} | \`${f.name}\` | **${f.sizeMB} MB** | \`${f.md5.slice(0, 10)}...\` |\n`;
        });
        fs.writeFileSync(mdPath, md, 'utf8');

        console.log(`[PROGRESS] ${finalFiles.length}/${maxCount} (100%): Hoàn tất nghiệm thu toàn bộ!`);
        console.log(`📄 Đã lưu báo cáo JSON: ${jsonPath}`);
        console.log(`📄 Đã lưu báo cáo Markdown: ${mdPath}`);
        process.exit(code === 0 ? 0 : (finalFiles.length > 0 ? 0 : 1));
    });

    child.on('error', err => {
        console.error('❌ Lỗi worker:', err.message);
        process.exit(1);
    });
}

run();
