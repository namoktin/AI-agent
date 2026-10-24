/**
 * test_audit_fixes.js - Kiểm Thử Toàn Diện 3 Điểm Nâng Cấp Kiến Trúc (Fixes for Audit A, B, C)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { IndependentVerifier } = require('./agents/IndependentVerifier');
const { SkillLibrary } = require('./agents/SkillLibrary');
const { AdaptivePlanner } = require('./agents/AdaptivePlanner');
const { AgentOrchestrator } = require('./agents/AgentOrchestrator');

let passCount = 0;
let failCount = 0;

function it(name, fn) {
    return (async () => {
        try {
            await fn();
            console.log(`  ✅ [PASS] ${name}`);
            passCount++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
            failCount++;
        }
    })();
}

async function runTests() {
    console.log('===============================================================');
    console.log('🧪 BẮT ĐẦU KIỂM THỬ ĐỘC LẬP 3 VÙNG SỬA ĐỔI KIẾN TRÚC (A, B, C)');
    console.log('===============================================================\n');

    const cwd = process.cwd();
    const verifier = new IndependentVerifier(cwd);
    const skillLib = new SkillLibrary(cwd);
    const planner = new AdaptivePlanner();

    // -------------------------------------------------------------
    // NHÓM 1: KIỂM THỬ ĐIỂM B (VERIFIER DOI CHUẨN XÁC & KHÁNG DOI GIẢ)
    // -------------------------------------------------------------
    console.log('--- PHẦN 1: VERIFIER ĐỐI CHIẾU DOI THẬT VS DOI GIẢ & LUẬN ĐIỂM ---');

    await it('Verifier xác thực thành công DOI thật (10.1038/s41586-020-2056-8) và đối chiếu luận điểm', async () => {
        const specialistResults = [
            {
                agent: 'researcher',
                success: true,
                response: 'Nghiên cứu về tế bào T trong đáp ứng lâm sàng miễn dịch ung thư. DOI: 10.1038/s41586-020-2056-8. Tỷ lệ đáp ứng tăng 45% ở 120 bệnh nhân.'
            }
        ];
        const res = await verifier.verifyResearchClaims(specialistResults);
        assert.strictEqual(res.passed, true, 'DOI thật và có số liệu định lượng phải được pass');
        assert.ok(res.details.includes('Live verified') || res.details.includes('Xác thực định dạng'), 'Phải có chứng cứ xác minh');
    });

    await it('Verifier bắt lỗi và từ chối DOI giả mạo hoặc không có nguồn', async () => {
        const specialistResults = [
            {
                agent: 'researcher',
                success: true,
                response: 'Nghiên cứu này không có nguồn kiểm chứng nào, chỉ là lời nói chung chung.'
            }
        ];
        const res = await verifier.verifyResearchClaims(specialistResults);
        assert.strictEqual(res.passed, false, 'Không có DOI/URL/số liệu phải bị từ chối');
    });

    // -------------------------------------------------------------
    // NHÓM 2: KIỂM THỬ ĐIỂM C (VÒNG LẶP PHỤC HỒI & HỌC KỸ NĂNG)
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 2: RECOVERY RESUMPTION & SKILL STATS RECORDING ---');

    await it('AdaptivePlanner cập nhật đúng dependencies khi replan()', async () => {
        const originalPlan = {
            tasks: [
                { id: 'T001', description: 'Tải dữ liệu', assignedTo: 'developer' },
                { id: 'T002', description: 'Phân tích dữ liệu', dependencies: ['T001'], assignedTo: 'developer' }
            ]
        };
        const replanned = planner.replan(originalPlan.tasks[0], 'Network timeout', originalPlan, 'Yêu cầu');
        const recoveryTask = replanned.tasks.find(t => t.isRecovery);
        assert.ok(recoveryTask, 'Phải sinh ra recovery task');

        const dependentTask = replanned.tasks.find(t => t.id === 'T002');
        assert.ok(dependentTask, 'Task T002 phải được giữ lại');
        assert.deepStrictEqual(dependentTask.dependencies, [recoveryTask.id], 'T002 phải chuyển sang phụ thuộc vào recovery task');
    });

    await it('SkillLibrary.recordExecution() cập nhật chính xác executionCount và successRate', async () => {
        const testSkillId = `test_skill_${Date.now()}`;
        const testSkill = {
            id: testSkillId,
            name: 'Test Skill Verification',
            description: 'Temporary skill for testing recordExecution',
            actionGraph: [{ tool: 'READ_FILE', args: {} }],
            verified: true,
            successRate: 1.0
        };
        skillLib.saveProceduralSkill(testSkill);

        // Ghi nhận 1 lần thành công
        const ok1 = skillLib.recordExecution(testSkillId, true);
        assert.strictEqual(ok1, true, 'Ghi nhận lần 1 phải thành công');

        // Ghi nhận 1 lần thất bại
        const ok2 = skillLib.recordExecution(testSkillId, false);
        assert.strictEqual(ok2, true, 'Ghi nhận lần 2 phải thành công');

        // Đọc lại file skill
        const skillFile = path.join(skillLib.skillsDir, `${testSkillId}.json`);
        const saved = JSON.parse(fs.readFileSync(skillFile, 'utf8'));
        assert.strictEqual(saved.executionCount, 3, 'Tổng số lượt chạy phải là 3 (1 khởi tạo + 2 lần ghi nhận)');
        assert.strictEqual(saved.successCount, 2, 'Số lượt thành công phải là 2 (1 khởi tạo + 1 lần sau)');
        assert.strictEqual(saved.failureCount, 1, 'Số lượt thất bại phải là 1');
        assert.strictEqual(saved.successRate, 0.67, 'Tỷ lệ thành công phải là 67%');

        // Dọn dẹp file test
        fs.unlinkSync(skillFile);
    });

    // -------------------------------------------------------------
    // NHÓM 3: KIỂM THỬ ĐIỂM A (TÍN HIỆU SUCCESS: TRUE TRUNG THỰC)
    // -------------------------------------------------------------
    console.log('\n--- PHẦN 3: TÍN HIỆU THÀNH CÔNG TRUNG THỰC & KHÔNG BÁO ẢO ---');

    await it('Verifier verifyFastResponse từ chối phản hồi rỗng hoặc từ chối câu hỏi', async () => {
        const badResult = { success: true, response: 'Tôi không thể trả lời câu hỏi này vì quá khó.' };
        const check = verifier.verifyFastResponse('Câu hỏi', badResult);
        assert.strictEqual(check.verified, false, 'Câu trả lời từ chối phải bị đánh dấu verified = false');
        assert.ok(check.qualityScore < 75, 'Điểm chất lượng phải dưới ngưỡng');
    });

    await it('Verifier verifyPhysicalFile bắt chính xác file không tồn tại hoặc rỗng', async () => {
        const nonExistent = path.join(cwd, 'non_existent_file_xyz_123.txt');
        const check = verifier.verifyPhysicalFile(nonExistent);
        assert.strictEqual(check.passed, false, 'File không tồn tại phải trả về passed = false');
    });

    console.log('\n===============================================================');
    console.log(`📊 KẾT QUẢ KIỂM THỬ ĐỘC LẬP: ${passCount}/${passCount + failCount} TESTS PASS (${((passCount / (passCount + failCount)) * 100).toFixed(1)}%)`);
    console.log('===============================================================');

    if (failCount > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Lỗi kiểm thử:', err);
    process.exit(1);
});
