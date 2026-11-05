const puppeteerCore = require('./node_modules/puppeteer-core');
const { addExtra } = require('./node_modules/puppeteer-extra');
const StealthPlugin = require('./node_modules/puppeteer-extra-plugin-stealth');
const puppeteer = addExtra(puppeteerCore);
puppeteer.use(StealthPlugin());
const { CookieVault } = require('./agents/CookieVault');

(async () => {
    const vault = new CookieVault(__dirname);
    const entry = vault.getCookiesForUrl('facebook.com');

    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setCookie(...entry.cookies);

    const targetUrl = 'https://www.facebook.com/reel/1420382776948629';
    console.log('Navigating to:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    await new Promise(r => setTimeout(r, 4000));

    console.log('Page Title:', await page.title());

    // Extract DOM information about uploader and reels
    const info = await page.evaluate(() => {
        // Find links that might be author profile
        const links = [];
        document.querySelectorAll('a[href]').forEach(a => {
            const h = a.href;
            const t = a.innerText.trim();
            if (t && (h.includes('facebook.com/') || h.startsWith('/'))) {
                links.push({ text: t, href: h });
            }
        });

        // Find h1, h2, spans with text
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, strong, a[role="link"]')).map(el => el.innerText.trim()).filter(Boolean);

        return {
            url: window.location.href,
            bodySnippet: document.body ? document.body.innerText.slice(0, 1500) : '',
            sampleLinks: links.slice(0, 25),
            headings: headings.slice(0, 15)
        };
    });

    console.log('Current URL after redirect:', info.url);
    console.log('Headings:', info.headings);
    console.log('Body snippet:\n', info.bodySnippet);

    const ssPath = 'C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\reel_1420382776948629_check.jpg';
    await page.screenshot({ path: ssPath, quality: 80, type: 'jpeg' });
    console.log('Saved screenshot to:', ssPath);

    await browser.close();
})();
