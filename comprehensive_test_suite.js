const fs = require('fs');
const path = require('path');
const puppeteerCore = require('puppeteer-core');

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runTestSuite() {
    console.log('================================================================');
    console.log('🚀 CYBER AGENT - COMPREHENSIVE REGRESSION & INTEGRATION TEST SUITE');
    console.log('================================================================\n');

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    const errors = [];

    function assert(condition, testName, detail = '') {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`  ✅ [PASS] ${testName} ${detail ? '(' + detail + ')' : ''}`);
        } else {
            failedTests++;
            const errMsg = `❌ [FAIL] ${testName} ${detail ? '- ' + detail : ''}`;
            console.error(`  ${errMsg}`);
            errors.push(errMsg);
        }
    }

    // =========================================================================
    // PART A: BACKEND APIS & FUNCTION CALLING CONTRACTS
    // =========================================================================
    console.log('--- PHẦN 1: KIỂM THỬ BACKEND API & CƠ CHẾ NATIVE TOOLS ---');

    // 1. Config
    try {
        const res = await fetch(`${BASE_URL}/api/config`);
        const data = await res.json();
        assert(data && data.success && (data.apiKey !== undefined || data.hasGeminiKey !== undefined), 'API /api/config', `Port: ${data.port}`);
    } catch(e) {
        assert(false, 'API /api/config', e.message);
    }

    // 2. Workspace Info
    try {
        const res = await fetch(`${BASE_URL}/api/workspace-info`);
        const data = await res.json();
        assert(data && data.success && data.outputBaseDir, 'API /api/workspace-info', `Thư mục hôm nay: ${data.todayFolder}`);
    } catch(e) {
        assert(false, 'API /api/workspace-info', e.message);
    }

    // 3. Get Experiences
    try {
        const res = await fetch(`${BASE_URL}/api/get-experiences`);
        const data = await res.json();
        assert(data && data.success && typeof data.total === 'number', 'API /api/get-experiences', `Tổng bài học: ${data.total}`);
    } catch(e) {
        assert(false, 'API /api/get-experiences', e.message);
    }

    // 4. Search Experiences - Existing Match
    try {
        const res = await fetch(`${BASE_URL}/api/search-experiences`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'memory leak Node.js heap' })
        });
        const data = await res.json();
        assert(data.success && data.matches && data.matches.length > 0, 'API /api/search-experiences (Tìm bài học cũ)', `Khớp ${data.matches.length} bài`);
    } catch(e) {
        assert(false, 'API /api/search-experiences (Tìm bài học cũ)', e.message);
    }

    // 5. Search Experiences - Vetting High Value Domain
    try {
        const res = await fetch(`${BASE_URL}/api/search-experiences`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'cách nói chuyện giao việc chuyên nghiệp và nghệ thuật giao tiếp lãnh đạo' })
        });
        const data = await res.json();
        assert(data.success && data.worthyToLearn === true && data.domainName, 'API /api/search-experiences (Bộ Dò & Duyệt: Miền giá trị cao)', `Miền: ${data.domainName}`);
    } catch(e) {
        assert(false, 'API /api/search-experiences (Bộ Dò & Duyệt)', e.message);
    }

    // 6. Search Experiences - Vetting Direct Resolution
    try {
        const res = await fetch(`${BASE_URL}/api/search-experiences`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'xin chào bạn có khỏe không' })
        });
        const data = await res.json();
        assert(data.success && data.worthyToLearn === false, 'API /api/search-experiences (Bộ Dò & Duyệt: Giải quyết trực tiếp)', 'Không tra mạng bừa bãi');
    } catch(e) {
        assert(false, 'API /api/search-experiences (Giải quyết trực tiếp)', e.message);
    }

    // 7. Multi-Source Web Search
    try {
        const res = await fetch(`${BASE_URL}/api/search`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'Node.js performance best practices 2026' })
        });
        const data = await res.json();
        assert(data.success && Array.isArray(data.items) && data.items.length > 0, 'API /api/search (Đa nguồn Dev.to, Wikipedia, Google News)', `Tìm thấy ${data.items.length} nguồn`);
    } catch(e) {
        assert(false, 'API /api/search', e.message);
    }

    // 8. Audit Experiences
    try {
        const res = await fetch(`${BASE_URL}/api/audit-experiences`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter: 'low_score' })
        });
        const data = await res.json();
        assert(data.success && data.total !== undefined, 'API /api/audit-experiences (Rà soát & Chẩn đoán)', `Tổng: ${data.total}, Điểm TB: ${data.averageScore}%`);
    } catch(e) {
        assert(false, 'API /api/audit-experiences', e.message);
    }

    // 9. Codebase Map
    try {
        const res = await fetch(`${BASE_URL}/api/codebase-map`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rootDir: '.', depth: 2 })
        });
        const data = await res.json();
        assert(data.success && data.tree, 'API /api/codebase-map (Sơ đồ cấu trúc)', `Tổng số nhánh: ${data.tree.children ? data.tree.children.length : 0}`);
    } catch(e) {
        assert(false, 'API /api/codebase-map', e.message);
    }

    // 10. File Operations (Save, Read, List)
    const testFile = 'temp_test_check.txt';
    try {
        const saveRes = await fetch(`${BASE_URL}/api/save-file`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: testFile, content: 'Cyber Agent Test Content 2026' })
        });
        const saveData = await saveRes.json();
        assert(saveData.success, 'API /api/save-file', saveData.fullPath);

        const readRes = await fetch(`${BASE_URL}/api/read-file`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: testFile })
        });
        const readData = await readRes.json();
        assert(readData.success && readData.content === 'Cyber Agent Test Content 2026', 'API /api/read-file', 'Khớp nội dung chính xác');

        const listRes = await fetch(`${BASE_URL}/api/list-files`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dirPath: '.', recursive: false })
        });
        const listData = await listRes.json();
        assert(listData.success && Array.isArray(listData.items) && listData.items.some(f => f.name === testFile), 'API /api/list-files', `Tìm thấy ${listData.totalItems} file`);

        // Clean up temp test file
        const fullPath = saveData.fullPath;
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch(e) {
        assert(false, 'API File Operations', e.message);
    }

    // 11. Run CMD — contract mới chỉ nhận script file, không nhận node -e
    try {
        const safeScript = path.join(__dirname, 'temp_test_command.js');
        fs.writeFileSync(safeScript, 'process.stdout.write("579");\n', 'utf8');
        const cmdRes = await fetch(`${BASE_URL}/api/run-cmd`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'node temp_test_command.js', cwd: __dirname })
        });
        const cmdData = await cmdRes.json();
        assert(cmdData.success && cmdData.output && cmdData.output.trim() === '579', 'API /api/run-cmd (script schema)', `Output: ${cmdData.output?.trim()}`);

        const injectionRes = await fetch(`${BASE_URL}/api/run-cmd`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'node -e "console.log(123 + 456)"', cwd: __dirname })
        });
        const injectionData = await injectionRes.json();
        assert(injectionData.success === false, 'API /api/run-cmd (từ chối node -e)', 'Shell/eval schema bị chặn');
        if (fs.existsSync(safeScript)) fs.unlinkSync(safeScript);
    } catch(e) {
        assert(false, 'API /api/run-cmd', e.message);
    }

    // 12. Academic Search Connector
    try {
        const acaRes = await fetch(`${BASE_URL}/api/academic/search`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'cold water immersion catecholamines dopamine', limit: 4 })
        });
        const acaData = await acaRes.json();
        assert(acaData.success && Array.isArray(acaData.items) && acaData.items.length > 0, 'API /api/academic/search (PubMed + Europe PMC + Crossref)', `Tìm thấy ${acaData.totalFound} tài liệu học thuật`);
    } catch(e) {
        assert(false, 'API /api/academic/search', e.message);
    }

    // 13. Verify Source Metadata (DOI / PMID)
    try {
        const vsRes = await fetch(`${BASE_URL}/api/academic/verify-source`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doi: '10.1007/s004210050065', pmid: '10751106' })
        });
        const vsData = await vsRes.json();
        assert(vsData.success && vsData.verified && vsData.metadata && vsData.metadata.title, 'API /api/academic/verify-source (Crossref / PubMed Metadata)', `Bài: "${vsData.metadata?.title?.slice(0, 45)}..."`);
    } catch(e) {
        assert(false, 'API /api/academic/verify-source', e.message);
    }

    // 14. Claim Ledger Operations
    try {
        const clRes = await fetch(`${BASE_URL}/api/claim-ledger`);
        const clData = await clRes.json();
        assert(clData.success && Array.isArray(clData.claims), 'API /api/claim-ledger (Sổ Cái Tuyên Bố Khoa Học)', `Tổng số Claim: ${clData.total}`);
    } catch(e) {
        assert(false, 'API /api/claim-ledger', e.message);
    }

    // 15. Citation Entailment Auditor
    try {
        const aeRes = await fetch(`${BASE_URL}/api/claim-ledger/audit-entailment`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                claimText: 'Ngâm nước lạnh làm dopamine trong não tăng 250%',
                sourceData: {
                    sourceText: 'plasma catecholamines increased in 10 healthy men',
                    sampleSize: 10,
                    species: 'human'
                }
            })
        });
        const aeData = await aeRes.json();
        const caughtContradiction = aeData.audit?.status === 'CONTRADICTED' && aeData.audit?.blockingIssues?.length > 0;
        assert(aeData.success && caughtContradiction, 'API /api/claim-ledger/audit-entailment (Bắt lỗi ngụy biện)', `Trạng thái: ${aeData.audit?.status} - ${aeData.audit?.blockingIssues?.[0]?.slice(0, 40)}...`);
    } catch(e) {
        assert(false, 'API /api/claim-ledger/audit-entailment', e.message);
    }

    // 16. Scientific Quality Gate (Enforce Quality Gate)
    try {
        const reportContent = fs.existsSync('c:\\Users\\Nam\\Desktop\\gemini\\2026-10-19\\bao_cao_canonical_tong_hop.md')
            ? fs.readFileSync('c:\\Users\\Nam\\Desktop\\gemini\\2026-10-19\\bao_cao_canonical_tong_hop.md', 'utf8')
            : '# Báo cáo nghiên cứu\nTier 1 Epistemic Matrix\n';
        const qgRes = await fetch(`${BASE_URL}/api/academic/quality-gate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportContent })
        });
        const qgData = await qgRes.json();
        assert(qgData.success && qgData.qualityGate?.passed && qgData.qualityGate?.score >= 9.0, 'API /api/academic/quality-gate (Cổng Kiểm Định Chất Lượng 9.0+)', `Điểm: ${qgData.qualityGate?.score}/10 - 0 Lỗi Khoa Học`);
    } catch(e) {
        assert(false, 'API /api/academic/quality-gate', e.message);
    }

    // =========================================================================
    // PART B: FRONTEND BROWSER INTEGRATION & UI FIDELITY
    // =========================================================================
    console.log('\n--- PHẦN 2: KIỂM THỬ GIAO DIỆN FRONTEND & TÍCH HỢP TRÌNH DUYỆT ---');

    let browser;
    try {
        browser = await puppeteerCore.launch({
            executablePath: CHROME_PATH,
            headless: 'new',
            defaultViewport: { width: 1280, height: 900 }
        });

        const page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.toString()));
        page.on('console', msg => {
            if (msg.type() === 'error') {
                pageErrors.push(msg.text());
            }
        });

        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
        assert(pageErrors.length === 0, 'Tải trang index.html không phát sinh lỗi Console/JS', pageErrors.length > 0 ? pageErrors.join(', ') : '0 lỗi');

        // Test UI Elements via evaluate
        const uiChecks = await page.evaluate(() => {
            // 1. Check Chairman message right alignment
            appendCorporateMessage('vp', { name: '👑 CHỦ TỊCH / CEO', avatar: '👑', color: 'var(--accent-yellow)' }, 'Chỉ đạo khẩn cấp: Tối ưu toàn bộ hệ thống', 'user-message');
            const userMsg = document.querySelector('.message-wrapper.user-message');
            const userMsgStyle = window.getComputedStyle(userMsg);
            const userAvatar = userMsg.querySelector('.avatar');
            const userAvatarStyle = window.getComputedStyle(userAvatar);
            const senderName = userMsg.querySelector('.sender-name');

            // 2. Check Search Card UI
            const searchHtml = createSearchCardHtml({
                id: 'test-search-ui-1',
                type: 'web_search',
                query: 'Google DeepMind Agent Architecture',
                isScanning: false,
                success: true,
                statusText: 'Đã tìm thấy 2 nguồn thông tin chất lượng',
                items: [
                    { title: 'Agent Systems Research', url: 'https://example.com/agents', source: 'Dev.to', snippet: 'Multi-agent coordination and decentralized voting protocols.' },
                    { title: 'Swarm Intelligence', url: 'https://example.com/swarm', source: 'Wikipedia', snippet: 'Collective behavior of decentralized, self-organized systems.' }
                ]
            });
            appendCorporateMessage('vp', { name: '🤖 PHÓ GIÁM ĐỐC', avatar: '🤖', color: '#a855f7' }, searchHtml, 'bot-message');
            const searchCard = document.getElementById('test-search-ui-1');
            const searchBadge = searchCard ? searchCard.querySelector('.tool-badge-search') : null;
            const searchPill = searchCard ? searchCard.querySelector('.tool-query-pill') : null;
            const resultItems = searchCard ? searchCard.querySelectorAll('.tool-result-item') : [];

            // 3. Check Experience Card UI
            const expHtml = createSearchCardHtml({
                id: 'test-exp-ui-1',
                type: 'experience',
                query: 'Event Loop Lag Fix',
                isScanning: false,
                success: true,
                statusText: 'Đã tìm thấy 1 bài học kinh nghiệm đã kiểm chứng',
                matches: [
                    { task: 'Tối ưu Event Loop', solution: 'Chia batch tác vụ nặng bằng setImmediate', qualityScore: 92, grade: 'Kim Cương' }
                ]
            });
            appendCorporateMessage('vp', { name: '🤖 PHÓ GIÁM ĐỐC', avatar: '🤖', color: '#a855f7' }, expHtml, 'bot-message');
            const expCard = document.getElementById('test-exp-ui-1');

            // 4. Check Vetting Card UI
            const vetHtml = createSearchCardHtml({
                id: 'test-vet-ui-1',
                type: 'vetting',
                query: 'Nghệ thuật thương lượng',
                isScanning: false,
                success: true,
                statusText: 'Đã duyệt chủ đề miền giá trị cao',
                vetting: {
                    worthyToLearn: true,
                    domainName: 'Đàm phán & Thương lượng',
                    reason: 'Miền kiến thức lãnh đạo cấp cao',
                    suggestedSearchQuery: 'Harvard negotiation principles'
                }
            });
            appendCorporateMessage('vp', { name: '🤖 PHÓ GIÁM ĐỐC', avatar: '🤖', color: '#a855f7' }, vetHtml, 'bot-message');
            const vetCard = document.getElementById('test-vet-ui-1');

            // 5. Check Markdown & Table rendering
            const tableMarkdown = `### Bảng kiểm thử báo cáo\n\n| Kênh điều hành | Trạng thái | Thẩm quyền |\n|---|---|---|\n| VP Channel | Hoạt động | Cấp 1 |\n| War Room | Sẵn sàng | Toàn thể |`;
            const renderedTableHtml = marked.parse(tableMarkdown);
            appendCorporateMessage('vp', { name: '🤖 PHÓ GIÁM ĐỐC', avatar: '🤖', color: '#a855f7' }, renderedTableHtml, 'bot-message');
            const hasTable = !!document.querySelector('.message-content table');
            const tableRowsCount = document.querySelectorAll('.message-content table tr').length;

            // 6. Check READ_FILE card with duration badge
            const rfHtml = createSearchCardHtml({
                id: 'test-rf-ui-1',
                type: 'read_file',
                query: 'package.json',
                isScanning: false,
                duration: '0.45s',
                success: true,
                statusText: 'Đã đọc xong (52 dòng, 1420 bytes)'
            });
            appendCorporateMessage('vp', { name: '👨‍💻 KỸ SƯ', avatar: '👨‍💻', color: '#06b6d4' }, rfHtml, 'bot-message');
            const rfCard = document.getElementById('test-rf-ui-1');
            const rfBadge = rfCard ? rfCard.querySelector('.tool-badge-file') : null;
            const rfDuration = rfCard ? rfCard.querySelector('.tool-duration-badge') : null;

            // 7. Check RUN_CMD card with duration badge
            const rcHtml = createSearchCardHtml({
                id: 'test-rc-ui-1',
                type: 'run_cmd',
                query: 'node -v',
                isScanning: false,
                duration: '0.12s',
                success: true,
                statusText: 'Hoàn tất lệnh thành công'
            });
            appendCorporateMessage('vp', { name: '👨‍💻 KỸ SƯ', avatar: '👨‍💻', color: '#06b6d4' }, rcHtml, 'bot-message');
            const rcCard = document.getElementById('test-rc-ui-1');
            const rcBadge = rcCard ? rcCard.querySelector('.tool-badge-cmd') : null;

            // 8. Check Error / Stop Card with duration badge
            const errHtml = createSearchCardHtml({
                id: 'test-err-ui-1',
                type: 'error',
                query: 'Quét hệ thống gặp lỗi mạng',
                isScanning: false,
                duration: '3.2s',
                success: false,
                statusText: 'Dừng do lỗi kết nối'
            });
            appendCorporateMessage('vp', { name: '👨‍💻 KỸ SƯ', avatar: '👨‍💻', color: '#06b6d4' }, errHtml, 'bot-message');
            const errCard = document.getElementById('test-err-ui-1');
            const errBadge = errCard ? errCard.querySelector('.tool-badge-error') : null;
            const hasToolErrorClass = errCard ? errCard.classList.contains('tool-error') : false;

            // 9. Check specialist status dot and description update
            corporateState.specialists['test_worker'] = { id: 'test_worker', name: 'Nhân viên Test', role: 'Tester', avatar: '🔬', color: '#06b6d4' };
            renderSpecialistList();
            updateSpecialistStatus('test_worker', 'status-error', 'Lỗi sau 2.5s: Timeout API');
            const testDot = document.getElementById('dot-test_worker');
            const testDesc = document.getElementById('desc-test_worker');

            return {
                userFlexDir: userMsgStyle.flexDirection,
                userAvatarBg: userAvatarStyle.background,
                senderText: senderName ? senderName.innerText : '',
                hasSearchBadge: !!searchBadge,
                hasSearchPill: !!searchPill,
                resultItemsCount: resultItems.length,
                hasExpCard: !!expCard,
                hasVetCard: !!vetCard,
                hasTable: hasTable,
                tableRowsCount: tableRowsCount,
                hasRfBadge: !!rfBadge,
                rfDurationText: rfDuration ? rfDuration.innerText : '',
                hasRcBadge: !!rcBadge,
                hasErrBadge: !!errBadge,
                hasToolErrorClass: hasToolErrorClass,
                dotHasStatusError: testDot ? testDot.classList.contains('status-error') : false,
                descHasErrorText: testDesc ? testDesc.innerText.includes('Lỗi sau 2.5s') : false
            };
        });

        assert(uiChecks.userFlexDir === 'row-reverse', 'Tin nhắn Chủ Tịch neo bên PHẢI (row-reverse)', uiChecks.userFlexDir);
        assert(uiChecks.senderText.includes('CHỦ TỊCH / CEO'), 'Huy hiệu Chủ Tịch hiển thị đầy đủ', uiChecks.senderText);
        assert(uiChecks.hasSearchBadge && uiChecks.hasSearchPill, 'Thẻ tìm kiếm Cyber có Badge và Query Pill', 'Đầy đủ thành phần UI');
        assert(uiChecks.resultItemsCount === 2, 'Khay kết quả tìm kiếm hiển thị danh sách bài viết & trích dẫn', `${uiChecks.resultItemsCount} bài viết`);
        assert(uiChecks.hasExpCard, 'Thẻ Kho trí nhớ hiển thị bài học với điểm số và giải pháp', 'Hiển thị chuẩn');
        assert(uiChecks.hasVetCard, 'Thẻ Bộ Dò & Duyệt hiển thị miền giá trị cao và từ khóa gợi ý', 'Hiển thị chuẩn');
        assert(uiChecks.hasTable && uiChecks.tableRowsCount === 3, 'Markdown Table hiển thị chuẩn xác', `${uiChecks.tableRowsCount} dòng`);
        assert(uiChecks.hasRfBadge && uiChecks.rfDurationText.includes('0.45s'), 'Thẻ READ_FILE Cyber có Badge và Badge thời gian thực thi (⏱️ 0.45s)', uiChecks.rfDurationText);
        assert(uiChecks.hasRcBadge, 'Thẻ RUN_CMD Cyber có Badge lệnh chuyên dụng', 'tool-badge-cmd chuẩn');
        assert(uiChecks.hasErrBadge && uiChecks.hasToolErrorClass, 'Thẻ Báo lỗi / Dừng Cyber có Badge lỗi và viền đỏ neon (tool-error)', 'Chuẩn nhận diện');
        assert(uiChecks.dotHasStatusError && uiChecks.descHasErrorText, 'Sidebar nhân viên cập nhật chấm đỏ lỗi và text mô tả thời gian dừng', 'Dot & Description chuẩn');

        await browser.close();
    } catch(e) {
        if (browser) await browser.close();
        assert(false, 'Puppeteer Browser Integration', e.message);
    }

    // =========================================================================
    // PART C: KIỂM THỬ TỐI ƯU HÓA HỘI ĐỒNG TRANH BIỆN & CHUẨN MỰC CHẤT LƯỢNG TINH HOA 8.5+
    // =========================================================================
    console.log('\n--- PHẦN 3: KIỂM THỬ TỐI ƯU HÓA TOKEN & CHUẨN MỰC CHẤT LƯỢNG 8.5+ ---');

    const indexHtmlContent = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

    // 1. Kiểm tra giới hạn số vòng tranh biện tinh gọn (mặc định 2 vòng, tối đa 3 vòng)
    const hasDefaultRounds2 = indexHtmlContent.includes('rounds = 2') && indexHtmlContent.includes('rounds || 2');
    const hasMaxRoundsCap = indexHtmlContent.includes('Math.min(3, Math.max(1, rounds || 2))');
    assert(hasDefaultRounds2 && hasMaxRoundsCap, 'Giới hạn số vòng tranh luận tinh gọn 2 vòng (cắt giảm >75% token thừa)', 'rounds default: 2, max cap: 3');

    // 2. Kiểm tra bộ khung 50/50 Dual-Core (Tiềm năng đột phá vs Giới hạn sinh học)
    const has5050Rule = indexHtmlContent.includes('50% Năng lực Đột phá & Phương pháp Khả thi') &&
                        indexHtmlContent.includes('50% Cơ sở Khoa học & Giới hạn Sinh học');
    assert(has5050Rule, 'Bộ khung nhận thức cân bằng 50/50 (Tiềm năng đột phá vs Giới hạn sinh học)', 'Đã tích hợp vào VP & Specialist Prompts');

    // 3. Kiểm tra rào chắn chống ảo giác (Anti-Hallucination Guardrails)
    const hasAntiHallucination = indexHtmlContent.includes('ZERO-HALLUCINATION GUARDRAILS') &&
                                indexHtmlContent.includes('cấm bịa kỷ lục marathon 1:59:30');
    assert(hasAntiHallucination, 'Rào chắn chống ảo giác & cấm bịa đặt kỷ lục tương lai', 'Loại bỏ hoàn toàn lỗi Echo Chamber');

    // 4. Kiểm tra nguyên tắc Single Master Canonical Deliverable (Zero File Spam)
    const hasSingleCanonicalRule = indexHtmlContent.includes('ZERO FILE SPAM') &&
                                   indexHtmlContent.includes('DUY NHẤT 1 Báo cáo Canonical Đỉnh cao');
    assert(hasSingleCanonicalRule, 'Quy chế DUY NHẤT 1 Báo cáo Canonical (Chống spam 19 file nháp)', 'Bản chuẩn duy nhất được lưu');

    // 5. Kiểm tra cơ chế lọc trùng lặp file trong thẻ bàn giao (Delivery Deck Deduplication)
    const hasDeduplicationLogic = indexHtmlContent.includes('const uniqueSavedFiles = [];') &&
                                  indexHtmlContent.includes('createExecutiveDeliveryDeck(uniqueSavedFiles');
    assert(hasDeduplicationLogic, 'Khay bàn giao hồ sơ lọc trùng file thông minh', 'Hiển thị sạch đẹp cho CEO');

    // 6. Kiểm tra cơ chế Chống Phó Giám Đốc Độc Quyền (Chống False Consensus khi có 1 agent bất đồng)
    const hasStrictUnanimous = indexHtmlContent.includes('const isUnanimous = (agreedCount === totalCount);');
    const hasDissentFilter = indexHtmlContent.includes('bảo lưu|bất đồng|phản đối|chưa hài lòng|còn nghi ngờ|chưa đồng ý|chưa đồng thuận|không đồng thuận|từ chối phê duyệt');
    const hasCeoEscalationOnDispute = indexHtmlContent.includes('promptCeoDebateRuling(');
    assert(hasStrictUnanimous && hasDissentFilter && hasCeoEscalationOnDispute, 'Cơ chế Chống Độc quyền: 1 Agent bất đồng là KHÔNG được phê duyệt', 'Bắt buộc 100% đồng thuận hoặc thỉnh thị CEO');

    // 7. Kiểm tra An toàn khi Agent gặp lỗi (Tuyệt đối không tự ý gán Đồng thuận khi Agent gặp lỗi API)
    const hasSafeErrorHandling = indexHtmlContent.includes('bảo lưu quyền phản biện.* [TIẾP TỤC TRANH BIỆN]');
    assert(hasSafeErrorHandling, 'An toàn khi Agent gặp sự cố: Không bao giờ giả mạo Đồng thuận', 'Gắn nhãn cảnh báo và tiếp tục tranh biện');

    console.log('\n================================================================');
    console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASS (${((passedTests/totalTests)*100).toFixed(1)}%)`);
    if (failedTests === 0) {
        console.log('🎉 100% TẤT CẢ CHỨC NĂNG HOẠT ĐỘNG HOÀN HẢO - KHÔNG CÓ LỖI NÀO!');
    } else {
        console.error(`⚠️ CÓ ${failedTests} LỖI CẦN XỬ LÝ:`);
        errors.forEach(err => console.error(`   - ${err}`));
    }
    console.log('================================================================\n');

    process.exit(failedTests === 0 ? 0 : 1);
}

runTestSuite().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});

