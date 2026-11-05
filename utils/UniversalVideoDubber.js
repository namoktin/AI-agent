/**
 * UniversalVideoDubber.js
 * Cyber Agent Pro v5.5 Enterprise
 * 
 * Engine Tự Động Hóa Xử Lý Video Đa Nền Tảng (Cross-Platform) & Lồng Tiếng Đúng Nghĩa:
 * - Thu thập video từ YouTube (Shorts), Facebook (Reels), TikTok, Instagram, X/Twitter, hoặc tệp cục bộ.
 * - Nhận diện giọng nói gốc bằng Whisper AI (Speech-to-Text).
 * - Dịch thuật sát nghĩa sang tiếng Việt ("đúng nghĩa", tự nhiên, chuẩn ngữ cảnh).
 * - Chuyển văn bản thành giọng đọc tiếng Việt bằng gTTS / Edge-TTS (100% miễn phí).
 * - Hòa âm studio FFmpeg Audio Ducking chuyên nghiệp (giảm nhạc nền 15%, lời đọc 150%).
 * - Đảm bảo tệp vật lý 100% trên đĩa cứng, không bao giờ dùng code giả lập.
 */

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

class UniversalVideoDubber {
    constructor(baseDir = 'C:\\Users\\Nam\\Desktop\\AI agent') {
        this.baseDir = baseDir;
        this.scriptPath = path.join(this.baseDir, 'utils', 'universal_video_dubber.py');
    }

    /**
     * Kích hoạt pipeline lồng tiếng đúng nghĩa đa nền tảng
     * @param {Object} options
     * @param {string} options.target - Kênh, link video hoặc từ khóa tìm kiếm (YouTube, Facebook, v.v.)
     * @param {number} options.count - Số lượng video cần xử lý (mặc định 5)
     * @param {string} options.outputDir - Thư mục xuất bản
     * @param {number} options.maxDuration - Thời lượng tối đa (giây, mặc định 60 cho shorts)
     * @returns {Promise<Array>} Danh sách kết quả video thành phẩm
     */
    async executeDubbingPipeline({ target = '', count = 5, outputDir = null, maxDuration = 60 } = {}) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const resolvedOutputDir = outputDir || path.join('C:\\Users\\Nam\\Desktop\\gemini', todayStr);
        return new Promise((resolve, reject) => {
            const manifestPath = path.join(resolvedOutputDir, 'faithful_dubbing_manifest.json');
            
            // Xây dựng lệnh gọi Python
            const args = [
                this.scriptPath,
                '--count', count.toString(),
                '--output-dir', resolvedOutputDir
            ];
            if (target) {
                args.push('--target', target);
            }

            const proc = spawn('python', args, {
                cwd: this.baseDir,
                env: {
                    ...process.env,
                    PYTHONUTF8: '1',
                    PYTHONIOENCODING: 'utf-8'
                }
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', data => {
                const s = data.toString('utf8');
                stdout += s;
                process.stdout.write(s);
            });

            proc.stderr.on('data', data => {
                stderr += data.toString('utf8');
            });

            proc.on('error', err => {
                reject(new Error(`Failed to spawn universal_video_dubber: ${err.message}`));
            });

            proc.on('close', code => {
                if (fs.existsSync(manifestPath)) {
                    try {
                        const results = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                        return resolve(results);
                    } catch (e) {}
                }

                if (code === 0) {
                    return resolve([]);
                } else {
                    return reject(new Error(`universal_video_dubber exited with code ${code}: ${stderr.slice(-300)}`));
                }
            });
        });
    }
}

module.exports = UniversalVideoDubber;

