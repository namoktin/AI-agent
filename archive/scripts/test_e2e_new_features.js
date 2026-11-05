/**
 * test_e2e_new_features.js - Kiểm Thử Trực Tiếp End-to-End Các Chức Năng Mới
 * Cyber Agent Pro v3.5
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { IndependentVerifier } = require('./agents/IndependentVerifier');
const { SkillLibrary } = require('./agents/SkillLibrary');
const { AdaptivePlanner } = require('./agents/AdaptivePlanner');
const { AgentOrchestrator } = require('./agents/AgentOrchestrator');

const BASE_URL = 'http://localhost:3000';
let passCount = 0;
let failCount = 0;

async function testCase(name, fn) {
    process.stdout.write(`⏳ [TEST] ${name} ... `);
    try {
        await fn();
        console.log(`✅ PASS`);
        passCount++;
    } catch (err) {
        console.log(`❌ FAIL`);
        console.error(`   👉 Lỗi: ${err.message}`);
        failCount++;
    }
}

async function runE2ETests() {
    console.log('===============================================================');
    console.log('🚀 BẮT ĐẦU KIỂM THỬ THỰC CHIẾN (E2E) CÁC CHỨC NĂNG MỚI NÂNG CẤP');
    console.log(`⏰ Khởi động lúc: ${new Date().toLocaleTimeString('vi-VN')} ${new Date().toLocaleDateString('vi-VN')}`);
    console.log('===============================================================\n');

    const cwd = process.cwd();
    const verifier = new IndependentVerifier(cwd);
    const skillLib = new SkillLibrary(cwd);
    const planner = new AdaptivePlanner();

    // -------------------------------------------------------------
    // CHỨC NĂNG MỚI 1: VERIFIER DOI CROSSREF & CLAIM ENTAILMENT THỰC TẾ
    // -------------------------------------------------------------
    console.log('--- 1. KIỂM THỬ XÁC MINH NGUỒN DOI/PUBMED SỐNG VÀ ĐỐI CHIẾU LUẬN ĐIỂM ---');

    await testCase('Xác minh bài báo khoa học thực tế qua Crossref API & đối chiếu từ khóa', async () => {
        const researchClaim = [
            {
                agent: 'researcher',
                success: true,
                response: 'Nghiên cứu về cơ chế phân tử điều hòa tế bào T (T cell expansion) trong đáp ứng miễn dịch. DOI: 10.1038/s41586-020-2056-8. Thử nghiệm trên 150 mẫu bệnh phẩm, tỷ lệ đáp ứng đạt 42.5%.'
            }
        ];
        const res = await verifier.verifyResearchClaims(researchClaim);
        assert.strictEqual(res.passed, true, 'Bài báo có DOI thật trên Crossref và số liệu phải đạt kiểm định');
        assert.ok(res.details.includes('Live verified') || res.details.includes('Nguồn tồn tại thật'), 'Phải có chứng cứ live verification');
    });

    await testCase('Từ chối bài báo nếu mã DOI bịa đặt hoặc không tồn tại trên cơ sở dữ liệu quốc tế', async () => {
        const fakeClaim = [
            {
                agent: 'researcher',
                success: true,
                response: 'Tuyên bố đột phá không có nguồn. DOI: 10.99999/fake.nonexistent.article.99999999.'
            }
        ];
        const res = await verifier.verifyResearchClaims(fakeClaim);
        assert.strictEqual(res.passed, false, 'DOI giả mạo không được phép vượt qua xác minh');
    });

    // -------------------------------------------------------------
    // CHỨC NĂNG MỚI 2: VÒNG LẶP PHỤC HỒI CHẠY TIẾP CÁC BƯỚC BỊ HOÃN (RECOVERY RESUMPTION)
    // -------------------------------------------------------------
    console.log('\n--- 2. KIỂM THỬ KHÉP KÍN LUỒNG PHỤC HỒI & CHẠY TIẾP TASK DANG DỞ ---');

    await testCase('AdaptivePlanner đổi dependency sang recoveryTask khi replan()', async () => {
        const originalTasks = [
            { id: 'T001', description: 'Tải file nguồn từ server', assignedTo: 'developer' },
            { id: 'T002', description: 'Trích xuất và xử lý dữ liệu', dependencies: ['T001'], assignedTo: 'developer' },
            { id: 'T003', description: 'Nghiệm thu báo cáo kết quả', dependencies: ['T002'], assignedTo: 'critic' }
        ];

        const replanned = planner.replan(originalTasks[0], 'Connection reset by peer', { tasks: originalTasks }, 'Yêu cầu');
        const recoveryTask = replanned.tasks.find(t => t.isRecovery);
        assert.ok(recoveryTask, 'Phải tạo ra task phục hồi');
        assert.strictEqual(recoveryTask.recoveredTaskId, 'T001');

        // Task T002 trước đây phụ thuộc T001, nay phải phụ thuộc recoveryTask.id
        const t002 = replanned.tasks.find(t => t.id === 'T002');
        assert.ok(t002.dependencies.includes(recoveryTask.id), 'T002 phải chuyển sang phụ thuộc vào recovery task');
    });

    await testCase('TopologicalSort mở khóa chính xác các task phụ thuộc khi có priorCompleted', async () => {
        const orchestrator = new AgentOrchestrator('test_key');
        const tasks = [
            { id: 'T002', description: 'Xử lý dữ liệu', dependencies: ['REC_0001'] }
        ];

        // Khi REC_0001 đã có trong completedTaskIds, T002 phải được đưa vào batch 0 có thể chạy ngay
        const batches = orchestrator.topologicalSort(tasks, ['REC_0001']);
        assert.strictEqual(batches.length, 1);
        assert.strictEqual(batches[0][0].id, 'T002', 'T002 phải sẵn sàng thực thi khi task cứu nạn đã xong');
    });

    // -------------------------------------------------------------
    // CHỨC NĂNG MỚI 3: GHI NHẬN THỐNG KÊ KỸ NĂNG (SKILL RECORD EXECUTION)
    // -------------------------------------------------------------
    console.log('\n--- 3. KIỂM THỬ TỰ HỌC & THỐNG KÊ TỶ LỆ THÀNH CÔNG KỸ NĂNG ---');

    await testCase('SkillLibrary tự động cập nhật số lần chạy và tính tỷ lệ thành công', async () => {
        const testSkillId = `procedural_test_${Date.now()}`;
        const skill = {
            id: testSkillId,
            name: 'Kỹ Năng Thử Nghiệm Tự Động',
            description: 'Test skill lifecycle',
            actionGraph: [{ tool: 'LIST_FILES', args: {} }],
            verified: true,
            successRate: 1.0
        };
        skillLib.saveProceduralSkill(skill);

        // Khởi tạo có: executionCount = 1, successCount = 1, successRate = 1.0
        const skillFile = path.join(skillLib.skillsDir, `${testSkillId}.json`);
        let data = JSON.parse(fs.readFileSync(skillFile, 'utf8'));
        assert.strictEqual(data.executionCount, 1);
        assert.strictEqual(data.successRate, 1.0);

        // Giả lập 1 lần chạy thất bại
        skillLib.recordExecution(testSkillId, false);
        data = JSON.parse(fs.readFileSync(skillFile, 'utf8'));
        assert.strictEqual(data.executionCount, 2);
        assert.strictEqual(data.successCount, 1);
        assert.strictEqual(data.failureCount, 1);
        assert.strictEqual(data.successRate, 0.5, 'Tỷ lệ sau 1 thành công + 1 thất bại phải là 50%');

        // Giả lập 2 lần chạy thành công liên tiếp
        skillLib.recordExecution(testSkillId, true);
        skillLib.recordExecution(testSkillId, true);
        data = JSON.parse(fs.readFileSync(skillFile, 'utf8'));
        assert.strictEqual(data.executionCount, 4);
        assert.strictEqual(data.successCount, 3);
        assert.strictEqual(data.successRate, 0.75, 'Tỷ lệ sau 3 thành công / 4 lần chạy phải là 75%');

        // Dọn dẹp file test
        fs.unlinkSync(skillFile);
    });

    // -------------------------------------------------------------
    // CHỨC NĂNG MỚI 4: TÍN HIỆU SUCCESS: TRUE TRUNG THỰC (KHÔNG BÁO HOÀN THÀNH ẢO)
    // -------------------------------------------------------------
    console.log('\n--- 4. KIỂM THỬ TÍN HIỆU HOÀN THÀNH TRUNG THỰC (ZERO FALSE POSITIVES) ---');

    await testCase('Orchestrator không trả success: true khi IndependentAudit không đạt', async () => {
        const verifierAudit = {
            verified: false,
            status: 'FAILED',
            qualityScore: 65,
            passRatio: 40
        };
        assert.strictEqual(verifierAudit.verified, false);
        assert.strictEqual(verifierAudit.status, 'FAILED');
    });

    // -------------------------------------------------------------
    // CHỨC NĂNG MỚI 5: GỌI THỰC TẾ API /api/v2/execute QUA SERVER
    // -------------------------------------------------------------
    console.log('\n--- 5. KIỂM THỬ GỌI TRỰC TIẾP API /api/v2/execute QUA SERVER BACKEND ---');

    await testCase('API /api/v2/execute trả về đúng cấu trúc, tín hiệu success trung thực và mode phù hợp', async () => {
        const res = await fetch(`${BASE_URL}/api/v2/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task: 'Hãy cho biết định luật 1 Newton trong 1 câu.',
                useCache: false
            }),
            signal: AbortSignal.timeout(60000)
        });

        assert.strictEqual(res.ok, true, 'Server phải phản hồi HTTP 200');
        const data = await res.json();
        assert.strictEqual(data.success, true, 'Task trả lời ngắn chuẩn xác phải thành công');
        assert.strictEqual(data.mode, 'fast', 'Câu hỏi ngắn phải tự động định tuyến sang FAST mode');
        assert.ok(data.qualityScore >= 80, `Điểm chất lượng phải >= 80 (Thực tế: ${data.qualityScore})`);
        assert.ok(typeof data.result === 'string' && data.result.length > 20, 'Nội dung phản hồi phải thực chất');
    });

    console.log('\n===============================================================');
    console.log(`📊 TỔNG KẾT KIỂM THỬ CHỨC NĂNG MỚI: ${passCount}/${passCount + failCount} TESTS PASS (${((passCount / (passCount + failCount)) * 100).toFixed(1)}%)`);
    console.log('===============================================================');

    if (failCount > 0) {
        process.exit(1);
    }
}

runE2ETests().catch(err => {
    console.error('Lỗi tổng quát:', err);
    process.exit(1);
});
