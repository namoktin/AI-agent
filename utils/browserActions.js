/**
 * ⚡ BROWSER ACTION & ACCESSIBILITY ENGINE (METHOD 2)
 * 
 * Provides:
 * 1. Compact Accessibility Tree snapshotting (100-300 tokens, eliminating 95%+ of HTML bloat)
 * 2. Multi-step Action Chaining (click, type, press, scroll, wait, extract, screenshot)
 * 3. Smart Auto-Wait (networkidle, DOM updates, target tab switching)
 * 4. Contextual Text Extraction (finding text after target keywords)
 * 5. Production-grade safety guards
 */

const fs = require('fs');
const path = require('path');

/**
 * Compacts a raw Chromium Accessibility Tree into an ultra-concise, indented YAML outline.
 * Typically reduces 20,000+ HTML tokens down to 100-300 clean semantic tokens.
 */
function compactAccessibilityTree(node, depth = 0, state = { count: 0, maxNodes: 120 }) {
    if (!node || state.count >= state.maxNodes) return '';

    const role = node.role || '';
    const name = (node.name || '').trim();
    const children = node.children || [];

    // Filter out purely decorative or generic container nodes without label
    if (['none', 'ignored', 'generic', 'paragraph'].includes(role) && !name && children.length <= 1) {
        if (children.length === 1) {
            return compactAccessibilityTree(children[0], depth, state);
        }
        return '';
    }

    let line = '';
    const indent = '  '.repeat(Math.min(depth, 5));

    // Extract key accessibility attributes
    const extras = [];
    if (node.level) extras.push(`level=${node.level}`);
    if (node.value) extras.push(`value="${node.value}"`);
    if (node.url) extras.push(`url="${node.url}"`);
    if (node.disabled) extras.push(`disabled`);
    if (node.expanded !== undefined) extras.push(`expanded=${node.expanded}`);
    const extraStr = extras.length > 0 ? ` [${extras.join(', ')}]` : '';

    const isInteractive = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'menuitem', 'tab', 'searchbox', 'switch'].includes(role);
    const isLandmark = ['heading', 'navigation', 'main', 'region', 'banner', 'complementary', 'form', 'dialog'].includes(role);
    const hasMeaning = name.length > 0;

    if (isInteractive || isLandmark || (hasMeaning && role !== 'RootWebArea')) {
        state.count++;
        const safeName = name.length > 80 ? name.slice(0, 77) + '...' : name;
        line = `${indent}- ${role}${safeName ? ` "${safeName}"` : ''}${extraStr}\n`;
    }

    let childLines = '';
    const nextDepth = line ? depth + 1 : depth;
    for (const child of children) {
        if (state.count >= state.maxNodes) {
            childLines += `${'  '.repeat(nextDepth)}... [bớt ${children.length} phần tử tiếp theo để tối ưu token]\n`;
            break;
        }
        childLines += compactAccessibilityTree(child, nextDepth, state);
    }

    return line + childLines;
}

/**
 * Executes a sequence of interactive actions on the browser page.
 */
async function executeBrowserActions(page, browser, actions = [], screenshotsDir = null) {
    const actionLogs = [];
    let currentTargetPage = page;
    let lastExtracted = null;

    if (!Array.isArray(actions) || actions.length === 0) {
        return { activePage: currentTargetPage, actionLogs, lastExtracted };
    }

    for (let i = 0; i < actions.length; i++) {
        const act = actions[i];
        if (!act || typeof act !== 'object') continue;
        const actType = (act.type || act.action || '').toLowerCase();
        const stepNum = i + 1;

        try {
            if (actType === 'click' || actType === 'tap' || actType === 'click_coords' || actType === 'click_at') {
                const targetText = act.text || act.selector || '';
                let clickSucceeded = false;
                let foundMeta = null;

                // 0. Click theo toạ độ tuyệt đối trên màn hình/canvas (cho Web App / Canvas / Video Editor)
                if (act.x !== undefined && act.y !== undefined) {
                    await currentTargetPage.mouse.click(Number(act.x), Number(act.y), { delay: act.delay || 50 });
                    clickSucceeded = true;
                    foundMeta = { coords: { x: Number(act.x), y: Number(act.y) } };
                }

                // 1. Nếu có selector rõ ràng, ưu tiên click qua selector
                if (!clickSucceeded && act.selector) {
                    try {
                        await currentTargetPage.waitForSelector(act.selector, { visible: true, timeout: act.timeout || 4000 });
                        await currentTargetPage.click(act.selector);
                        clickSucceeded = true;
                        foundMeta = { selector: act.selector };
                    } catch (e) {
                        // Nếu bị che bởi modal mask (overlay), tự động gỡ mask và thử lại
                        try {
                            await currentTargetPage.evaluate(() => {
                                document.querySelectorAll('.lv-modal-mask, .lv-mask, .modal-backdrop, .guide-mask').forEach(m => m.remove());
                            });
                            await currentTargetPage.click(act.selector);
                            clickSucceeded = true;
                            foundMeta = { selector: act.selector, unmasked: true };
                        } catch (e2) {
                            // Tiếp tục thử tìm theo text nếu selector thất bại
                        }
                    }
                }

                // 2. Tìm kiếm phần tử thông minh qua text / aria-label / href / label
                if (!clickSucceeded && targetText) {
                    const evalRes = await currentTargetPage.evaluate((query) => {
                        const search = query.toLowerCase().trim();
                        const candidates = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"], input[type="radio"], input[type="checkbox"], label, span, h1, h2, h3, h4, div'));

                        let el = candidates.find(c => ['A', 'BUTTON'].includes(c.tagName) && (c.innerText || '').toLowerCase().trim() === search);
                        if (!el) el = candidates.find(c => ['A', 'BUTTON'].includes(c.tagName) && (c.getAttribute('aria-label') || '').toLowerCase().trim() === search);
                        if (!el) el = candidates.find(c => ['A', 'BUTTON'].includes(c.tagName) && (c.innerText || '').toLowerCase().includes(search));
                        if (!el) el = candidates.find(c => ['A', 'BUTTON'].includes(c.tagName) && (c.getAttribute('aria-label') || '').toLowerCase().includes(search));
                        if (!el) el = candidates.find(c => c.tagName === 'LABEL' && (c.innerText || '').toLowerCase().trim() === search);
                        if (!el) el = candidates.find(c => c.tagName === 'LABEL' && (c.innerText || '').toLowerCase().includes(search));
                        if (!el) el = candidates.find(c => ['INPUT'].includes(c.tagName) && (c.getAttribute('value') || '').toLowerCase().trim() === search);
                        if (!el) el = candidates.find(c => (c.innerText || '').toLowerCase().trim() === search);
                        if (!el) el = candidates.find(c => (c.innerText || '').toLowerCase().includes(search));

                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            const href = el.getAttribute('href');
                            const target = el.getAttribute('target');
                            const fullHref = href ? new URL(href, window.location.href).href : null;
                            el.click();
                            return {
                                found: true,
                                tag: el.tagName,
                                text: (el.innerText || '').slice(0, 100).trim(),
                                href: fullHref,
                                target
                            };
                        }
                        return { found: false };
                    }, targetText);

                    if (evalRes && evalRes.found) {
                        clickSucceeded = true;
                        foundMeta = evalRes;
                    }
                }

                if (clickSucceeded) {
                    // Chờ mạng ổn định hoặc popup tab mới
                    await new Promise(r => setTimeout(r, act.waitMs || 2000));

                    // Phát hiện tab mới nếu có (ví dụ target="_blank")
                    const allPages = await browser.pages();
                    if (allPages.length > 1) {
                        const latestPage = allPages[allPages.length - 1];
                        if (latestPage !== currentTargetPage) {
                            currentTargetPage = latestPage;
                            await currentTargetPage.bringToFront();
                            await currentTargetPage.waitForNetworkIdle({ idleTime: 500, timeout: 10000 }).catch(() => {});
                        }
                    } else if (foundMeta && foundMeta.href && currentTargetPage.url() !== foundMeta.href && !foundMeta.href.includes('#')) {
                        // Nếu trang không tự chuyển hướng sau 2s, chủ động điều hướng tới href
                        try {
                            await currentTargetPage.goto(foundMeta.href, { waitUntil: 'networkidle2', timeout: 30000 });
                        } catch (e) {}
                    }

                    const hasCoords = foundMeta && foundMeta.coords;
                    const reportedAction = hasCoords ? 'click_coords' : (actType === 'tap' ? 'tap' : 'click');
                    const logEntry = { step: stepNum, action: reportedAction, target: targetText, element: foundMeta, success: true };
                    if (hasCoords) {
                        logEntry.x = foundMeta.coords.x;
                        logEntry.y = foundMeta.coords.y;
                    }
                    actionLogs.push(logEntry);
                } else {
                    actionLogs.push({ step: stepNum, action: 'click', target: targetText, success: false, error: 'Element not found' });
                }

            } else if (actType === 'type' || actType === 'fill' || actType === 'type_rich_text') {
                const textToType = act.text !== undefined ? act.text : (act.value !== undefined ? act.value : '');
                
                // Nếu chưa có selector nhưng có target/field/name, tự động tìm selector input phù hợp
                if (!act.selector && (act.target || act.field || act.name)) {
                    const fieldQuery = (act.target || act.field || act.name).toLowerCase();
                    try {
                        const foundSel = await currentTargetPage.evaluate((q) => {
                            const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea'));
                            let inp = inputs.find(i => (i.name || '').toLowerCase() === q || (i.placeholder || '').toLowerCase().includes(q) || (i.getAttribute('aria-label') || '').toLowerCase().includes(q));
                            if (!inp) {
                                const labels = Array.from(document.querySelectorAll('label'));
                                const matchingLabel = labels.find(l => (l.innerText || '').toLowerCase().includes(q));
                                if (matchingLabel) {
                                    inp = matchingLabel.querySelector('input, textarea') || (matchingLabel.htmlFor ? document.getElementById(matchingLabel.htmlFor) : null);
                                }
                            }
                            if (inp) {
                                if (inp.id) return `#${inp.id}`;
                                if (inp.name) return `[name="${inp.name}"]`;
                                inp.focus();
                                return null;
                            }
                            return null;
                        }, fieldQuery);
                        if (foundSel) act.selector = foundSel;
                    } catch (e) {}
                }

                if (act.selector) {
                    await currentTargetPage.waitForSelector(act.selector, { visible: true, timeout: act.timeout || 6000 });
                    
                    // Kiểm tra xem phần tử có phải là rich text / contenteditable không
                    const isRich = await currentTargetPage.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        if (!el) return false;
                        return el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
                    }, act.selector);

                    if (isRich) {
                        await currentTargetPage.evaluate((sel, val) => {
                            const el = document.querySelector(sel);
                            if (el) {
                                el.focus();
                                document.execCommand('selectAll', false, null);
                                document.execCommand('insertText', false, val);
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }, act.selector, String(textToType));
                        actionLogs.push({ step: stepNum, action: 'type', selector: act.selector, text: textToType, mode: 'contenteditable', success: true });
                    } else {
                        await currentTargetPage.click(act.selector, { clickCount: 3 });
                        await currentTargetPage.keyboard.press('Backspace');
                        await currentTargetPage.type(act.selector, String(textToType), { delay: act.delay || 30 });
                        actionLogs.push({ step: stepNum, action: 'type', selector: act.selector, text: textToType, mode: 'standard', success: true });
                    }
                } else {
                    await currentTargetPage.keyboard.type(String(textToType), { delay: act.delay || 30 });
                    actionLogs.push({ step: stepNum, action: 'type', text: textToType, success: true });
                }

            } else if (actType === 'select' || actType === 'select_option' || actType === 'choose') {
                const targetValue = act.value !== undefined ? String(act.value) : (act.text !== undefined ? String(act.text) : '');
                let selectSucceeded = false;
                if (act.selector) {
                    try {
                        await currentTargetPage.waitForSelector(act.selector, { visible: true, timeout: act.timeout || 5000 });
                        await currentTargetPage.select(act.selector, targetValue);
                        selectSucceeded = true;
                    } catch (e) {
                        // Thử chọn theo text option nếu chọn theo value thất bại
                        selectSucceeded = await currentTargetPage.evaluate((sel, val) => {
                            const selectEl = document.querySelector(sel);
                            if (!selectEl) return false;
                            const opt = Array.from(selectEl.options).find(o => 
                                o.value.toLowerCase() === val.toLowerCase() || 
                                (o.text || '').toLowerCase().trim() === val.toLowerCase() ||
                                (o.text || '').toLowerCase().includes(val.toLowerCase())
                            );
                            if (opt) {
                                selectEl.value = opt.value;
                                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                                selectEl.dispatchEvent(new Event('input', { bubbles: true }));
                                return true;
                            }
                            return false;
                        }, act.selector, targetValue).catch(() => false);
                    }
                } else if (act.text || act.target) {
                    const query = (act.target || act.text || '').toLowerCase();
                    selectSucceeded = await currentTargetPage.evaluate((q, val) => {
                        const selects = Array.from(document.querySelectorAll('select'));
                        let targetSelect = selects.find(s => (s.name || '').toLowerCase().includes(q) || (s.id || '').toLowerCase().includes(q));
                        if (!targetSelect) {
                            const labels = Array.from(document.querySelectorAll('label'));
                            const matchingLabel = labels.find(l => (l.innerText || '').toLowerCase().includes(q));
                            if (matchingLabel) {
                                targetSelect = matchingLabel.querySelector('select') || (matchingLabel.htmlFor ? document.getElementById(matchingLabel.htmlFor) : null);
                            }
                        }
                        if (targetSelect) {
                            const opt = Array.from(targetSelect.options).find(o => 
                                o.value.toLowerCase() === val.toLowerCase() || 
                                (o.text || '').toLowerCase().trim() === val.toLowerCase() ||
                                (o.text || '').toLowerCase().includes(val.toLowerCase())
                            );
                            if (opt) {
                                targetSelect.value = opt.value;
                                targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                targetSelect.dispatchEvent(new Event('input', { bubbles: true }));
                                return true;
                            }
                        }
                        return false;
                    }, query, targetValue).catch(() => false);
                }
                actionLogs.push({ step: stepNum, action: 'select', selector: act.selector, value: targetValue, success: selectSucceeded });

            } else if (actType === 'check' || actType === 'uncheck') {
                let checkSucceeded = false;
                const shouldCheck = actType !== 'uncheck';
                if (act.selector) {
                    try {
                        await currentTargetPage.waitForSelector(act.selector, { visible: true, timeout: act.timeout || 5000 });
                        checkSucceeded = await currentTargetPage.evaluate((sel, sc) => {
                            const el = document.querySelector(sel);
                            if (el && (el.type === 'checkbox' || el.type === 'radio')) {
                                el.checked = sc;
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                return true;
                            }
                            return false;
                        }, act.selector, shouldCheck);
                    } catch (e) {}
                }
                actionLogs.push({ step: stepNum, action: actType, selector: act.selector, success: checkSucceeded });

            } else if (actType === 'press' || actType === 'key') {
                const key = act.key || act.text || 'Enter';
                await currentTargetPage.keyboard.press(key);
                await new Promise(r => setTimeout(r, act.waitMs || 1000));
                actionLogs.push({ step: stepNum, action: 'press', key, success: true });

            } else if (actType === 'scroll') {
                const dist = act.distance || act.dist || 600;
                await currentTargetPage.evaluate((d) => window.scrollBy(0, d), dist);
                await new Promise(r => setTimeout(r, act.waitMs || 600));
                actionLogs.push({ step: stepNum, action: 'scroll', distance: dist, success: true });

            } else if (actType === 'wait' || actType === 'sleep') {
                const ms = act.ms || act.waitMs || 2000;
                await new Promise(r => setTimeout(r, ms));
                actionLogs.push({ step: stepNum, action: 'wait', ms, success: true });

            } else if (actType === 'dismiss_modals' || actType === 'clear_overlays' || actType === 'close_dialogs') {
                const removedCount = await currentTargetPage.evaluate(() => {
                    let count = 0;
                    const closeButtons = document.querySelectorAll('button[aria-label*="close" i], button[aria-label*="đóng" i], .close-btn, .lv-modal-close-btn, [class*="modal"] [class*="close"]');
                    closeButtons.forEach(btn => { try { btn.click(); count++; } catch(e){} });
                    const selectors = [
                        '.lv-modal-mask', '.lv-mask', '.lv-modal',
                        '.modal-backdrop', '.guide-mask', 'div[role="dialog"]',
                        '.ant-modal-mask', '.ant-modal-wrap',
                        '[class*="modal_mask"]', '[class*="backdrop"]', '[class*="onboarding-guide"]'
                    ];
                    document.querySelectorAll(selectors.join(', ')).forEach(el => {
                        try { el.remove(); count++; } catch(e){}
                    });
                    return count;
                });
                actionLogs.push({ step: stepNum, action: 'dismiss_modals', removedCount, success: true });

            } else if (actType === 'hover' || actType === 'move') {
                if (act.x !== undefined && act.y !== undefined) {
                    await currentTargetPage.mouse.move(Number(act.x), Number(act.y), { steps: act.steps || 5 });
                    actionLogs.push({ step: stepNum, action: 'hover', coords: { x: act.x, y: act.y }, success: true });
                } else if (act.selector) {
                    await currentTargetPage.hover(act.selector);
                    actionLogs.push({ step: stepNum, action: 'hover', selector: act.selector, success: true });
                }

            } else if (actType === 'drag_and_drop' || actType === 'drag') {
                const fromX = Number(act.fromX || act.x || 0);
                const fromY = Number(act.fromY || act.y || 0);
                const toX = Number(act.toX || act.targetX || 0);
                const toY = Number(act.toY || act.targetY || 0);
                await currentTargetPage.mouse.move(fromX, fromY);
                await currentTargetPage.mouse.down();
                await currentTargetPage.mouse.move(toX, toY, { steps: act.steps || 10 });
                await currentTargetPage.mouse.up();
                actionLogs.push({ step: stepNum, action: 'drag_and_drop', from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, success: true });

            } else if (actType === 'wait_selector' || actType === 'wait_for') {
                const sel = act.selector || act.text;
                if (sel) {
                    await currentTargetPage.waitForSelector(sel, { visible: act.visible !== false, timeout: act.timeout || 10000 });
                    actionLogs.push({ step: stepNum, action: 'wait_selector', selector: sel, success: true });
                }

            } else if (actType === 'eval' || actType === 'evaluate') {
                const code = act.script || act.code || act.expr;
                if (code) {
                    const evalResult = await currentTargetPage.evaluate((c) => {
                        try {
                            const fn = new Function('return (' + c + ')');
                            return { success: true, result: fn() };
                        } catch (e) {
                            return { success: false, error: e.message };
                        }
                    }, code);
                    actionLogs.push({ step: stepNum, action: 'eval', result: evalResult, success: true });
                }

            } else if (actType === 'extract' || actType === 'extract_text') {
                const extractRes = await currentTargetPage.evaluate((opts) => {
                    const fullText = document.body ? document.body.innerText : '';
                    let foundText = null;
                    let contextSnippet = null;

                    if (opts.findAfter) {
                        const target = opts.findAfter.toLowerCase();
                        const idx = fullText.toLowerCase().indexOf(target);
                        if (idx !== -1) {
                            foundText = fullText.slice(idx + opts.findAfter.length).trim();
                            contextSnippet = fullText.slice(Math.max(0, idx - 80), Math.min(fullText.length, idx + 250));
                        }
                    }

                    if (!foundText && opts.selector) {
                        const el = document.querySelector(opts.selector);
                        if (el) foundText = el.innerText.trim();
                    }

                    return {
                        url: window.location.href,
                        title: document.title,
                        foundText: foundText ? foundText.slice(0, opts.limit || 500) : null,
                        contextSnippet
                    };
                }, act);

                lastExtracted = extractRes.foundText;
                actionLogs.push({ step: stepNum, action: 'extract', result: extractRes, success: true });

            } else if (actType === 'screenshot') {
                if (screenshotsDir) {
                    const filename = `action_${Date.now()}_step${stepNum}.jpg`;
                    const fullPath = path.join(screenshotsDir, filename);
                    await currentTargetPage.screenshot({ path: fullPath, type: 'jpeg', quality: 80 });
                    actionLogs.push({ step: stepNum, action: 'screenshot', path: fullPath, success: true });
                }
            }
        } catch (err) {
            actionLogs.push({ step: stepNum, action: actType, success: false, error: err.message });
        }
    }

    return { activePage: currentTargetPage, actionLogs, lastExtracted };
}

/**
 * Contextual text extractor: extracts text following a specific keyword from the active page.
 */
async function extractContextualText(page, options = {}) {
    const { findAfter, limit = 500 } = options;
    if (!findAfter) return null;

    try {
        return await page.evaluate((opts) => {
            const bodyText = document.body ? document.body.innerText : '';
            const search = opts.findAfter.toLowerCase();
            const idx = bodyText.toLowerCase().indexOf(search);
            if (idx === -1) return null;

            const afterText = bodyText.slice(idx + opts.findAfter.length).trim();
            const snippet = bodyText.slice(Math.max(0, idx - 80), Math.min(bodyText.length, idx + 250));

            // Lấy từ đầu tiên hoặc toàn bộ đoạn văn sau từ khóa
            const firstWordMatch = afterText.match(/^([^\s.,;!?\n]+)/);
            const firstWord = firstWordMatch ? firstWordMatch[1] : '';

            return {
                keyword: opts.findAfter,
                found: true,
                firstWord: firstWord,
                followingText: afterText.slice(0, opts.limit || 300),
                contextSnippet: snippet
            };
        }, { findAfter, limit });
    } catch (e) {
        return null;
    }
}

module.exports = {
    compactAccessibilityTree,
    executeBrowserActions,
    extractContextualText
};
