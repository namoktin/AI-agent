/**
 * run_all_tests.js - Consolidated Unit & Architecture Test Runner for Cyber Agent Pro v5.5
 * Runs all 9 core test suites in sequence with dynamic assertion counting:
 * 1. test_fixes_verification.js (10 tests)
 * 2. test_verify_4_fixes_v5_3.js (6 tests)
 * 3. test_platform_hardened_stress.js (4 tests)
 * 4. test_audit_fixes.js (6 tests)
 * 5. test_audit_v4_3_issues.js (8 tests)
 * 6. test_parse_cmd_comprehensive.js (2 tests)
 * 7. test_universal_goal_contract_and_self_healing.js (5 tests)
 * 8. test_webapp_interaction_suite.js (7 tests)
 * 9. test_tier4_update18_core.js (7 tests)
 */

const { fork } = require('child_process');
const path = require('path');

const suites = [
    { name: '1. Architecture & Benchmark Fixes (v5.4)', file: 'test_fixes_verification.js' },
    { name: '2. Critical Architecture Bugs Fixes (v5.3)', file: 'test_verify_4_fixes_v5_3.js' },
    { name: '3. Platform Hardened Concurrency & Stress', file: 'test_platform_hardened_stress.js' },
    { name: '4. Verifier, Skill & Anti-Phantom Fixes', file: 'test_audit_fixes.js' },
    { name: '5. Goal Completed, Quota Guard & Recovery', file: 'test_audit_v4_3_issues.js' },
    { name: '6. Safe Command & Syntax Verification', file: 'test_parse_cmd_comprehensive.js' },
    { name: '7. Universal Goal Contract & Self-Healing', file: 'test_universal_goal_contract_and_self_healing.js' },
    { name: '8. Web App Interaction Engine & Adaptive Navigation', file: 'test_webapp_interaction_suite.js' },
    { name: '9. Tier 4 Core Architecture & Verification Engine', file: 'test_tier4_update18_core.js' },
    { name: '10. Tier 4 Hardening & True Resilience (Update 19)', file: 'test_tier4_update19_hardening.js' },
    { name: '11. Production Hardening & Autonomous Dynamic DAG (Update 20)', file: 'test_tier4_update20_production.js' }
];

async function runSuite(suite) {
    return new Promise((resolve) => {
        const fullPath = path.join(__dirname, suite.file);
        let suiteOutput = '';

        const child = fork(fullPath, [], {
            cwd: path.resolve(__dirname, '..'),
            stdio: ['inherit', 'pipe', 'pipe', 'ipc']
        });

        child.stdout.on('data', (chunk) => {
            const str = chunk.toString();
            suiteOutput += str;
            process.stdout.write(chunk);
        });

        child.stderr.on('data', (chunk) => {
            const str = chunk.toString();
            suiteOutput += str;
            process.stderr.write(chunk);
        });

        child.on('exit', (code) => {
            // Dynamically parse individual assertions and passes from real output
            let passed = 0;
            let total = 0;

            // Pattern 1: Summary lines like "🏁 ... X/Y TESTS" or "X/Y BÀI TEST"
            const ratioMatch = suiteOutput.match(/(\d+)\/(\d+)\s+(?:TESTS|BÀI\s+TEST)/i);
            if (ratioMatch) {
                passed = parseInt(ratioMatch[1], 10);
                total = parseInt(ratioMatch[2], 10);
            } else {
                // Pattern 2: "8 PASSED | 0 FAILED"
                const passFailMatch = suiteOutput.match(/(\d+)\s+PASSED\s*\|\s*(\d+)\s+FAILED/i);
                if (passFailMatch) {
                    passed = parseInt(passFailMatch[1], 10);
                    total = passed + parseInt(passFailMatch[2], 10);
                } else {
                    // Pattern 3: Count explicit individual pass markers
                    const individualPasses = (suiteOutput.match(/✅\s+\[(?:TEST|PASS|STRESS\s+PASS)[^\]]*\]|✅\s+All[^\n]+passed/gi) || []).length;
                    const individualFails = (suiteOutput.match(/❌\s+\[(?:FAIL)[^\]]*\]/gi) || []).length;
                    passed = individualPasses;
                    total = individualPasses + individualFails;
                }
            }

            if (total === 0 && code === 0) {
                // Fallback for compact test files without explicit summary lines
                const passMarkers = (suiteOutput.match(/✅/g) || []).length;
                passed = passMarkers > 0 ? passMarkers : 1;
                total = passed;
            }

            resolve({ suite: suite.name, code, passed, total });
        });
    });
}

async function main() {
    console.log('===============================================================');
    console.log('🚀 CYBER AGENT PRO v5.5 — FULL AUTOMATED TEST SUITE');
    console.log('===============================================================\n');

    const results = [];
    let allPass = true;
    let totalPassedTests = 0;
    let totalExecutedTests = 0;

    for (const suite of suites) {
        console.log(`\n▶️ Running: ${suite.name}`);
        const res = await runSuite(suite);
        results.push(res);
        totalPassedTests += res.passed;
        totalExecutedTests += res.total;
        if (res.code !== 0) {
            allPass = false;
        }
    }

    console.log('\n===============================================================');
    console.log('📊 CONSOLIDATED TEST SUMMARY:');
    console.log('===============================================================');
    for (const r of results) {
        const status = r.code === 0 ? '✅ PASS' : `❌ FAIL (code ${r.code})`;
        console.log(`  ${status} - ${r.suite} (${r.passed}/${r.total} assertions passed)`);
    }
    console.log('===============================================================');

    if (allPass) {
        console.log(`🎉 ALL ${suites.length} SUITES (${totalPassedTests}/${totalExecutedTests} TESTS) PASSED PERFECTLY!\n`);
        process.exit(0);
    } else {
        console.error(`⚠️ SOME TESTS FAILED! (${totalPassedTests}/${totalExecutedTests} passed)\n`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});

