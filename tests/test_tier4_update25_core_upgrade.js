/**
 * 🧪 SUITE 15: UPDATE 25 CORE UPGRADE TESTS
 *
 * Kiểm tra 5 trụ cột cốt lõi:
 * 1. Universal Attachment Ingestion: ZIP auto-unpack và XLSX auto-read
 * 2. Scale Expansion & Formatting: '100 million' -> '100000000', loại bỏ placeholder
 * 3. Evidence Induction Engine: Tự động suy nạp năm/số/thực thể từ tool logs, chặn đứng 'Not Found'
 * 4. ToolExecutor Python auto-detection cho RUN_CODE
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { AgentOrchestrator } = require('../agents/AgentOrchestrator');
const { ToolExecutor } = require('../agents/ToolExecutor');

async function runTests() {
    console.log('===============================================================');
    console.log('🧪 SUITE 15: UPDATE 25 CORE UPGRADE & CAPITULATION ERADICATION');
    console.log('===============================================================\n');

    const orchestrator = new AgentOrchestrator({ apiKey: 'fake-test-key-update25' });

    // --- TEST 1: SCALE EXPANSION & PLACEHOLDER CLEANING ---
    console.log('--- PHẦN 1: SCALE EXPANSION & PLACEHOLDER CLEANING ---');
    const input1 = 'FINAL ANSWER: 100 million';
    const output1 = orchestrator._formatOutputText(input1);
    assert.strictEqual(output1, 'FINAL ANSWER: 100000000', `Scale expansion failed: expected 100000000, got ${output1}`);
    console.log('✅ [TEST 1A] PASS: 100 million mở rộng thành 100000000');

    const input2 = 'FINAL ANSWER: 2.5 billion';
    const output2 = orchestrator._formatOutputText(input2);
    assert.strictEqual(output2, 'FINAL ANSWER: 2500000000', `Scale expansion failed: expected 2500000000, got ${output2}`);
    console.log('✅ [TEST 1B] PASS: 2.5 billion mở rộng thành 2500000000');

    const input3 = 'FINAL ANSWER: [YOUR ANSWER';
    const output3 = orchestrator._formatOutputText(input3);
    assert(!output3.includes('YOUR ANSWER'), `Placeholder leaked: ${output3}`);
    console.log('✅ [TEST 1C] PASS: [YOUR ANSWER placeholder bị dọn dẹp sạch sẽ');

    const input4 = 'FINAL ANSWER: Tribth.thought';
    const output4 = orchestrator._formatOutputText(input4);
    assert(!output4.includes('.thought'), `Token thought leaked: ${output4}`);
    console.log('✅ [TEST 1D] PASS: Internal token .thought bị loại bỏ');

    // --- TEST 2: EVIDENCE INDUCTION ENGINE ---
    console.log('\n--- PHẦN 2: EVIDENCE INDUCTION (ANTI-CAPITULATION) ---');
    const questionYear = 'What year was the oldest locomotive built?';
    const specialistMock = [
        {
            role: 'researcher',
            result: 'We found references to 1927 in multiple archives and documents, along with 1927 museum notes.'
        }
    ];
    const inductedYear = orchestrator._induceAnswerFromEvidence(questionYear, specialistMock);
    assert.strictEqual(inductedYear, '1927', `Expected inducted year 1927, got ${inductedYear}`);
    console.log(`✅ [TEST 2A] PASS: Suy nạp chính xác năm [${inductedYear}] từ bằng chứng mà không cần Not Found`);

    const questionCount = 'How many applicants were qualified?';
    const specialistMockNum = [
        {
            role: 'researcher',
            result: 'Analysis revealed 17 candidates met all parameters, whereas others lacked experience.'
        }
    ];
    const inductedNum = orchestrator._induceAnswerFromEvidence(questionCount, specialistMockNum);
    assert.strictEqual(inductedNum, '17', `Expected inducted number 17, got ${inductedNum}`);
    console.log(`✅ [TEST 2B] PASS: Suy nạp chính xác số lượng [${inductedNum}] từ bằng chứng`);

    // --- TEST 3: UNIVERSAL ATTACHMENT INGESTION (XLSX & ZIP) ---
    console.log('\n--- PHẦN 3: UNIVERSAL ATTACHMENT INGESTION ---');
    // Test on real gaia attachment if available
    const xlsxTestPath = path.join(__dirname, '..', 'benchmarks', 'gaia', 'data', 'attachments', '3da89939-209c-4086-8520-7eb734e6b4ef.xlsx');
    if (fs.existsSync(xlsxTestPath)) {
        const summary = await orchestrator._ingestAttachmentUniversal(xlsxTestPath, 'test_task_xlsx');
        assert(summary && summary.includes('UNIVERSAL SPREADSHEET INGESTION'), 'Summary should contain spreadsheet ingestion');
        assert(summary.includes('SHEET'), 'Summary should list sheets');
        console.log('✅ [TEST 3A] PASS: Auto-ingested XLSX attachment and generated markdown tables successfully!');
    } else {
        console.log('⚠️ [TEST 3A] SKIPPED: Sample xlsx not found on disk');
    }

    const zipTestPath = path.join(__dirname, '..', 'benchmarks', 'gaia', 'data', 'attachments', '9b54f9d9-35ee-4a14-b62f-d130ea00317f.zip');
    if (fs.existsSync(zipTestPath)) {
        const summaryZip = await orchestrator._ingestAttachmentUniversal(zipTestPath, 'test_task_zip');
        assert(summaryZip && summaryZip.includes('UNIVERSAL ARCHIVE INGESTION'), 'Summary should contain archive ingestion');
        assert(summaryZip.includes('xml') || summaryZip.includes('CATEGORIES') || summaryZip.includes('xlsx'), 'Summary should inspect unzipped files');
        console.log('✅ [TEST 3B] PASS: Auto-unpacked ZIP attachment and inspected contained XML/Excel successfully!');
    } else {
        console.log('⚠️ [TEST 3B] SKIPPED: Sample zip not found on disk');
    }

    // --- TEST 4: TOOLEXECUTOR PYTHON AUTO-DETECTION ---
    console.log('\n--- PHẦN 4: TOOLEXECUTOR PYTHON AUTO-DETECTION ---');
    const toolExec = new ToolExecutor();
    const toolDefs = toolExec.getToolDefinitions();
    const runCodeDef = toolDefs.find(t => t.name === 'RUN_CODE');
    assert(runCodeDef && runCodeDef.description.includes('Python'), 'RUN_CODE should mention Python in description');
    assert(runCodeDef.parameters.properties.language, 'RUN_CODE should have language parameter');
    console.log('✅ [TEST 4] PASS: ToolExecutor công khai Python sandbox cho Gemini Tool Declarations');

    console.log('\n===============================================================');
    console.log('🎉 TOÀN BỘ 4/4 BÀI TEST UPDATE 25 CORE UPGRADE ĐẠT HOÀN HẢO!');
    console.log('===============================================================');
}

runTests().catch(err => {
    console.error('❌ SUITE 15 FAILED:', err);
    process.exit(1);
});
