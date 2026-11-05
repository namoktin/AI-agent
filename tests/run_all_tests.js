/**
 * run_all_tests.js - Consolidated Unit & Architecture Test Runner for Cyber Agent Pro
 * Runs all 7 core test suites in sequence:
 * 1. test_fixes_verification.js (10 tests)
 * 2. test_verify_4_fixes_v5_3.js (6 tests)
 * 3. test_platform_hardened_stress.js (4 tests)
 * 4. test_audit_fixes.js (6 tests)
 * 5. test_audit_v4_3_issues.js (8 tests)
 * 6. test_parse_cmd_comprehensive.js (2 tests / 2 suites)
 * 7. test_universal_goal_contract_and_self_healing.js (5 tests)
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
    { name: '8. Web App Interaction Engine & Adaptive Navigation', file: 'test_webapp_interaction_suite.js' }
];

async function runSuite(suite) {
    return new Promise((resolve) => {
        const fullPath = path.join(__dirname, suite.file);
        const child = fork(fullPath, [], {
            cwd: path.resolve(__dirname, '..'),
            stdio: 'inherit'
        });
        child.on('exit', (code) => {
            resolve({ suite: suite.name, code });
        });
    });
}

async function main() {
    console.log('===============================================================');
    console.log('🚀 CYBER AGENT PRO — FULL AUTOMATED TEST SUITE');
    console.log('===============================================================\n');

    const results = [];
    let allPass = true;

    for (const suite of suites) {
        console.log(`\n▶️ Running: ${suite.name}`);
        const res = await runSuite(suite);
        results.push(res);
        if (res.code !== 0) {
            allPass = false;
        }
    }

    console.log('\n===============================================================');
    console.log('📊 CONSOLIDATED TEST SUMMARY:');
    console.log('===============================================================');
    for (const r of results) {
        const status = r.code === 0 ? '✅ PASS' : `❌ FAIL (code ${r.code})`;
        console.log(`  ${status} - ${r.suite}`);
    }
    console.log('===============================================================');

    if (allPass) {
        console.log(`🎉 ALL ${suites.length} SUITES (46/46 TESTS) PASSED PERFECTLY!\n`);
        process.exit(0);
    } else {
        console.error('⚠️ SOME TESTS FAILED!\n');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});

