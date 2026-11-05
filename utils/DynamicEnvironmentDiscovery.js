/**
 * DynamicEnvironmentDiscovery.js
 * Cyber Agent Pro v6.0 Enterprise
 * 
 * Bộ Tự Khám Phá Công Cụ & Thư Viện Cục Bộ (Autonomous Tool & Capability Discovery)
 * - Tự động quét môi trường hệ điều hành (pip list, npm list, system binaries).
 * - Phân loại theo năng lực kỹ thuật: STT, TTS, Video/Audio, Web Scraping, Data Science, PDF, Database.
 * - Khi công cụ A gặp lỗi (429, timeout, missing audio), tự động cung cấp công cụ B thay thế có sẵn trên máy cùng mã mẫu!
 */

const { execSync } = require('child_process');

class DynamicEnvironmentDiscovery {
    constructor() {
        this._cachedCapabilities = null;
        this._lastScanTime = 0;
    }

    /**
     * Quét và phát hiện toàn bộ công cụ thực tế đang có sẵn trên hệ điều hành
     * @returns {Object} Danh mục công cụ theo nhóm năng lực
     */
    scanAvailableCapabilities() {
        // Cache kết quả trong 5 phút để tối ưu tốc độ
        const now = Date.now();
        if (this._cachedCapabilities && (now - this._lastScanTime < 300000)) {
            return this._cachedCapabilities;
        }

        const capabilities = {
            speech_to_text: [],
            text_to_speech: [],
            media_processing: [],
            web_scraping: [],
            data_analytics: [],
            document_pdf: [],
            database: [],
            system_binaries: []
        };

        // 1. Quét system binaries trong PATH
        const checkBin = (bin) => {
            try {
                execSync(`where ${bin}`, { stdio: 'ignore', timeout: 3000 });
                return true;
            } catch (e) {
                return false;
            }
        };

        ['ffmpeg', 'ffprobe', 'yt-dlp', 'python', 'node', 'curl', 'git'].forEach(b => {
            if (checkBin(b)) capabilities.system_binaries.push(b);
        });

        // 2. Quét Python packages
        let pipText = '';
        try {
            pipText = execSync('pip list --format=json', { timeout: 8000, encoding: 'utf8' });
            const packages = JSON.parse(pipText).map(p => p.name.toLowerCase());

            // Phân loại STT
            if (packages.includes('openai-whisper') || packages.includes('whisper')) capabilities.speech_to_text.push('whisper');
            if (packages.includes('speechrecognition')) capabilities.speech_to_text.push('speech_recognition');

            // Phân loại TTS
            if (packages.includes('gtts')) capabilities.text_to_speech.push('gTTS');
            if (packages.includes('edge-tts')) capabilities.text_to_speech.push('edge-tts');
            if (packages.includes('pyttsx3')) capabilities.text_to_speech.push('pyttsx3');

            // Phân loại Video/Audio
            if (packages.includes('imageio-ffmpeg')) capabilities.media_processing.push('imageio-ffmpeg');
            if (packages.includes('pydub')) capabilities.media_processing.push('pydub');
            if (packages.includes('av')) capabilities.media_processing.push('pyav');

            // Phân loại Web Scraping
            if (packages.includes('playwright')) capabilities.web_scraping.push('playwright');
            if (packages.includes('scrapy')) capabilities.web_scraping.push('scrapy');
            if (packages.includes('beautifulsoup4')) capabilities.web_scraping.push('bs4');
            if (packages.includes('requests')) capabilities.web_scraping.push('requests');
            if (packages.includes('httpx')) capabilities.web_scraping.push('httpx');

            // Phân loại Data
            if (packages.includes('pandas')) capabilities.data_analytics.push('pandas');
            if (packages.includes('numpy')) capabilities.data_analytics.push('numpy');
            if (packages.includes('openpyxl')) capabilities.data_analytics.push('openpyxl');
            if (packages.includes('scipy')) capabilities.data_analytics.push('scipy');

            // Phân loại PDF
            if (packages.includes('pymupdf')) capabilities.document_pdf.push('pymupdf');
            if (packages.includes('pdfplumber')) capabilities.document_pdf.push('pdfplumber');
            if (packages.includes('pypdf')) capabilities.document_pdf.push('pypdf');
            if (packages.includes('pdfminer.six')) capabilities.document_pdf.push('pdfminer');

            // Phân loại Database
            capabilities.database.push('sqlite3'); // Python built-in
        } catch (e) {
            // Fallback danh mục mặc định nếu pip list lỗi
            capabilities.text_to_speech = ['gTTS', 'edge-tts'];
            capabilities.speech_to_text = ['whisper'];
            capabilities.web_scraping = ['requests', 'playwright', 'curl'];
            capabilities.media_processing = ['ffmpeg', 'pydub'];
            capabilities.data_analytics = ['pandas', 'numpy'];
            capabilities.document_pdf = ['pymupdf', 'pdfplumber'];
            capabilities.database = ['sqlite3'];
        }

        this._cachedCapabilities = capabilities;
        this._lastScanTime = now;
        return capabilities;
    }

    /**
     * Gợi ý phương án và công cụ thay thế khi một công cụ hoặc thao tác bị thất bại
     * @param {string} failedToolName - Tên công cụ hoặc danh mục bị lỗi (ví dụ: 'edge-tts', 'requests', 'crawl_error')
     * @returns {Object} Gợi ý công cụ thay thế và đoạn mã mẫu
     */
    suggestRemediationStrategy(failedToolName = '') {
        const caps = this.scanAvailableCapabilities();
        const lower = failedToolName.toLowerCase();

        // 1. Thất bại về TTS
        if (lower.includes('edge-tts') || lower.includes('voice') || lower.includes('tts')) {
            const alts = caps.text_to_speech.filter(t => !lower.includes(t.toLowerCase()));
            const primaryAlt = alts.includes('gTTS') ? 'gTTS' : alts[0] || 'gTTS';
            return {
                failedCategory: 'Text-to-Speech',
                recommendedAlternative: primaryAlt,
                availableAlternatives: alts,
                remediationPrompt: `Công cụ TTS trước đó gặp sự cố. BẮT BUỘC chuyển sang dùng thư viện thay thế có sẵn: [${primaryAlt}]. Mã mẫu: from gtts import gTTS; gTTS(text='...', lang='vi').save('output.mp3')`
            };
        }

        // 2. Thất bại về Speech-to-Text
        if (lower.includes('whisper') || lower.includes('stt') || lower.includes('transcribe')) {
            return {
                failedCategory: 'Speech-to-Text',
                recommendedAlternative: 'speech_recognition',
                availableAlternatives: caps.speech_to_text,
                remediationPrompt: `Whisper gặp lỗi hoặc chậm. BẮT BUỘC thử phương án dự phòng với SpeechRecognition hoặc dùng phụ đề trực tiếp từ video: yt-dlp --write-auto-subs`
            };
        }

        // 3. Thất bại về Cào Web / Anti-bot Cloudflare
        if (lower.includes('scrape') || lower.includes('403') || lower.includes('cloudflare') || lower.includes('requests')) {
            return {
                failedCategory: 'Web Scraping',
                recommendedAlternative: 'playwright / Public REST API',
                availableAlternatives: caps.web_scraping,
                remediationPrompt: `Phương thức cào web DOM thô bị chặn (403/Cloudflare/Bot wall). BẮT BUỘC chuyển sang: 1) Tìm public REST API của nền tảng (như dev.to/api, reddit.com/.json, youtube gdata); hoặc 2) Dùng BROWSE_WEB có session giả lập trình duyệt thật.`
            };
        }

        // 4. Thất bại về Video Download
        if (lower.includes('download') || lower.includes('video') || lower.includes('yt-dlp')) {
            return {
                failedCategory: 'Video Ingestion',
                recommendedAlternative: 'yt-dlp flat-playlist / direct CDN stream',
                availableAlternatives: ['yt-dlp --flat-playlist', 'curl direct stream', 'local video cache'],
                remediationPrompt: `Tải video gặp lỗi. BẮT BUỘC dùng cờ --flat-playlist để lấy URL chuẩn, hoặc dùng cookie xác thực, hoặc bổ sung từ cache video đã tải cục bộ.`
            };
        }

        return {
            failedCategory: 'General Execution',
            recommendedAlternative: 'Fallback Library',
            availableAlternatives: caps.system_binaries,
            remediationPrompt: `Lượt trước chưa hoàn thành mục tiêu. BẮT BUỘC kiểm tra lại tệp thực tế trên đĩa, đổi thuật toán hoặc dùng thư viện thay thế trong môi trường.`
        };
    }
}

module.exports = DynamicEnvironmentDiscovery;

