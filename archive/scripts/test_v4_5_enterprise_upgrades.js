/**
 * test_v4_5_enterprise_upgrades.js - Kiểm thử toàn diện 4 trụ cột nâng cấp chuẩn 9.3+
 * 1. Proactive Quota-Aware Scheduler (Token Bucket & Concurrency Queue)
 * 2. Physical Acceptance Criteria Gatekeeper (Chống báo ảo bằng kiểm định file thật trên ổ cứng)
 * 3. Auto-Resume Checkpoint Engine (Tự động chạy tiếp khi server restart)
 * 4. Success-Rate Driven Strategy Selection & Contradiction Shield
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { ModelRouter } = require('./agents/ModelRouter');
const { BackgroundTaskManager } = require('./agents/BackgroundTaskManager');
const { SkillLibrary } = require('./agents/SkillLibrary');
const { IndependentVerifier } = require('./agents/IndependentVerifier');

let passCount = 0;
let failCount = 0;

async function it(name, fn) {
    try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
        failCount++;
    }
}

async function runTests() {
    console.log('===============================================================');
    console.log('🚀 KIỂM THỬ ĐỘC LẬP 4 TRỤ CỘT NÂNG CẤP V4.5 ENTERPRISE (9.3+)');
    console.log('===============================================================\n');

    const cwd = __dirname;

    // -------------------------------------------------------------
    // TRỤ CỘT 1: PROACTIVE QUOTA-AWARE SCHEDULER
    // -------------------------------------------------------------
    console.log('--- 1. PROACTIVE QUOTA SCHEDULER (TOKEN BUCKET & INFLIGHT QUEUE) ---');

    const scheduler = new ModelRouter({
        maxRPM: 10,
        maxTPM: 50000,
        maxInflight: 2
    });

    await it('Scheduler cấp phát tức thì cho 2 request đầu tiên trong ngưỡng inflight', async () => {
        const slot1 = await scheduler.acquireDispatchSlot({ estimatedTokens: 1000, priority: 1 });
        const slot2 = await scheduler.acquireDispatchSlot({ estimatedTokens: 1000, priority: 2 });

        assert.strictEqual(slot1.immediate, true, 'Slot 1 phải được cấp ngay');
        assert.strictEqual(slot2.immediate, true, 'Slot 2 phải được cấp ngay');
        assert.strictEqual(scheduler.inflightRequests, 2, 'Inflight phải là 2');
    });

    await it('Scheduler tự động xếp hàng đợi (Queue) khi chạm ngưỡng inflight tối đa', async () => {
        let slot3Granted = false;

        // Slot 3 bị chặn và đưa vào hàng đợi
        const slot3Promise = scheduler.acquireDispatchSlot({ estimatedTokens: 1000, priority: 3 }).then(s => {
            slot3Granted = true;
            return s;
        });

        assert.strictEqual(slot3Granted, false, 'Slot 3 không được cấp ngay vì đã đầy 2 inflight');
        assert.strictEqual(scheduler.dispatchQueue.length, 1, 'Hàng đợi phải có 1 request chờ');

        // Giải phóng Slot 1
        scheduler.releaseDispatchSlot(800, 'gemini-3.5-flash');

        const s3 = await slot3Promise;
        assert.strictEqual(slot3Granted, true, 'Slot 3 phải được cấp ngay sau khi Slot 1 giải phóng');
        assert.strictEqual(s3.granted, true);

        // Dọn dẹp các slot còn lại
        scheduler.releaseDispatchSlot(800, 'gemini-3.5-flash');
        scheduler.releaseDispatchSlot(800, 'gemini-3.5-flash');
        assert.strictEqual(scheduler.inflightRequests, 0);
    });

    // -------------------------------------------------------------
    // TRỤ CỘT 2: PHYSICAL ACCEPTANCE CRITERIA GATEKEEPER
    // -------------------------------------------------------------
    console.log('\n--- 2. PHYSICAL ACCEPTANCE CRITERIA GATE (CHỐNG BÁO ẢO 100%) ---');

    const taskMgr = new BackgroundTaskManager(cwd);

    await it('Từ chối COMPLETED và chuyển sang PARTIAL_COMPLETED nếu tệp bắt buộc không tồn tại', async () => {
        const fakeTask = {
            id: `test_fake_report_${Date.now()}`,
            title: 'Generate Annual Financial Report',
            status: 'RUNNING',
            progress: { current: 100, total: 100, percent: 100 },
            workDir: cwd,
            metadata: {
                expectedFiles: ['non_existent_financial_report_xyz123.csv']
            }
        };

        const audit = taskMgr.verifyAcceptanceCriteria(fakeTask);
        assert.strictEqual(audit.passed, false, 'Phải không đạt nghiệm thu khi thiếu file');
        assert.ok(audit.reason.includes('Thiếu tệp nghiệm thu'));
    });

    await it('Chấp thuận COMPLETED 100% khi tệp đầu ra vật lý tồn tại và có dung lượng > 0', async () => {
        const testArtifact = path.join(cwd, 'test_verified_artifact.json');
        fs.writeFileSync(testArtifact, JSON.stringify({ verified: true, count: 50 }), 'utf8');

        const realTask = {
            id: `test_real_task_${Date.now()}`,
            title: 'Export Verified JSON Data',
            status: 'RUNNING',
            progress: { current: 1, total: 1, percent: 100 },
            workDir: cwd,
            metadata: {
                expectedFiles: ['test_verified_artifact.json']
            }
        };

        const audit = taskMgr.verifyAcceptanceCriteria(realTask);
        assert.strictEqual(audit.passed, true, 'Phải đạt nghiệm thu khi file tồn tại thực tế');
        assert.strictEqual(audit.missingArtifacts.length, 0);

        try { fs.unlinkSync(testArtifact); } catch(e) {}
    });

    // -------------------------------------------------------------
    // TRỤ CỘT 3: AUTO-RESUME CHECKPOINT ENGINE
    // -------------------------------------------------------------
    console.log('\n--- 3. AUTO-RESUME CHECKPOINT RECOVERY ENGINE ---');

    await it('BackgroundTaskManager tự động phục hồi task bị ngắt nếu có cấu hình autoResume', async () => {
        const autoTaskId = `test_autoresume_${Date.now()}`;
        taskMgr.tasks[autoTaskId] = {
            id: autoTaskId,
            title: 'Big Data Pipeline with Auto-Resume',
            status: 'RUNNING',
            pid: 99999999, // PID chết
            command: 'node -e "console.log(1)"',
            progress: { current: 10, total: 100, percent: 10 },
            metadata: { autoResume: true }
        };

        // Khi server restart, quét phát hiện PID chết và tự động resume
        taskMgr.reconcileInterruptedTasks();
        const t = taskMgr.getTask(autoTaskId);
        assert.ok(t.resumeCount >= 1, 'resumeCount phải tăng lên ít nhất 1');
        assert.ok(t.status === 'RUNNING' || t.status === 'QUEUED', 'Task phải được chuyển lại sang QUEUED/RUNNING');

        taskMgr.cancelTask(autoTaskId);
        delete taskMgr.tasks[autoTaskId];
    });

    // -------------------------------------------------------------
    // TRỤ CỘT 4: SUCCESS-RATE DRIVEN STRATEGY SELECTION & CONTRADICTION SHIELD
    // -------------------------------------------------------------
    console.log('\n--- 4. SUCCESS-RATE STRATEGY SELECTION & CONTRADICTION SHIELD ---');

    const skillLib = new SkillLibrary(cwd);

    await it('SkillLibrary ưu tiên chiến lược có tỷ lệ thành công (SuccessRate) cao hơn', async () => {
        // Cập nhật thử tỷ lệ thành công
        skillLib.recordStrategyOutcome('batch_daemon', true);
        skillLib.recordStrategyOutcome('batch_daemon', true);

        const optimal = skillLib.getOptimalStrategy('cần tiến trình ngầm chạy dữ liệu');
        assert.ok(optimal, 'Phải tìm thấy chiến lược');
        assert.strictEqual(optimal.key, 'batch_daemon');
        assert.ok(optimal.rankScore > 90, 'RankScore phải cao dựa trên success rate');
    });

    await it('IndependentVerifier chặn đứng bài báo/luận điểm có dấu hiệu thu hồi (Retracted/Contradicted)', async () => {
        const verifier = new IndependentVerifier(cwd);
        const badClaim = [
            {
                agent: 'researcher',
                success: true,
                response: 'Nghiên cứu về vắc xin này đã bị bác bỏ hoàn toàn và bị rút lại (retracted article). DOI: 10.1038/s41586-020-2056-8. Tỷ lệ 50% ở 100 người.'
            }
        ];

        const audit = await verifier.verifyResearchClaims(badClaim);
        assert.strictEqual(audit.passed, false, 'Bài báo có dấu hiệu retracted/bác bỏ phải bị từ chối');
        assert.ok(audit.details.includes('mâu thuẫn') || audit.details.includes('rút lại') || audit.details.includes('Retracted'));
    });

    console.log('\n===============================================================');
    console.log(`🏁 KẾT THÚC KIỂM THỬ 4 TRỤ CỘT V4.5: ${passCount} PASSED | ${failCount} FAILED`);
    console.log('===============================================================');

    if (failCount > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Lỗi ngoại lệ:', err);
    process.exit(1);
});
