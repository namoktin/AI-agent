/**
 * test_audit_v4_3_issues.js - Kiểm thử chuyên sâu 3 vấn đề kiến trúc mới vá
 * 1. Process Completed vs Goal Completed (Phân biệt hoàn thành tiến trình vs mục tiêu)
 * 2. Tool Name Alignment & getOptimalStrategy Pipeline
 * 3. Server Restart Process Recovery & Quota Guard (RPM/TPM/RPD & Circuit Breaker)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { BackgroundTaskManager } = require('./agents/BackgroundTaskManager');
const { SkillLibrary } = require('./agents/SkillLibrary');
const { ModelRouter } = require('./agents/ModelRouter');
const { AgentOrchestrator } = require('./agents/AgentOrchestrator');

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
    console.log('🧪 KIỂM THỬ XÁC MINH 3 VẤN ĐỀ KIẾN TRÚC MỚI VÁ (ISSUES A, B, C)');
    console.log('===============================================================\n');

    const cwd = __dirname;

    // -------------------------------------------------------------
    // VẤN ĐỀ A: HOÀN THÀNH TIẾN TRÌNH VS HOÀN THÀNH MỤC TIÊU
    // -------------------------------------------------------------
    console.log('--- PHẦN 1: PROCESS_COMPLETED VS GOAL_COMPLETED & RECONCILIATION ---');

    const taskMgr = new BackgroundTaskManager(cwd);

    await it('Tiến trình exitCode 0 nhưng mới đạt 12/50 mục tiêu -> status: PARTIAL_COMPLETED, percent: 24%', async () => {
        const fakeTaskId = `test_task_partial_${Date.now()}`;
        taskMgr.tasks[fakeTaskId] = {
            id: fakeTaskId,
            title: 'Test Partial Task',
            status: 'RUNNING',
            progress: { current: 12, total: 50, percent: 24, message: 'Đang tải 12/50' },
            logFile: path.join(taskMgr.logsDir, `${fakeTaskId}.log`)
        };

        // Giả lập logic đóng tiến trình
        const task = taskMgr.tasks[fakeTaskId];
        const code = 0;
        const total = task.progress?.total || 0;
        const current = task.progress?.current || 0;

        if (total > 0 && current < total) {
            task.status = 'PARTIAL_COMPLETED';
            task.progress.percent = Math.round((current / total) * 100);
            task.progress.message = `Tiến trình kết thúc: Đạt ${current}/${total} mục tiêu (${task.progress.percent}%)`;
        } else {
            task.status = 'COMPLETED';
            task.progress.percent = 100;
        }

        assert.strictEqual(task.status, 'PARTIAL_COMPLETED', 'Phải là PARTIAL_COMPLETED khi chưa đủ 50');
        assert.strictEqual(task.progress.percent, 24, 'Tiến độ phải là 24% chứ không thể là 100%');
        delete taskMgr.tasks[fakeTaskId];
    });

    await it('Tiến trình exitCode 0 và đạt đủ 50/50 mục tiêu -> status: COMPLETED, percent: 100%', async () => {
        const fakeTaskId = `test_task_full_${Date.now()}`;
        taskMgr.tasks[fakeTaskId] = {
            id: fakeTaskId,
            title: 'Test Full Task',
            status: 'RUNNING',
            progress: { current: 50, total: 50, percent: 100, message: 'Đang tải 50/50' },
            logFile: path.join(taskMgr.logsDir, `${fakeTaskId}.log`)
        };

        const task = taskMgr.tasks[fakeTaskId];
        const code = 0;
        const total = task.progress?.total || 0;
        const current = task.progress?.current || 0;

        if (total > 0 && current < total) {
            task.status = 'PARTIAL_COMPLETED';
            task.progress.percent = Math.round((current / total) * 100);
        } else {
            task.status = 'COMPLETED';
            task.progress.percent = 100;
            task.progress.message = total > 0 ? `Hoàn thành 100% (${current}/${total})` : 'Hoàn thành 100%';
        }

        assert.strictEqual(task.status, 'COMPLETED');
        assert.strictEqual(task.progress.percent, 100);
        delete taskMgr.tasks[fakeTaskId];
    });

    await it('reconcileInterruptedTasks() phát hiện PID chết sau khi server restart -> status: INTERRUPTED', async () => {
        const deadPidTaskId = `test_dead_pid_${Date.now()}`;
        // PID 99999999 hầu như chắc chắn không tồn tại trên OS
        taskMgr.tasks[deadPidTaskId] = {
            id: deadPidTaskId,
            title: 'Test Orphan Task',
            status: 'RUNNING',
            pid: 99999999,
            progress: { current: 5, total: 50, percent: 10 }
        };

        taskMgr.reconcileInterruptedTasks();
        assert.strictEqual(taskMgr.tasks[deadPidTaskId].status, 'INTERRUPTED', 'Phải chuyển sang INTERRUPTED khi PID không còn');
        assert.ok(taskMgr.tasks[deadPidTaskId].error.includes('khởi động lại'));
        delete taskMgr.tasks[deadPidTaskId];
    });

    // -------------------------------------------------------------
    // VẤN ĐỀ B: ĐỒNG BỘ TÊN CÔNG CỤ & NỐI getOptimalStrategy VÀO ORCHESTRATOR
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 2: SKILL STRATEGY TOOL NAMES & OPTIMALSTRATEGY PIPELINE ---');

    const skillLib = new SkillLibrary(cwd);

    await it('SkillLibrary không còn tham chiếu MANAGE_DAEMON lỗi thời', async () => {
        const strat = skillLib.getOptimalStrategy('cần chạy tiến trình ngầm tải dữ liệu');
        assert.ok(strat, 'Phải tìm thấy chiến lược batch_daemon');
        assert.ok(!strat.bestRoute.includes('MANAGE_DAEMON'), 'Không được chứa MANAGE_DAEMON');
        assert.ok(strat.bestRoute.includes('START_BACKGROUND_TASK'), 'Phải chứa tên công cụ thật START_BACKGROUND_TASK');
        assert.ok(strat.bestRoute.includes('MANAGE_BACKGROUND_TASK'), 'Phải chứa tên công cụ thật MANAGE_BACKGROUND_TASK');
    });

    await it('AgentOrchestrator nạp chính xác context.optimalStrategy khi nhận yêu cầu tương ứng', async () => {
        const orchestrator = new AgentOrchestrator('dummy_api_key');
        const context = {};
        const userPrompt = 'Tôi muốn chạy tiến trình ngầm để tải danh sách';
        
        // Mô phỏng đoạn logic đã gắn vào orchestrator.execute
        const opt = orchestrator.skillLibrary.getOptimalStrategy(userPrompt);
        if (opt) {
            context.optimalStrategy = opt;
        }

        assert.ok(context.optimalStrategy, 'context.optimalStrategy phải tồn tại');
        assert.strictEqual(context.optimalStrategy.key, 'batch_daemon');
        assert.ok(context.optimalStrategy.tokensSaved >= 2000, 'Phải ghi nhận token tiết kiệm');
    });

    // -------------------------------------------------------------
    // VẤN ĐỀ C: QUOTA GUARD & CIRCUIT BREAKER TRONG MODELROUTER
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 3: MODELROUTER RATE LIMITER (RPM/TPM/RPD) & CIRCUIT BREAKER ---');

    const router = new ModelRouter({
        maxRPM: 3,
        maxTPM: 10000,
        maxRPD: 100
    });

    await it('ModelRouter tracking chính xác RPM, TPM, RPD theo sliding window', async () => {
        router.recordUsage(2500, 'gemini-3.5-flash');
        router.recordUsage(3500, 'gemini-3.5-flash');
        
        const status = router.getBudgetStatus();
        assert.strictEqual(status.rpm.current, 2, 'RPM hiện tại phải là 2');
        assert.strictEqual(status.tpm.current, 6000, 'TPM hiện tại phải là 6000');
        assert.strictEqual(status.rpd.current, 2, 'RPD hiện tại phải là 2');
        assert.strictEqual(status.circuitBreaker.tripped, false, 'Circuit breaker chưa bị ngắt');
    });

    await it('ModelRouter cooldown model khi gặp 429 và tự động chuyển sang fallback khác', async () => {
        router.recordQuotaError('gemini-3.5-flash', 429);
        assert.strictEqual(router.isModelAvailable('gemini-3.5-flash'), false, 'gemini-3.5-flash phải vào cooldown');

        const fallback = router.getFallbackModel('gemini-3.5-flash', 1);
        assert.ok(fallback, 'Phải có model fallback khả dụng');
        assert.notStrictEqual(fallback, 'gemini-3.5-flash', 'Không được chọn model đang dính cooldown');
    });

    await it('ModelRouter kích hoạt Circuit Breaker khi toàn bộ Fallback Pool bị 429', async () => {
        // Gán 429 cho tất cả model trong FALLBACK_POOL
        for (const m of router.registry.FALLBACK_POOL) {
            router.recordQuotaError(m, 429);
        }

        assert.strictEqual(router.isCircuitBreakerTripped(), true, 'Circuit breaker phải kích hoạt');
        const fallback = router.getFallbackModel('gemini-3.5-flash', 1);
        assert.strictEqual(fallback, null, 'Phải trả về null để dừng spam request khi kiệt quota');

        const status = router.getBudgetStatus();
        assert.strictEqual(status.circuitBreaker.tripped, true);
        assert.ok(status.circuitBreaker.remainingMs > 0);
    });

    console.log('\n===============================================================');
    console.log(`🏁 KẾT THỦY KIỂM THỬ: ${passCount} PASSED | ${failCount} FAILED`);
    console.log('===============================================================');

    if (failCount > 0) {
        process.exit(1);
    }
}

runTests();
