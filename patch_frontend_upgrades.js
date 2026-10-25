const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(indexPath, 'utf8');

// 1. Add CSS for .smart-chat-url if not already added
const smartLinkCss = `
        /* SMART CHAT URL HIGHLIGHTING PILL */
        .smart-chat-url {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(14, 165, 233, 0.15) !important;
            border: 1px solid rgba(56, 189, 248, 0.45) !important;
            color: #38bdf8 !important;
            font-weight: 600 !important;
            padding: 2px 8px !important;
            margin: 0 2px !important;
            border-radius: 6px !important;
            text-decoration: none !important;
            word-break: break-all !important;
            transition: all 0.2s ease !important;
            box-shadow: 0 0 8px rgba(56, 189, 248, 0.15) !important;
        }
        .smart-chat-url:hover {
            background: rgba(14, 165, 233, 0.3) !important;
            border-color: #38bdf8 !important;
            color: #7dd3fc !important;
            text-decoration: underline !important;
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.45) !important;
        }
        .smart-chat-url .url-icon {
            font-size: 0.8rem;
        }
`;

if (!content.includes('smart-chat-url')) {
    content = content.replace('</style>', smartLinkCss + '\n    </style>');
    console.log('✓ Added .smart-chat-url CSS to index.html');
}

// 2. Add highlightUrlsInHtml function
const highlightFunc = `
    function highlightUrlsInHtml(html) {
        if (!html || typeof html !== 'string') return html;
        const urlRegex = /(?<!href=["']|src=["'])(https?:\\/\\/[^\\s<>'"]+)/gi;
        return html.replace(urlRegex, (match) => {
            return \`<a href="\${match}" target="_blank" rel="noopener noreferrer" class="smart-chat-url"><span class="url-icon">🔗</span> \${match}</a>\`;
        });
    }
`;

if (!content.includes('function highlightUrlsInHtml')) {
    content = content.replace('function appendCorporateMessage(', highlightFunc + '\n    function appendCorporateMessage(');
    console.log('✓ Added highlightUrlsInHtml function to index.html');
}

// 3. Update appendCorporateMessage to format links
const targetMsgBox = '<div class="message-content">${text}</div>';
const newMsgBox = '<div class="message-content">${highlightUrlsInHtml(text)}</div>';
if (content.includes(targetMsgBox)) {
    content = content.replace(targetMsgBox, newMsgBox);
    console.log('✓ Updated appendCorporateMessage with highlightUrlsInHtml');
}

// 4. Update renderMarkdownWithMath to style all anchor tags with .smart-chat-url
const targetRenderMath = 'element.innerHTML = marked.parse(text || "");';
const newRenderMath = `element.innerHTML = marked.parse(text || "");
        element.querySelectorAll('a').forEach(a => {
            if (!a.classList.contains('smart-chat-url') && !a.classList.contains('btn-preview-link')) {
                a.classList.add('smart-chat-url');
                if (!a.querySelector('.url-icon')) {
                    const icon = document.createElement('span');
                    icon.className = 'url-icon';
                    icon.textContent = '🔗 ';
                    a.prepend(icon);
                }
            }
        });`;
if (content.includes(targetRenderMath) && !content.includes("a.classList.contains('smart-chat-url')")) {
    content = content.replace(targetRenderMath, newRenderMath);
    console.log('✓ Updated renderMarkdownWithMath with smart-chat-url');
}

// 5. Add SCRAPE_SOCIAL_MEDIA tool definition to NATIVE_TOOLS
const socialToolDef = `            {
                name: "SCRAPE_SOCIAL_MEDIA",
                description: "BÓC TÁCH DỮ LIỆU ĐA MẠNG XÃ HỘI (Universal Social Media Scraper): Bóc tách chuẩn xác Caption/Mô tả, Lượt xem (Views), Lượt thích (Likes), Số bình luận (Comments), Tác giả và Ngày đăng cho 10+ mạng xã hội (Facebook Reels/Posts, TikTok, YouTube Shorts/Videos, Instagram, X/Twitter, Reddit, Threads, LinkedIn, Pinterest, Bluesky).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        url: { type: "STRING", description: "Đường dẫn URL bài viết hoặc video cần bóc tách" },
                        headless: { type: "BOOLEAN", description: "Mặc định true (chạy ngầm)" }
                    },
                    required: ["url"]
                }
            },
`;

if (!content.includes('"SCRAPE_SOCIAL_MEDIA"')) {
    content = content.replace('name: "SAVE_FILE",', socialToolDef + '            {\r\n                name: "SAVE_FILE",');
    console.log('✓ Added SCRAPE_SOCIAL_MEDIA to NATIVE_TOOLS');
}

// 6. Add Anti-Phantom Daemon Gate in runAgentLoop
const antiPhantomCode = `
                // ANTI-PHANTOM & ANTI-HALLUCINATION GATE: Chặn đứng hoàn toàn việc AI nói suông đang chạy ngầm
                const claimsBackground = /tiến trình ngầm|chạy ngầm|đang tải ngầm|tải trong nền|background daemon/i.test(botReply);
                if (claimsBackground && !continueLoop && loopSteps < MAX_STEPS && isTaskRunning) {
                    try {
                        const dRes = await fetch('http://localhost:3000/api/verify-daemon-claim', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ claimText: botReply })
                        });
                        const dData = await dRes.json();
                        if (!dData.hasRunningDaemon) {
                            console.warn('⚠️ [ANTI-HALLUCINATION GATE] Phát hiện ảo giác hành động: không có daemon nào đang chạy!');
                            chatHistory.push({
                                role: "user",
                                parts: [{
                                    text: "⚠️ [CẢNH BÁO CHỐNG ẢO GIÁC HỆ THỐNG]: Bạn vừa tuyên bố 'đang chạy tiến trình ngầm' nhưng hệ thống kiểm tra thực tế thấy KHÔNG CÓ TIẾN TRÌNH NGẦM NÀO ĐANG CHẠY (runningCount = 0). Tuyệt đối không được nói suông hoặc hứa hẹn ảo! BẮT BUỘC BÂY GIỜ PHẢI: Viết script Node.js / Python tải các mục còn lại và gọi MANAGE_DAEMON để khởi chạy thật, HOẶC gọi tool xử lý hoàn thành toàn bộ mục tiêu ngay lập tức!"
                                }]
                            });
                            continueLoop = true;
                            continue;
                        }
                    } catch (e) {}
                }
`;

if (!content.includes('ANTI-PHANTOM & ANTI-HALLUCINATION GATE')) {
    const nudgeHook = '// AUTO-NUDGE: Nếu Phó Giám Đốc chỉ lên kế hoạch/nói suông';
    content = content.replace(nudgeHook, antiPhantomCode + '\n                ' + nudgeHook);
    console.log('✓ Injected Anti-Phantom & Anti-Hallucination Gate into runAgentLoop');
}

// 7. Add SCRAPE_SOCIAL_MEDIA tool handler in runAgentLoop
const socialHandlerCode = `
                    // TOOL: SCRAPE_SOCIAL_MEDIA (Bóc tách đa mạng xã hội)
                    else if (toolName === "SCRAPE_SOCIAL_MEDIA") {
                        const startTime = performance.now();
                        msgContent.innerHTML += \`<div class="tool-card tool-browse"><div class="tool-card-header">📊 [SOCIAL SCRAPER] Đang bóc tách dữ liệu: <b>\${escapeHtml(args.url || '')}</b></div></div>\`;
                        const res = await fetch('http://localhost:3000/api/scrape-social', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(args)
                        });
                        const resultData = await res.json();
                        const duration = ((performance.now() - startTime) / 1000).toFixed(2) + 's';
                        if (resultData.success) {
                            msgContent.innerHTML += \`<div class="tool-card" style="border-left: 3px solid #38bdf8; background: rgba(56, 189, 248, 0.05); padding: 10px; margin-top: 8px; border-radius: 6px;">
                                <div style="font-weight: bold; color: #38bdf8;">✓ Đã trích xuất thành công [\${(resultData.data?.platform || 'Social').toUpperCase()}] (⏱️ \${duration})</div>
                                <div style="font-size: 0.85rem; margin-top: 6px;">\${marked.parse(resultData.markdown || '')}</div>
                            </div>\`;
                        } else {
                            msgContent.innerHTML += \`<div style="color: #ef4444; font-size: 0.85rem; margin-top: 6px;">❌ Lỗi bóc tách: \${escapeHtml(resultData.error || 'Thất bại')}</div>\`;
                        }
                        chatHistory.push({
                            role: "user",
                            parts: [{ functionResponse: { name: toolName, response: resultData } }]
                        });
                        continueLoop = true;
                        continue;
                    }
`;

if (!content.includes('toolName === "SCRAPE_SOCIAL_MEDIA"')) {
    const browseHook = '// 7. TOOL: BROWSE_WEB (Puppeteer Stealth chống bot)';
    content = content.replace(browseHook, socialHandlerCode + '\n                    ' + browseHook);
    console.log('✓ Added SCRAPE_SOCIAL_MEDIA tool handler in runAgentLoop');
}

fs.writeFileSync(indexPath, content, 'utf8');
console.log('Done patching index.html!');

