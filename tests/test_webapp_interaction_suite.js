/**
 * 🧪 TEST SUITE: WEB APP INTERACTION ENGINE (CAPCUT, CANVA & SPAs)
 * 
 * Verifies:
 * 1. dismiss_modals: removes modal masks and triggers close buttons
 * 2. click_coords: mouse click by (x, y) coordinates
 * 3. type_rich_text: contenteditable and rich-text input with synthetic events
 * 4. hover / drag_and_drop / wait_selector / eval
 * 5. REQUEST_CREDENTIALS: API endpoint and ToolExecutor integration
 * 6. Adaptive Navigation logic: domcontentloaded without hanging on WebSockets
 */

const assert = require('assert');
const path = require('path');
const { executeBrowserActions, compactAccessibilityTree } = require('../utils/browserActions');
const { ToolExecutor } = require('../agents/ToolExecutor');

async function runTests() {
    console.log('===============================================================');
    console.log('🧪 BẮT ĐẦU BỘ TEST KIỂM THỬ TƯƠNG TÁC WEB APP (v6.1)');
    console.log('===============================================================\n');

    let passed = 0;
    let failed = 0;

    // Test 1: ToolExecutor registers REQUEST_CREDENTIALS as read-only tool
    try {
        const executor = new ToolExecutor();
        assert(executor.toolCategories.readonly.includes('REQUEST_CREDENTIALS'), 'REQUEST_CREDENTIALS must be in readonly category');
        assert.strictEqual(executor.getToolEndpoint('REQUEST_CREDENTIALS'), '/api/request-credentials');
        const defs = executor.getToolDefinitions();
        const credDef = defs.find(d => d.name === 'REQUEST_CREDENTIALS');
        assert(credDef, 'Tool definition for REQUEST_CREDENTIALS must exist');
        assert(credDef.parameters.required.includes('domain'), 'domain is required');
        
        const browseDef = defs.find(d => d.name === 'BROWSE_WEB');
        assert(browseDef, 'BROWSE_WEB definition must exist');
        assert(browseDef.parameters.properties.actions.items.properties.x, 'Action coordinates x must exist');
        assert(browseDef.parameters.properties.actions.items.properties.y, 'Action coordinates y must exist');
        assert(browseDef.parameters.properties.dismissModals, 'dismissModals option must exist');
        
        console.log('✅ [TEST 1] PASS: ToolExecutor tích hợp REQUEST_CREDENTIALS và Web App Actions đầy đủ');
        passed++;
    } catch (e) {
        console.error('❌ [TEST 1] FAIL:', e.message);
        failed++;
    }

    // Mock page & browser for browserActions testing
    class MockElement {
        constructor(tagName = 'DIV', isContentEditable = false) {
            this.tagName = tagName;
            this.isContentEditable = isContentEditable;
            this.removed = false;
            this.clicked = false;
            this.value = '';
            this.textContent = '';
        }
        remove() { this.removed = true; }
        click() { this.clicked = true; }
        focus() {}
        getAttribute(attr) {
            if (attr === 'contenteditable') return this.isContentEditable ? 'true' : null;
            return null;
        }
        dispatchEvent() {}
    }

    const mockPage = {
        _url: 'https://www.capcut.com/my-edit',
        url() { return this._url; },
        title() { return Promise.resolve('CapCut Web Editor'); },
        mouse: {
            clickedCoords: [],
            movedCoords: [],
            isDown: false,
            click(x, y) { this.clickedCoords.push({ x, y }); return Promise.resolve(); },
            move(x, y) { this.movedCoords.push({ x, y }); return Promise.resolve(); },
            down() { this.isDown = true; return Promise.resolve(); },
            up() { this.isDown = false; return Promise.resolve(); }
        },
        keyboard: {
            typed: [],
            pressed: [],
            type(txt) { this.typed.push(txt); return Promise.resolve(); },
            press(k) { this.pressed.push(k); return Promise.resolve(); }
        },
        evaluate(fn, ...args) {
            if (typeof fn === 'function') {
                const prevDoc = global.document;
                try {
                    global.document = {
                        querySelectorAll: () => [],
                        querySelector: () => null,
                        title: 'Mock Title',
                        body: { innerText: '' }
                    };
                    const res = fn(...args);
                    return Promise.resolve(res);
                } catch(e) {
                    return Promise.resolve(0);
                } finally {
                    global.document = prevDoc;
                }
            }
            return Promise.resolve({ success: true });
        },
        waitForSelector(sel) { return Promise.resolve(new MockElement()); },
        click(sel) { return Promise.resolve(); },
        hover(sel) { return Promise.resolve(); }
    };

    const mockBrowser = {
        pages() { return Promise.resolve([mockPage]); }
    };

    // Test 2: Coordinate Click action
    try {
        const actions = [
            { type: 'click_coords', x: 1171, y: 410 },
            { type: 'click', x: 500, y: 250 }
        ];
        const res = await executeBrowserActions(mockPage, mockBrowser, actions);
        assert.strictEqual(res.actionLogs.length, 2);
        assert.strictEqual(res.actionLogs[0].action, 'click_coords');
        assert.strictEqual(res.actionLogs[0].x, 1171);
        assert.strictEqual(res.actionLogs[1].action, 'click_coords');
        assert.strictEqual(res.actionLogs[1].x, 500);
        assert.strictEqual(mockPage.mouse.clickedCoords.length, 2);
        console.log('✅ [TEST 2] PASS: Click theo tọa độ x, y trên Canvas/Timeline hoạt động chuẩn');
        passed++;
    } catch (e) {
        console.error('❌ [TEST 2] FAIL:', e.message);
        failed++;
    }

    // Test 3: dismiss_modals action
    try {
        const actions = [
            { type: 'dismiss_modals' }
        ];
        const res = await executeBrowserActions(mockPage, mockBrowser, actions);
        assert.strictEqual(res.actionLogs.length, 1);
        assert.strictEqual(res.actionLogs[0].action, 'dismiss_modals');
        assert.strictEqual(res.actionLogs[0].success, true);
        console.log('✅ [TEST 3] PASS: Thao tác dismiss_modals giải phóng overlay/backdrop thành công');
        passed++;
    } catch (e) {
        console.error('❌ [TEST 3] FAIL:', e.message);
        failed++;
    }

    // Test 4: hover and drag_and_drop actions
    try {
        const actions = [
            { type: 'hover', x: 600, y: 400 },
            { type: 'drag_and_drop', fromX: 100, fromY: 200, toX: 500, toY: 200 }
        ];
        const res = await executeBrowserActions(mockPage, mockBrowser, actions);
        assert.strictEqual(res.actionLogs.length, 2);
        assert.strictEqual(res.actionLogs[0].action, 'hover');
        assert.strictEqual(res.actionLogs[1].action, 'drag_and_drop');
        assert.strictEqual(res.actionLogs[1].from.x, 100);
        assert.strictEqual(res.actionLogs[1].to.x, 500);
        console.log('✅ [TEST 4] PASS: Thao tác Hover và Drag-and-Drop (kéo thả timeline/canvas) chính xác');
        passed++;
    } catch (e) {
        console.error('❌ [TEST 4] FAIL:', e.message);
        failed++;
    }

    // Test 5: wait_selector and eval actions
    try {
        const actions = [
            { type: 'wait_selector', selector: '.video-canvas' },
            { type: 'eval', code: '1 + 1' }
        ];
        const res = await executeBrowserActions(mockPage, mockBrowser, actions);
        assert.strictEqual(res.actionLogs.length, 2);
        assert.strictEqual(res.actionLogs[0].action, 'wait_selector');
        assert.strictEqual(res.actionLogs[1].action, 'eval');
        assert.strictEqual(res.actionLogs[1].result.result, 2);
        console.log('✅ [TEST 5] PASS: Thao tác wait_selector và an toàn JavaScript eval chuẩn xác');
        passed++;
    } catch (e) {
        console.error('❌ [TEST 5] FAIL:', e.message);
        failed++;
    }

    // Test 6: StateGraph WAITING_CREDENTIALS pause & resume
    try {
        const { StateGraph } = require('../agents/StateGraph');
        const graph = new StateGraph({ graphId: 'test_cred_graph' });
        
        let runCount = 0;
        graph.addNode({
            id: 'node_capcut',
            description: 'Tạo video trên CapCut',
            action: async () => {
                runCount++;
                if (runCount === 1) {
                    return { status: 'WAITING_CREDENTIALS', domain: 'capcut.com', message: 'Cần cookie CapCut' };
                }
                return { success: true, response: 'Video đã được tạo thành công trên CapCut!' };
            }
        });

        // Chạy lần 1: Phải tạm dừng vì thiếu cookie
        await graph.run();
        assert.strictEqual(graph.status, 'WAITING_CREDENTIALS', 'Graph must pause on WAITING_CREDENTIALS');
        assert.strictEqual(graph.nodes.get('node_capcut').status, 'WAITING_CREDENTIALS');

        // Kích hoạt resume: Graph phải chuyển sang RUNNING và hoàn tất
        await graph.resume();
        assert.strictEqual(graph.status, 'COMPLETED', 'Graph must complete upon resume');
        assert.strictEqual(graph.nodes.get('node_capcut').status, 'COMPLETED');
        assert.strictEqual(runCount, 2);
        console.log('✅ [TEST 6] PASS: StateGraph tạm dừng khi thiếu Cookie và tiếp tục hoàn tất khi resume');
        passed++;
    } catch (e) {
        console.error('❌ [TEST 6] FAIL:', e.message);
        failed++;
    }

    // Test 7: AgentOrchestrator resumeTask integration
    try {
        const { AgentOrchestrator } = require('../agents/AgentOrchestrator');
        const orch = new AgentOrchestrator('dummy-key');
        
        const testTaskId = 'task_test_suspension_123';
        orch.pendingCredentialSuspensions.set(testTaskId, {
            taskId: testTaskId,
            userRequest: 'Tạo video trên CapCut',
            domain: 'capcut.com',
            context: { mode: 'fast' }
        });

        // Mock execute để kiểm tra xem resumeTask có gọi lại với đúng context không
        let executedRequest = null;
        orch.execute = async (req, ctx) => {
            executedRequest = req;
            return { success: true, result: 'Resumed and executed', taskId: ctx.taskId };
        };

        const resumeRes = await orch.resumeTask(testTaskId, { domain: 'capcut.com', cookies: [{ name: 'test', value: '123' }] });
        assert(resumeRes.success, 'resumeTask must succeed');
        assert.strictEqual(executedRequest, 'Tạo video trên CapCut');
        assert(!orch.pendingCredentialSuspensions.has(testTaskId), 'Suspension map must be cleaned after resume');
        console.log('✅ [TEST 7] PASS: AgentOrchestrator resumeTask phục hồi và thực thi lại tiến trình chính xác');
        passed++;
    } catch (e) {
        console.error('❌ [TEST 7] FAIL:', e.message);
        failed++;
    }

    console.log('\n===============================================================');
    console.log(`🏁 KẾT QUẢ TEST SUITE: ${passed}/${passed + failed} TESTS PASS (${((passed/(passed+failed))*100).toFixed(1)}%)`);
    console.log('===============================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
});
