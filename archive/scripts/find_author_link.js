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
    await page.setCookie(...entry.cookies);

    const targetUrl = 'https://www.facebook.com/reel/1420382776948629';
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    await new Promise(r => setTimeout(r, 2000));

    // Try closing the login modal if present
    try {
        const closeBtn = await page.$('div[aria-label="Đóng"], div[aria-label="Close"], div[role="dialog"] [aria-label="Đóng"]');
        if (closeBtn) {
            console.log('Found modal close button, clicking...');
            await closeBtn.click();
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch(e) {}

    // Find all links containing Pedro Sanchez or user profile
    const authorLinks = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('a[href]').forEach(a => {
            const txt = (a.innerText || '').trim();
            const href = a.href;
            if (txt.includes('Pedro') || txt.includes('Sanchez') || href.includes('animationpedro') || href.includes('profile.php') || href.includes('/reel/')) {
                results.push({ text: txt, href: href, role: a.getAttribute('role'), aria: a.getAttribute('aria-label') });
            }
        });
        return results;
    });

    console.log('Author & Reel links found in DOM:');
    console.log(JSON.stringify(authorLinks, null, 2));

    await browser.close();
})();
