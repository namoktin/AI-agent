const puppeteerCore = require('./node_modules/puppeteer-core');
const { addExtra } = require('./node_modules/puppeteer-extra');
const StealthPlugin = require('./node_modules/puppeteer-extra-plugin-stealth');
const puppeteer = addExtra(puppeteerCore);
puppeteer.use(StealthPlugin());
const { CookieVault } = require('./agents/CookieVault');
const fs = require('fs');

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
    if (entry && entry.cookies) {
        await page.setCookie(...entry.cookies);
    }

    // Try navigating to profile reels
    const targets = [
        'https://www.facebook.com/61561662704825/reels_tab',
        'https://www.facebook.com/61561662704825/reels',
        'https://www.facebook.com/61561662704825',
        'https://www.facebook.com/people/Pedro-Sanchez/61561662704825/?sk=reels_tab'
    ];

    let foundReels = new Set();
    let authorInfo = { name: 'Pedro Sanchez', url: 'https://www.facebook.com/61561662704825', id: '61561662704825' };

    for (const url of targets) {
        console.log(`Navigating to ${url}...`);
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
            await new Promise(r => setTimeout(r, 3000));

            // Close any modal if present
            try {
                const closeBtn = await page.$('div[aria-label="Đóng"], div[aria-label="Close"], i[data-visualcompletion="css-img"]');
                if (closeBtn) await closeBtn.click();
            } catch (e) {}

            // Scroll down a bit
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => window.scrollBy(0, 1000));
                await new Promise(r => setTimeout(r, 1500));
            }

            const links = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href*="/reel/"]'));
                return anchors.map(a => {
                    let href = a.href;
                    let text = a.innerText || a.getAttribute('aria-label') || '';
                    return { href, text };
                });
            });

            console.log(`Found ${links.length} reel anchors on ${url}`);
            links.forEach(l => {
                const match = l.href.match(/\/reel\/(\d+)/);
                if (match) {
                    foundReels.add(match[1]);
                    console.log(`Reel ID: ${match[1]} - Text: ${l.text.replace(/\n/g, ' ')}`);
                }
            });

            // Also check page title and profile name
            const pageTitle = await page.title();
            console.log(`Page title: ${pageTitle}`);

            if (foundReels.size >= 5) break;
        } catch (err) {
            console.log(`Error on ${url}:`, err.message);
        }
    }

    console.log(`\nTOTAL UNIQUE REELS FOUND: ${foundReels.size}`);
    console.log([...foundReels]);
    fs.writeFileSync('found_reels.json', JSON.stringify([...foundReels], null, 2));

    await browser.close();
})();
