const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// 1. Ensure UniversalSocialScraper is imported
if (!content.includes('const { UniversalSocialScraper }')) {
    content = content.replace(
        "const { compactAccessibilityTree, executeBrowserActions, extractContextualText } = require('./utils/browserActions');",
        "const { compactAccessibilityTree, executeBrowserActions, extractContextualText } = require('./utils/browserActions');\r\nconst { UniversalSocialScraper } = require('./utils/UniversalSocialScraper');\r\nconst universalSocialScraper = new UniversalSocialScraper();"
    );
}

// 2. Patch browse-web to include UniversalSocialScraper
const targetClose = '}, currentUrl);\r\n\r\n        await browser.close();';
const newClose = `}, currentUrl);

        // Bóc tách mạng xã hội toàn diện (Multi-Platform Universal Social Media Extraction)
        let socialData = null;
        const detectedPlatform = universalSocialScraper.detectPlatform(currentUrl);
        if (detectedPlatform !== 'unknown' && detectedPlatform !== 'general_web') {
            try {
                const socialExtractFn = universalSocialScraper.getBrowserExtractionFunction();
                socialData = await activePage.evaluate(socialExtractFn, currentUrl, detectedPlatform);
            } catch (socErr) {
                console.warn('⚠️ Lỗi trích xuất UniversalSocialScraper:', socErr.message);
            }
        }

        await browser.close();`.replace(/\n/g, '\r\n');

if (content.includes(targetClose) && !content.includes('let socialData = null;')) {
    content = content.replace(targetClose, newClose);
    console.log('✓ Injected socialData extraction in browse-web');
}

// 3. Patch socialAppendix in content
const targetAppendix = 'let deepLinkAppendix = "";';
const newAppendix = `let socialAppendix = "";
        if (socialData && (socialData.caption || socialData.views || socialData.likes || socialData.comments_count || socialData.author)) {
            socialAppendix = "\\r\\n\\r\\n" + universalSocialScraper.formatToMarkdown(socialData);
        }

        let deepLinkAppendix = "";`.replace(/\n/g, '\r\n');

if (content.includes(targetAppendix) && !content.includes('let socialAppendix = "";')) {
    content = content.replace(targetAppendix, newAppendix);
    console.log('✓ Injected socialAppendix in browse-web');
}

// 4. Patch res.json
const targetRes = 'content: cleanText + (truncated ? \'\\n\\n... [Nội dung đã được cắt ngắn] ...\' : \'\') + deepLinkAppendix + deepMediaAppendix,';
const newRes = `content: cleanText + (truncated ? '\\n\\n... [Nội dung đã được cắt ngắn] ...' : '') + socialAppendix + deepLinkAppendix + deepMediaAppendix,\r\n            socialData: socialData,`;

if (content.includes(targetRes) && !content.includes('socialData: socialData,')) {
    content = content.replace(targetRes, newRes);
    console.log('✓ Injected socialData in res.json');
}

// 5. Add /api/scrape-social and /api/verify-daemon-claim if not present
const endpoints = `
// API: Bóc tách chuyên sâu mạng xã hội trực tiếp (Standalone Universal Social Scraper)
app.post('/api/scrape-social', async (req, res) => {
    const { url, headless } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Thiếu đường dẫn URL bài đăng mạng xã hội.' });

    const platform = universalSocialScraper.detectPlatform(url);
    const chromePath = getInstalledBrowserPath();

    // 1. Thử cào nhanh bằng Fetch trước (nếu là trang tĩnh hoặc có OpenGraph)
    try {
        const fastResp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        if (fastResp.ok) {
            const html = await fastResp.text();
            const fastData = universalSocialScraper.parseHtmlContent(html, url);
            if (fastData.title && (fastData.caption || fastData.views || fastData.likes)) {
                return res.json({
                    success: true,
                    mode: 'fast_meta',
                    data: fastData,
                    markdown: universalSocialScraper.formatToMarkdown(fastData)
                });
            }
        }
    } catch (e) {}

    // 2. Nếu fetch nhanh không đủ dữ liệu, dùng Puppeteer Stealth
    if (!chromePath) {
        return res.json({ success: false, error: 'Không tìm thấy trình duyệt Chrome để bóc tách động.' });
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: headless !== false,
            userDataDir: CHROME_PROFILE_DIR,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--lang=vi-VN,vi']
        });
        const page = await browser.newPage();
        await setupStealthPage(page);
        await autoInjectCookies(page, url);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
        await new Promise(r => setTimeout(r, 2000));

        const extractFn = universalSocialScraper.getBrowserExtractionFunction();
        const extracted = await page.evaluate(extractFn, url, platform);

        await browser.close();
        browser = null;

        return res.json({
            success: true,
            mode: 'puppeteer_stealth',
            data: extracted,
            markdown: universalSocialScraper.formatToMarkdown(extracted)
        });
    } catch (err) {
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        return res.json({ success: false, error: 'Lỗi bóc tách mạng xã hội: ' + err.message });
    }
});

// API: Kiểm tra xác minh tuyên bố tiến trình ngầm (Anti-Phantom Daemon Gate)
app.post('/api/verify-daemon-claim', (req, res) => {
    const { claimText } = req.body;
    const isClaiming = /tiến trình ngầm|chạy ngầm|đang tải ngầm|tải trong nền|background daemon/i.test(claimText || '');
    const runningList = Array.from(activeDaemons.values()).filter(d => d.status === 'RUNNING');
    
    return res.json({
        success: true,
        claimed: isClaiming,
        hasRunningDaemon: runningList.length > 0,
        runningCount: runningList.length,
        daemons: runningList.map(d => ({
            id: d.id,
            command: d.command,
            pid: d.process ? d.process.pid : null,
            uptimeSeconds: Math.floor((Date.now() - d.startTime) / 1000)
        }))
    });
});
`.replace(/\n/g, '\r\n');

if (!content.includes('/api/scrape-social')) {
    const hook = "app.get('/api/cookie-vault', (req, res) => {";
    content = content.replace(hook, endpoints + '\r\n' + hook);
    console.log('✓ Added /api/scrape-social and /api/verify-daemon-claim endpoints');
}

fs.writeFileSync(serverPath, content, 'utf8');
console.log('Done patching server.js!');

