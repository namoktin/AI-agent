const fs = require('fs');
const path = require('path');

class CookieVault {
    constructor(baseDir) {
        this.baseDir = baseDir || process.cwd();
        this.memoryDir = path.join(this.baseDir, 'memory');
        this.cookiesDir = path.join(this.memoryDir, 'cookies');
        this.vaultFile = path.join(this.memoryDir, 'cookie_vault.json');

        if (!fs.existsSync(this.cookiesDir)) {
            fs.mkdirSync(this.cookiesDir, { recursive: true });
        }
        if (!fs.existsSync(this.vaultFile)) {
            fs.writeFileSync(this.vaultFile, JSON.stringify({}, null, 2), 'utf8');
        }
    }

    // Trích xuất root domain (ví dụ: https://www.facebook.com/reel/... -> facebook.com)
    getRootDomain(urlOrDomain) {
        if (!urlOrDomain) return '';
        try {
            let host = urlOrDomain;
            if (urlOrDomain.startsWith('http://') || urlOrDomain.startsWith('https://')) {
                host = new URL(urlOrDomain).hostname;
            }
            host = host.toLowerCase().replace(/^www\./, '').replace(/^\./, '');
            const parts = host.split('.');
            if (parts.length >= 2) {
                return parts.slice(-2).join('.');
            }
            return host;
        } catch(e) {
            return String(urlOrDomain).toLowerCase();
        }
    }

    getVault() {
        try {
            if (fs.existsSync(this.vaultFile)) {
                return JSON.parse(fs.readFileSync(this.vaultFile, 'utf8'));
            }
        } catch(e) {
            console.warn('[CookieVault] Lỗi đọc vault file:', e.message);
        }
        return {};
    }

    saveVault(vault) {
        try {
            fs.writeFileSync(this.vaultFile, JSON.stringify(vault, null, 2), 'utf8');
            return true;
        } catch(e) {
            console.error('[CookieVault] Lỗi ghi vault file:', e.message);
            return false;
        }
    }

    // Phân giải chuỗi cookie dạng Netscape (.txt) hoặc mảng JSON
    parseCookies(rawText, targetDomain = '') {
        const cookies = [];
        if (!rawText || typeof rawText !== 'string') return cookies;

        const trimmed = rawText.trim();
        // 1. Thử parse dạng JSON
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const arr = JSON.parse(trimmed);
                if (Array.isArray(arr)) {
                    return arr.map(c => ({
                        name: c.name,
                        value: c.value,
                        domain: c.domain || (targetDomain ? `.${targetDomain}` : undefined),
                        path: c.path || '/',
                        secure: !!c.secure,
                        httpOnly: !!c.httpOnly,
                        expires: c.expires || c.expirationDate || -1
                    })).filter(c => c.name && c.value);
                }
            } catch(e) {}
        }

        // 2. Parse dạng chuẩn Netscape Cookie File
        const lines = rawText.split('\n');
        for (const line of lines) {
            const l = line.trim();
            if (!l || l.startsWith('#')) continue;
            const parts = line.split('\t');
            if (parts.length >= 7) {
                const cDomain = parts[0].trim();
                if (targetDomain && !targetDomain.includes(cDomain.replace(/^\./, '')) && !cDomain.includes(targetDomain.replace(/^www\./, ''))) {
                    continue;
                }
                cookies.push({
                    domain: cDomain,
                    path: parts[2].trim() || '/',
                    secure: parts[3].trim().toUpperCase() === 'TRUE',
                    expires: parseInt(parts[4].trim()) || -1,
                    name: parts[5].trim(),
                    value: parts[6].trim()
                });
            }
        }
        return cookies;
    }

    // Chuyển đổi danh sách cookies thành định dạng Netscape (.txt) cho CLI (yt-dlp, curl)
    convertToNetscape(cookies, domain) {
        let txt = `# Netscape HTTP Cookie File\n# Domain: ${domain}\n# Saved by Cyber Agent Persistent Cookie Vault\n\n`;
        for (const c of cookies) {
            const d = c.domain || `.${domain}`;
            const includeSub = d.startsWith('.') ? 'TRUE' : 'FALSE';
            const path = c.path || '/';
            const secure = c.secure ? 'TRUE' : 'FALSE';
            const expires = c.expires && c.expires > 0 ? Math.floor(c.expires) : Math.floor(Date.now() / 1000 + 86400 * 365);
            txt += `${d}\t${includeSub}\t${path}\t${secure}\t${expires}\t${c.name}\t${c.value}\n`;
        }
        return txt;
    }

    // Lưu / Cập nhật Cookie cho 1 domain cụ thể vào Vault vĩnh viễn
    storeCookies(domainOrUrl, rawTextOrArray, status = 'valid') {
        const rootDomain = this.getRootDomain(domainOrUrl);
        if (!rootDomain) return { success: false, error: 'Không xác định được domain' };

        let parsedCookies = [];
        let netscapeTxt = '';

        if (Array.isArray(rawTextOrArray)) {
            parsedCookies = rawTextOrArray;
            netscapeTxt = this.convertToNetscape(parsedCookies, rootDomain);
        } else if (typeof rawTextOrArray === 'string') {
            parsedCookies = this.parseCookies(rawTextOrArray, rootDomain);
            if (rawTextOrArray.includes('\t') && rawTextOrArray.includes('# Netscape')) {
                netscapeTxt = rawTextOrArray;
            } else {
                netscapeTxt = this.convertToNetscape(parsedCookies, rootDomain);
            }
        }

        if (parsedCookies.length === 0) {
            return { success: false, error: 'Không tìm thấy cookie hợp lệ trong dữ liệu cung cấp' };
        }

        const netscapeFile = path.join(this.cookiesDir, `${rootDomain}.txt`);
        fs.writeFileSync(netscapeFile, netscapeTxt, 'utf8');

        const vault = this.getVault();
        vault[rootDomain] = {
            domain: rootDomain,
            updatedAt: new Date().toISOString(),
            status: status,
            count: parsedCookies.length,
            cookies: parsedCookies,
            netscapeFile: `${rootDomain}.txt`,
            sampleKeys: parsedCookies.slice(0, 6).map(c => c.name)
        };
        this.saveVault(vault);

        console.log(`🍪 [CookieVault] Đã lưu thành công ${parsedCookies.length} cookie cho [${rootDomain}] vào kho vĩnh viễn!`);
        return {
            success: true,
            domain: rootDomain,
            count: parsedCookies.length,
            netscapePath: netscapeFile,
            status: status
        };
    }

    // Lấy cookie đã lưu cho domain của URL
    getCookiesForUrl(urlOrDomain) {
        const rootDomain = this.getRootDomain(urlOrDomain);
        const vault = this.getVault();
        const entry = vault[rootDomain];

        if (!entry || !Array.isArray(entry.cookies) || entry.cookies.length === 0) {
            return null;
        }

        const netscapePath = path.join(this.cookiesDir, entry.netscapeFile || `${rootDomain}.txt`);
        return {
            domain: rootDomain,
            cookies: entry.cookies,
            count: entry.count || entry.cookies.length,
            status: entry.status || 'valid',
            updatedAt: entry.updatedAt,
            netscapePath: fs.existsSync(netscapePath) ? netscapePath : null
        };
    }

    // Đánh dấu trạng thái cookie (valid | expired)
    markStatus(urlOrDomain, status) {
        const rootDomain = this.getRootDomain(urlOrDomain);
        const vault = this.getVault();
        if (vault[rootDomain]) {
            vault[rootDomain].status = status;
            vault[rootDomain].statusUpdatedAt = new Date().toISOString();
            this.saveVault(vault);
            console.log(`🍪 [CookieVault] Đã cập nhật trạng thái cookie cho [${rootDomain}] thành: ${status}`);
            return true;
        }
        return false;
    }

    // Đồng bộ nhanh từ file cookies.txt trong thư mục làm việc nếu có
    syncFromWorkspace(todayDir) {
        const candidates = [
            todayDir ? path.join(todayDir, 'cookies.txt') : null,
            todayDir ? path.join(todayDir, 'facebook_cookies.txt') : null,
            path.join(this.baseDir, 'cookies.txt')
        ].filter(Boolean);

        for (const cPath of candidates) {
            if (fs.existsSync(cPath)) {
                try {
                    const raw = fs.readFileSync(cPath, 'utf8');
                    const allCookies = this.parseCookies(raw, '');
                    if (allCookies.length > 0) {
                        const byDomain = {};
                        for (const c of allCookies) {
                            const root = this.getRootDomain(c.domain || '');
                            if (root) {
                                if (!byDomain[root]) byDomain[root] = [];
                                byDomain[root].push(c);
                            }
                        }
                        for (const [dom, list] of Object.entries(byDomain)) {
                            this.storeCookies(dom, list, 'valid');
                        }
                    } else {
                        if (raw.includes('facebook.com')) {
                            this.storeCookies('facebook.com', raw, 'valid');
                        }
                        if (raw.includes('upwork.com')) {
                            this.storeCookies('upwork.com', raw, 'valid');
                        }
                    }
                } catch(e) {
                    console.warn('[CookieVault] Lỗi đồng bộ từ workspace:', e.message);
                }
            }
        }
    }
}

module.exports = { CookieVault };
