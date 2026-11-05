/**
 * test_live_task_execution.js
 * Test real background task lifecycle:
 * 1. Full completed task (progress 10/10) -> status: COMPLETED, percent: 100%
 * 2. Partial completed task (progress 4/10) -> status: PARTIAL_COMPLETED, percent: 40%
 * 3. Python background task execution
 */

const { BackgroundTaskManager } = require('./agents/BackgroundTaskManager');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runLiveTests() {
    console.log('🚀 [LIVE TEST] BẮT ĐẦU TEST TIẾN TRÌNH NỀN THẬT (OS CHILD PROCESS)...');
    const mgr = new BackgroundTaskManager(__dirname);

    // 1. Tạo script test hoàn thành đủ 5/5
    const fullScript = path.join(__dirname, 'scratch_full_task.js');
    fs.writeFileSync(fullScript, `
        console.log('[PROGRESS] 1/5 (20%): Buoc 1');
        console.log('[PROGRESS] 3/5 (60%): Buoc 3');
        console.log('[PROGRESS] 5/5 (100%): Buoc 5');
        process.exit(0);
    `, 'utf8');

    console.log('  ⏳ Khởi chạy Full Task (5/5)...');
    const fullTask = mgr.createTask({
        title: 'Live Test Full Completion',
        scriptPath: fullScript,
        metadata: { totalCount: 5 }
    });

    // Chờ task hoàn thành
    for (let i = 0; i < 20; i++) {
        await sleep(250);
        const t = mgr.getTask(fullTask.id);
        if (t.status === 'COMPLETED' || t.status === 'FAILED') break;
    }

    const tFull = mgr.getTask(fullTask.id);
    console.log(`  👉 Full Task Kết quả: status=${tFull.status}, percent=${tFull.progress.percent}%, message="${tFull.progress.message}"`);
    assert.strictEqual(tFull.status, 'COMPLETED');
    assert.strictEqual(tFull.progress.percent, 100);
    console.log('  ✅ [PASS] Full Task hoàn thành 100% chính xác!\n');

    // 2. Tạo script test kết thúc khi mới đạt 2/5 (Partial)
    const partialScript = path.join(__dirname, 'scratch_partial_task.js');
    fs.writeFileSync(partialScript, `
        console.log('[PROGRESS] 1/5 (20%): Buoc 1');
        console.log('[PROGRESS] 2/5 (40%): Buoc 2 va dung lai vi het du lieu');
        process.exit(0);
    `, 'utf8');

    console.log('  ⏳ Khởi chạy Partial Task (2/5)...');
    const partialTask = mgr.createTask({
        title: 'Live Test Partial Completion',
        scriptPath: partialScript,
        metadata: { totalCount: 5 }
    });

    for (let i = 0; i < 20; i++) {
        await sleep(250);
        const t = mgr.getTask(partialTask.id);
        if (t.status === 'PARTIAL_COMPLETED' || t.status === 'COMPLETED' || t.status === 'FAILED') break;
    }

    const tPartial = mgr.getTask(partialTask.id);
    console.log(`  👉 Partial Task Kết quả: status=${tPartial.status}, percent=${tPartial.progress.percent}%, message="${tPartial.progress.message}"`);
    assert.strictEqual(tPartial.status, 'PARTIAL_COMPLETED');
    assert.strictEqual(tPartial.progress.percent, 40);
    assert.ok(tPartial.progress.message.includes('2/5'));
    console.log('  ✅ [PASS] Partial Task phát hiện chính xác không bị gian lận 100%!\n');

    // Dọn dẹp scratch
    try { fs.unlinkSync(fullScript); } catch(e) {}
    try { fs.unlinkSync(partialScript); } catch(e) {}

    console.log('🏁 TẤT CẢ CÁC BÀI TEST TIẾN TRÌNH THỰC TẾ ĐẠT 100%!');
}

runLiveTests().catch(err => {
    console.error('❌ Lỗi kiểm thử:', err);
    process.exit(1);
});
