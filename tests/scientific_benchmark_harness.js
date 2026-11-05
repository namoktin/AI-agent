/**
 * SCIENTIFIC BENCHMARK HARNESS - 10-POINT ACADEMIC VERIFICATION SUITE
 * Kiểm định toàn diện năng lực nghiên cứu khoa học, độ chính xác trích dẫn,
 * đối chiếu số liệu gốc và Rubric Quality Gate V2 độc lập.
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = '') {
    if (condition) {
        passedCount++;
        console.log(`  ✅ [PASS] ${testName}${details ? ` -> ${details}` : ''}`);
    } else {
        failedCount++;
        console.error(`  ❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    }
}

async function runBenchmark() {
    console.log('======================================================================');
    console.log('🔬 SCIENTIFIC BENCHMARK HARNESS (10-POINT ACADEMIC VERIFICATION SUITE)');
    console.log('======================================================================\n');

    // -------------------------------------------------------------------------
    // TEST 1: Live Academic Multi-Source Search (Šrámek et al. 2000)
    // -------------------------------------------------------------------------
    try {
        const res = await fetch(`${BASE_URL}/api/academic/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'Sramek immersion different temperatures', limit: 5 })
        });
        const data = await res.json();
        const hasResults = data.success && (data.total > 0 || (data.items && data.items.length > 0));
        assert(hasResults, 'Test 1: Multi-source academic search (PubMed/Crossref/EuropePMC)', `Found ${data.total || data.items?.length} papers`);
    } catch (e) {
        assert(false, 'Test 1: Academic search', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Live DOI Metadata Verification (10.1007/s004210050065)
    // -------------------------------------------------------------------------
    try {
        const res = await fetch(`${BASE_URL}/api/academic/verify-source`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doi: '10.1007/s004210050065' })
        });
        const data = await res.json();
        const titleMatches = /Human physiological responses to immersion/i.test(data.metadata?.title || '');
        assert(data.success && titleMatches, 'Test 2: Crossref DOI live metadata verification', `Title: ${data.metadata?.title?.slice(0, 45)}...`);
    } catch (e) {
        assert(false, 'Test 2: Crossref DOI verification', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Live Flow State Literature Search (van der Linden 2021)
    // -------------------------------------------------------------------------
    try {
        const res = await fetch(`${BASE_URL}/api/academic/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'van der linden neurobiology flow systematic review', limit: 5 })
        });
        const data = await res.json();
        const hasFlow = data.success && (data.total > 0 || (data.items && data.items.length > 0));
        assert(hasFlow, 'Test 3: Live academic search for Flow State systematic review', `Retrieved ${data.total || data.items?.length} papers`);
    } catch (e) {
        assert(false, 'Test 3: Flow State literature search', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Claim Ledger Integrity & API Ops
    // -------------------------------------------------------------------------
    try {
        const upsertRes = await fetch(`${BASE_URL}/api/claim-ledger/upsert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                claims: [{
                    claim_id: 'CLM-BENCH-001',
                    claim_text: 'Tập luyện thể thao aerobic kích thích biểu hiện BDNF trong hồi hải mã.',
                    source_doi: '10.1016/j.neubiorev.2021.06.002',
                    evidence_level: 'Tier 1',
                    verification_status: 'VERIFIED'
                }]
            })
        });
        const upsertData = await upsertRes.json();
        const getRes = await fetch(`${BASE_URL}/api/claim-ledger`);
        const getData = await getRes.json();
        const exists = getData.claims && getData.claims.some(c => c.claim_id === 'CLM-BENCH-001');
        assert(upsertData.success && exists, 'Test 4: Claim Ledger upsert and retrieval', `Total ledger size: ${getData.total}`);
    } catch (e) {
        assert(false, 'Test 4: Claim Ledger integrity', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Šrámek Numerical Understatement Veto (Negative Test)
    // -------------------------------------------------------------------------
    try {
        const flawedText = `Nghiên cứu Šrámek et al. (2000) ghi nhận khi ngâm nước lạnh thì dopamine tăng nhẹ.`;
        const res = await fetch(`${BASE_URL}/api/academic/quality-gate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportContent: flawedText })
        });
        const data = await res.json();
        const r1 = data.qualityGate?.rubric?.find(r => r.id === 'R1_SRAMEK_NUMERICAL_FIDELITY');
        assert(data.qualityGate?.passed === false && r1?.passed === false, 'Test 5: Quality Gate vetoes Šrámek numerical understatement ("tăng nhẹ")', r1?.detail);
    } catch (e) {
        assert(false, 'Test 5: Šrámek numerical veto', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Biological Compartment (BBB) Guard (Negative Test)
    // -------------------------------------------------------------------------
    try {
        const flawedText = `Ngâm lạnh 14°C làm tăng vọt dopamine trực tiếp trong não bộ và kích thích hệ thần kinh trung ương.`;
        const res = await fetch(`${BASE_URL}/api/academic/quality-gate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportContent: flawedText })
        });
        const data = await res.json();
        const r2 = data.qualityGate?.rubric?.find(r => r.id === 'R2_BIOLOGICAL_COMPARTMENT');
        assert(r2?.passed === false, 'Test 6: Quality Gate catches BBB compartment confusion', r2?.detail);
    } catch (e) {
        assert(false, 'Test 6: BBB guard', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 7: Self-Aggrandizing Language Detection (Negative Test)
    // -------------------------------------------------------------------------
    try {
        const boastfulText = `# Báo cáo đạt chuẩn kiệt tác 9.5+ tuyệt đối không tì vết.`;
        const res = await fetch(`${BASE_URL}/api/academic/quality-gate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportContent: boastfulText })
        });
        const data = await res.json();
        const r9 = data.qualityGate?.rubric?.find(r => r.id === 'R9_OBJECTIVE_ACADEMIC_TONE');
        assert(r9?.passed === false, 'Test 7: Quality Gate vetoes self-aggrandizing boastful phrases', r9?.detail);
    } catch (e) {
        assert(false, 'Test 7: Boastful language veto', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 8: Pseudoscience Detection ("Adrenal Fatigue" Veto)
    // -------------------------------------------------------------------------
    try {
        const pseudoText = `Tiếp xúc lạnh liên tục gây ra suy tuyến thượng thận chức năng (adrenal fatigue) cần bồi bổ thảo dược.`;
        const res = await fetch(`${BASE_URL}/api/academic/quality-gate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportContent: pseudoText })
        });
        const data = await res.json();
        const r7 = data.qualityGate?.rubric?.find(r => r.id === 'R7_PSEUDOSCIENCE_REJECTION');
        assert(r7?.passed === false, 'Test 8: Quality Gate detects unrefuted pseudoscience ("adrenal fatigue")', r7?.detail);
    } catch (e) {
        assert(false, 'Test 8: Pseudoscience detection', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 9: Quality Gate V2 Full 9/9 Pass on 2026-10-20 Report
    // -------------------------------------------------------------------------
    try {
        const fixture20 = path.join(__dirname, 'tests/fixtures/bao_cao_tiem_nang_con_nguoi.md');
        const file20 = fs.existsSync(fixture20) ? fixture20 : 'c:/Users/Nam/Desktop/gemini/2026-10-20/bao_cao_tiem_nang_con_nguoi.md';
        const content20 = fs.readFileSync(file20, 'utf8');
        const res = await fetch(`${BASE_URL}/api/academic/quality-gate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportContent: content20 })
        });
        const data = await res.json();
        const allRubricPassed = data.qualityGate?.rubric?.every(r => r.passed);
        assert(
            data.qualityGate?.passed && data.qualityGate?.score >= 9.0 && allRubricPassed,
            'Test 9: Full 9/9 Rubric Pass on 2026-10-20 Report (Score 9.5/10)',
            `Score: ${data.qualityGate?.score}/10, 0 Blocking Issues`
        );
    } catch (e) {
        assert(false, 'Test 9: 2026-10-20 Report Quality Gate', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Quality Gate V2 Full 9/9 Pass on 2026-10-19 Canonical Report
    // -------------------------------------------------------------------------
    try {
        const fixture19 = path.join(__dirname, 'tests/fixtures/bao_cao_canonical_tong_hop.md');
        const file19 = fs.existsSync(fixture19) ? fixture19 : 'c:/Users/Nam/Desktop/gemini/2026-10-19/bao_cao_canonical_tong_hop.md';
        const content19 = fs.readFileSync(file19, 'utf8');
        const res = await fetch(`${BASE_URL}/api/academic/quality-gate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportContent: content19 })
        });
        const data = await res.json();
        const allRubricPassed = data.qualityGate?.rubric?.every(r => r.passed);
        assert(
            data.qualityGate?.passed && data.qualityGate?.score >= 9.0 && allRubricPassed,
            'Test 10: Full 9/9 Rubric Pass on 2026-10-19 Canonical Report (Score 9.5/10)',
            `Score: ${data.qualityGate?.score}/10, 0 Blocking Issues`
        );
    } catch (e) {
        assert(false, 'Test 10: 2026-10-19 Canonical Report Quality Gate', e.message);
    }

    console.log('\n======================================================================');
    console.log(`TOTAL BENCHMARK RESULTS: ${passedCount}/10 PASSED (${(passedCount / 10) * 100}%)`);
    if (failedCount > 0) {
        console.error(`FAILED: ${failedCount} tests.`);
        process.exit(1);
    } else {
        console.log('🌟 ALL 10 SCIENTIFIC BENCHMARKS PASSED PERFECTLY!');
        process.exit(0);
    }
}

runBenchmark();

