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

    // Find elements with text "Pedro Sanchez"
    const elDetails = await page.evaluate(() => {
        const matches = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && node.nodeValue.includes('Pedro Sanchez')) {
                const parent = node.parentElement;
                // Walk up to find nearest <a> or clickable
                let current = parent;
                let nearestLink = null;
                for (let i = 0; i < 5 && current; i++) {
                    if (current.tagName === 'A' || current.getAttribute('role') === 'link') {
                        nearestLink = { tag: current.tagName, href: current.href, aria: current.getAttribute('aria-label') };
                        break;
                    }
                    current = current.parentElement;
                }
                matches.push({
                    text: node.nodeValue.trim(),
                    parentTag: parent.tagName,
                    parentClass: parent.className,
                    nearestLink: nearestLink
                });
            }
        }
        return matches;
    });

    console.log('Pedro Sanchez elements:', JSON.stringify(elDetails, null, 2));

    await browser.close();
})();
