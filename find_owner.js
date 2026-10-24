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

    const targetUrl = 'https://www.facebook.com/61561662704825';
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    console.log('Real owner URL:', page.url());
    console.log('Real owner Title:', await page.title());
    await browser.close();
})();
