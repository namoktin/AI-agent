/**
 * UniversalSocialScraper.js
 * Multi-Platform Social Media Metrics & Content Extraction Engine
 * Cyber Agent Pro v4.0 Ultimate
 * 
 * Supports: Facebook, TikTok, YouTube, Instagram, X/Twitter, Reddit, Threads, LinkedIn, Pinterest, Bluesky
 * Multi-tier extraction:
 *   Tier 1: Structured Data (JSON-LD / Schema.org VideoObject / SocialMediaPosting)
 *   Tier 2: OpenGraph & Twitter Meta Tags
 *   Tier 3: Platform-Specific DOM Selectors (Puppeteer / Cheerio)
 *   Tier 4: Universal Metric Heuristics (Zero-Failure Regex Parser)
 */

class UniversalSocialScraper {
    constructor() {
        this.supportedPlatforms = [
            'facebook', 'tiktok', 'youtube', 'instagram', 'twitter',
            'reddit', 'threads', 'linkedin', 'pinterest', 'bluesky'
        ];
    }

    /**
     * Identify the social media platform from a given URL
     */
    detectPlatform(url) {
        if (!url || typeof url !== 'string') return 'unknown';
        const lower = url.toLowerCase();
        if (lower.includes('facebook.com') || lower.includes('fb.watch') || lower.includes('fb.me')) return 'facebook';
        if (lower.includes('tiktok.com')) return 'tiktok';
        if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
        if (lower.includes('instagram.com')) return 'instagram';
        if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
        if (lower.includes('reddit.com')) return 'reddit';
        if (lower.includes('threads.net')) return 'threads';
        if (lower.includes('linkedin.com')) return 'linkedin';
        if (lower.includes('pinterest.com')) return 'pinterest';
        if (lower.includes('bsky.app')) return 'bluesky';
        return 'general_web';
    }

    /**
     * Client-side DOM extractor code to be executed inside Puppeteer page.evaluate()
     * or executed over HTML in Node.js
     */
    getBrowserExtractionFunction() {
        return function extractSocialMediaDataInBrowser(targetUrl, detectedPlatform) {
            const result = {
                platform: detectedPlatform || 'unknown',
                url: targetUrl || window.location.href,
                title: '',
                caption: '',
                author: '',
                views: null,
                likes: null,
                comments_count: null,
                shares_count: null,
                timestamp: null,
                rawExtracted: {}
            };

            // 1. TIER 1: JSON-LD & SCHEMA.ORG
            try {
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const script of scripts) {
                    try {
                        const parsed = JSON.parse(script.textContent);
                        const items = Array.isArray(parsed) ? parsed : [parsed];
                        for (const item of items) {
                            if (!item) continue;
                            const type = String(item['@type'] || '');
                            if (type.includes('VideoObject') || type.includes('SocialMediaPosting') || type.includes('NewsArticle') || type.includes('Article')) {
                                if (item.name && !result.title) result.title = item.name;
                                if (item.description && !result.caption) result.caption = item.description;
                                if (item.uploadDate && !result.timestamp) result.timestamp = item.uploadDate;
                                if (item.author) {
                                    result.author = typeof item.author === 'string' ? item.author : (item.author.name || '');
                                }
                                // Interaction stats
                                if (item.interactionStatistic) {
                                    const stats = Array.isArray(item.interactionStatistic) ? item.interactionStatistic : [item.interactionStatistic];
                                    for (const stat of stats) {
                                        const iType = String(stat.interactionType || '');
                                        const count = stat.userInteractionCount;
                                        if (iType.includes('WatchAction') || iType.includes('ViewAction')) result.views = count;
                                        if (iType.includes('LikeAction')) result.likes = count;
                                        if (iType.includes('CommentAction')) result.comments_count = count;
                                        if (iType.includes('ShareAction')) result.shares_count = count;
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}

            // 2. TIER 2: OPEN GRAPH & TWITTER META TAGS
            try {
                const getMeta = (prop) => {
                    const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
                    return el ? el.getAttribute('content') : null;
                };

                const ogTitle = getMeta('og:title') || getMeta('twitter:title');
                const ogDesc = getMeta('og:description') || getMeta('twitter:description');
                const ogSite = getMeta('og:site_name');

                if (!result.title && ogTitle) result.title = ogTitle;
                if (!result.caption && ogDesc) result.caption = ogDesc;
                if (!result.author && ogSite) result.author = ogSite;
            } catch (e) {}

            // 3. TIER 3: PLATFORM-SPECIFIC DOM SELECTORS
            const textContent = (sel) => {
                const el = document.querySelector(sel);
                return el ? (el.innerText || el.textContent || '').trim() : '';
            };
            const attrContent = (sel, attr) => {
                const el = document.querySelector(sel);
                return el ? (el.getAttribute(attr) || '').trim() : '';
            };

            switch (detectedPlatform) {
                case 'facebook': {
                    if (!result.caption) {
                        result.caption = textContent('div[data-ad-preview="message"]') ||
                                         textContent('div[dir="auto"][style*="text-align"]') ||
                                         textContent('div[role="dialog"] div[dir="auto"]') ||
                                         textContent('div.x11i5rnm.xat24cr.x1mh8g0r');
                    }
                    if (!result.author) {
                        result.author = textContent('h2 strong') ||
                                        textContent('h2 a') ||
                                        textContent('a[role="link"] > strong') ||
                                        textContent('h3 a');
                    }
                    break;
                }
                case 'tiktok': {
                    if (!result.caption) {
                        result.caption = textContent('[data-e2e="browse-video-desc"]') ||
                                         textContent('[data-e2e="user-post-item-desc"]') ||
                                         textContent('h1.video-meta-title');
                    }
                    if (!result.author) {
                        result.author = textContent('[data-e2e="browse-username"]') ||
                                        textContent('[data-e2e="user-title"]');
                    }
                    if (!result.likes) {
                        result.likes = textContent('[data-e2e="like-count"]') ||
                                       textContent('[data-e2e="browse-like-count"]');
                    }
                    if (!result.comments_count) {
                        result.comments_count = textContent('[data-e2e="comment-count"]');
                    }
                    break;
                }
                case 'youtube': {
                    if (!result.title) {
                        result.title = textContent('#title h1') ||
                                       textContent('ytd-watch-metadata #title') ||
                                       textContent('h1.title');
                    }
                    if (!result.author) {
                        result.author = textContent('ytd-channel-name a') ||
                                        textContent('#channel-name a');
                    }
                    if (!result.views) {
                        result.views = textContent('ytd-video-view-count-renderer span') ||
                                       textContent('#count .view-count') ||
                                       textContent('span.yt-view-count-renderer');
                    }
                    if (!result.likes) {
                        result.likes = textContent('like-button-view-model button') ||
                                       attrContent('yt-button-shape button[aria-label*="like"]', 'aria-label') ||
                                       textContent('#top-level-buttons-computed ytd-toggle-button-renderer:first-child');
                    }
                    if (!result.caption) {
                        result.caption = textContent('#description-inner') ||
                                         textContent('#description ytd-text-inline-expander');
                    }
                    break;
                }
                case 'instagram': {
                    if (!result.caption) {
                        result.caption = textContent('div._a9zs') ||
                                         textContent('h1._ap3a') ||
                                         textContent('span._ap3a._aaco');
                    }
                    if (!result.author) {
                        result.author = textContent('header a._cupo') ||
                                        textContent('span._ap3a._aacw');
                    }
                    if (!result.likes) {
                        result.likes = textContent('section a[href*="/liked_by/"]') ||
                                       textContent('section span:has-text("likes")');
                    }
                    break;
                }
                case 'twitter': {
                    if (!result.caption) {
                        result.caption = textContent('div[data-testid="tweetText"]');
                    }
                    if (!result.author) {
                        result.author = textContent('div[data-testid="User-Name"]');
                    }
                    if (!result.likes) {
                        result.likes = textContent('div[data-testid="like"]');
                    }
                    if (!result.comments_count) {
                        result.comments_count = textContent('div[data-testid="reply"]');
                    }
                    break;
                }
                case 'reddit': {
                    if (!result.title) {
                        result.title = textContent('h1[slot="title"]') || textContent('h1');
                    }
                    if (!result.author) {
                        result.author = textContent('a[data-testid="post_author_link"]') ||
                                        textContent('a[href*="/user/"]');
                    }
                    if (!result.likes) {
                        result.likes = textContent('div[id*="vote-arrows"]') ||
                                       textContent('span[data-testid="vote-count"]');
                    }
                    if (!result.comments_count) {
                        result.comments_count = textContent('span[data-testid="comments-count"]') ||
                                               textContent('a[data-testid="comments-page-link-num-comments"]');
                    }
                    break;
                }
                case 'threads': {
                    if (!result.caption) {
                        result.caption = textContent('div[data-pressable-container="true"] span') ||
                                         textContent('div[dir="auto"]');
                    }
                    if (!result.author) {
                        result.author = textContent('span.x1lliihq') || textContent('header a');
                    }
                    break;
                }
                case 'linkedin': {
                    if (!result.caption) {
                        result.caption = textContent('div.feed-shared-update-v2__description') ||
                                         textContent('span.break-words');
                    }
                    if (!result.author) {
                        result.author = textContent('span.feed-shared-actor__name');
                    }
                    if (!result.likes) {
                        result.likes = textContent('ul.social-details-social-counts li.social-details-social-counts__item--reactions');
                    }
                    break;
                }
                case 'pinterest': {
                    if (!result.title) result.title = textContent('h1[data-test-id="pin-title"]');
                    if (!result.caption) result.caption = textContent('div[data-test-id="truncated-description"]');
                    if (!result.author) result.author = textContent('div[data-test-id="official-user-attribution"]');
                    break;
                }
                case 'bluesky': {
                    if (!result.caption) result.caption = textContent('div[data-testid="postText"]');
                    if (!result.author) result.author = textContent('div[data-testid="userHandle"]');
                    break;
                }
            }

            // 4. TIER 4: UNIVERSAL REGEX METRIC HEURISTICS
            const fullText = document.body ? document.body.innerText : '';
            
            if (!result.views) {
                const viewMatch = fullText.match(/(\d[\d.,]*\s*[KkMmBb]?)\s*(?:lượt xem|views|lượt phát|plays)/i);
                if (viewMatch) result.views = viewMatch[1].trim();
            }
            if (!result.likes) {
                const likeMatch = fullText.match(/(\d[\d.,]*\s*[KkMmBb]?)\s*(?:lượt thích|likes|tim|upvotes|thích)/i);
                if (likeMatch) result.likes = likeMatch[1].trim();
            }
            if (!result.comments_count) {
                const commentMatch = fullText.match(/(\d[\d.,]*\s*[KkMmBb]?)\s*(?:bình luận|comments|ý kiến)/i);
                if (commentMatch) result.comments_count = commentMatch[1].trim();
            }
            if (!result.shares_count) {
                const shareMatch = fullText.match(/(\d[\d.,]*\s*[KkMmBb]?)\s*(?:chia sẻ|shares|reposts|retweets)/i);
                if (shareMatch) result.shares_count = shareMatch[1].trim();
            }

            // Fallback for Title/Caption if empty
            if (!result.title && document.title) {
                result.title = document.title.replace(/\s*[-|•].*$/, '').trim();
            }
            if (!result.caption && result.title) {
                result.caption = result.title;
            }

            return result;
        };
    }

    /**
     * Parse HTML directly using Cheerio / Regex in Node.js (for headless/fast fallback)
     */
    parseHtmlContent(html, url) {
        const platform = this.detectPlatform(url);
        const result = {
            platform,
            url,
            title: '',
            caption: '',
            author: '',
            views: null,
            likes: null,
            comments_count: null,
            shares_count: null,
            timestamp: null
        };

        if (!html || typeof html !== 'string') return result;

        // 1. JSON-LD
        const jsonLdMatches = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
        if (jsonLdMatches) {
            for (const tag of jsonLdMatches) {
                try {
                    const jsonStr = tag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
                    const parsed = JSON.parse(jsonStr);
                    const items = Array.isArray(parsed) ? parsed : [parsed];
                    for (const item of items) {
                        if (item.name && !result.title) result.title = item.name;
                        if (item.description && !result.caption) result.caption = item.description;
                        if (item.uploadDate && !result.timestamp) result.timestamp = item.uploadDate;
                        if (item.author && !result.author) {
                            result.author = typeof item.author === 'string' ? item.author : (item.author.name || '');
                        }
                    }
                } catch (e) {}
            }
        }

        // 2. OpenGraph & Meta
        const ogTitle = html.match(/<meta\s+(?:property|name)=["'](?:og:title|twitter:title)["']\s+content=["'](.*?)["']/i);
        if (ogTitle && !result.title) result.title = ogTitle[1].trim();

        const ogDesc = html.match(/<meta\s+(?:property|name)=["'](?:og:description|twitter:description)["']\s+content=["'](.*?)["']/i);
        if (ogDesc && !result.caption) result.caption = ogDesc[1].trim();

        const ogSite = html.match(/<meta\s+(?:property|name)=["'](?:og:site_name)["']\s+content=["'](.*?)["']/i);
        if (ogSite && !result.author) result.author = ogSite[1].trim();

        // 3. Fallback Regex
        const viewMatch = html.match(/(\d[\d.,]*\s*[KkMmBb]?)\s*(?:lượt xem|views|lượt phát|plays)/i);
        if (viewMatch) result.views = viewMatch[1].trim();

        const likeMatch = html.match(/(\d[\d.,]*\s*[KkMmBb]?)\s*(?:lượt thích|likes|tim|upvotes|thích)/i);
        if (likeMatch) result.likes = likeMatch[1].trim();

        const commentMatch = html.match(/(\d[\d.,]*\s*[KkMmBb]?)\s*(?:bình luận|comments|ý kiến)/i);
        if (commentMatch) result.comments_count = commentMatch[1].trim();

        return result;
    }

    /**
     * Format social data into a rich Markdown card for presentation to the user/orchestrator
     */
    formatToMarkdown(socialData) {
        if (!socialData) return 'Không có dữ liệu mạng xã hội.';
        const pIcons = {
            facebook: '📘 Facebook',
            tiktok: '🎵 TikTok',
            youtube: '▶️ YouTube',
            instagram: '📷 Instagram',
            twitter: '🐦 X / Twitter',
            reddit: '🤖 Reddit',
            threads: '🧵 Threads',
            linkedin: '💼 LinkedIn',
            pinterest: '📌 Pinterest',
            bluesky: '🦋 Bluesky'
        };

        const platformName = pIcons[socialData.platform] || `🌐 ${socialData.platform || 'Web'}`;
        
        let md = `### ${platformName} Analysis\n`;
        md += `- **🔗 Link:** \`${socialData.url}\`\n`;
        if (socialData.author) md += `- **👤 Tác giả / Kênh:** **${socialData.author}**\n`;
        if (socialData.title) md += `- **📌 Tiêu đề:** ${socialData.title}\n`;
        if (socialData.caption) md += `- **📝 Caption / Mô tả:** ${socialData.caption}\n`;
        
        md += `\n**📊 Thống Kê Tương Tác:**\n`;
        md += `| Lượt Xem (Views) | Lượt Tim (Likes) | Bình Luận (Comments) | Chia Sẻ (Shares) |\n`;
        md += `| :---: | :---: | :---: | :---: |\n`;
        md += `| **${socialData.views || 'N/A'}** | **${socialData.likes || 'N/A'}** | **${socialData.comments_count || 'N/A'}** | **${socialData.shares_count || 'N/A'}** |\n`;

        return md;
    }
}

module.exports = { UniversalSocialScraper };

