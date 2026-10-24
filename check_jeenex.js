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
    if (entry && entry.cookies) {
        await page.setCookie(...entry.cookies);
    }
    await page.goto('https://www.facebook.com/100006882992463', { waitUntil: 'networkidle2', timeout: 35000 });
    const profileUrl = page.url();
    console.log('Profile Title:', await page.title(), 'URL:', profileUrl);

    // Try reels tab
    const reelsUrl = profileUrl.split('?')[0].replace(/\/$/, '') + '/reels_tab';
    console.log('Reels URL:', reelsUrl);
    await page.goto(reelsUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    await new Promise(r => setTimeout(r, 3000));

    // Scroll
    await page.evaluate(() => window.scrollBy(0, 1500));
    await new Promise(r => setTimeout(r, 2000));

    const reels = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/reel/"]'));
        return anchors.map(a => a.href);
    });

    console.log('Found reel links:', [...new Set(reels)].slice(0, 5));
    await browser.close();
})();

