/**
 * 🧪 BACKTEST V2 SYSTEM - COMPREHENSIVE TESTING
 */

async function testV2System() {
    console.log('🧪 BACKTEST: Testing V2 Multi-Agent System\n');
    console.log('='.repeat(70));

    // Check if server is running
    try {
        const healthCheck = await fetch('http://localhost:3000/api/v2/stats');
        console.log('✅ Server is running\n');
    } catch (error) {
        console.log('❌ Server is NOT running!');
        console.log('   Please start the server first: npm start\n');
        process.exit(1);
    }

    const tests = [
        {
            name: 'Simple reasoning',
            task: 'Giải thích tại sao bầu trời màu xanh bằng vật lý',
            useGrounding: false,
            expectedQuality: 80
        },
        {
            name: 'Code generation',
            task: 'Viết hàm JavaScript để tìm số nguyên tố trong mảng',
            useGrounding: false,
            expectedQuality: 85
        },
        {
            name: 'Math reasoning',
            task: 'Tính 15 * 23 và giải thích từng bước',
            useGrounding: false,
            expectedQuality: 90
        }
    ];

    const results = [];
    let passCount = 0;
    let failCount = 0;

    for (const test of tests) {
        console.log(`\n🔬 Test ${results.length + 1}: ${test.name}`);
        console.log('-'.repeat(70));

        const startTime = Date.now();

        try {
            const response = await fetch('http://localhost:3000/api/v2/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: test.task,
                    useCache: true,
                    useGrounding: test.useGrounding
                })
            });

            const result = await response.json();
            const endTime = Date.now();
            const duration = endTime - startTime;

            if (result.success) {
                const qualityScore = result.qualityScore || 0;
                const passed = qualityScore >= test.expectedQuality;

                results.push({
                    name: test.name,
                    success: true,
                    passed: passed,
                    quality: qualityScore,
                    duration: duration,
                    agentCalls: result.stats?.agentCalls || 0
                });

                if (passed) {
                    console.log(`   ✅ PASS - Quality: ${qualityScore}% (expected: ${test.expectedQuality}%)`);
                    passCount++;
                } else {
                    console.log(`   ⚠️  BELOW THRESHOLD - Quality: ${qualityScore}% (expected: ${test.expectedQuality}%)`);
                    failCount++;
                }
                console.log(`   ⏱️  Duration: ${duration}ms`);
                console.log(`   🤖 Agent Calls: ${result.stats?.agentCalls || 0}`);
            } else {
                results.push({
                    name: test.name,
                    success: false,
                    passed: false,
                    error: result.error
                });
                console.log(`   ❌ FAIL: ${result.error}`);
                failCount++;
            }
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                passed: false,
                error: error.message
            });
            console.log(`   ❌ ERROR: ${error.message}`);
            failCount++;
        }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 BACKTEST RESULTS SUMMARY\n');

    const successResults = results.filter(r => r.success);

    if (successResults.length > 0) {
        const avgQuality = successResults.reduce((sum, r) => sum + r.quality, 0) / successResults.length;
        const avgDuration = successResults.reduce((sum, r) => sum + r.duration, 0) / successResults.length;
        const avgAgentCalls = successResults.reduce((sum, r) => sum + r.agentCalls, 0) / successResults.length;

        console.log(`Total Tests: ${results.length}`);
        console.log(`✅ Passed: ${passCount}`);
        console.log(`❌ Failed: ${failCount}`);
        console.log(`Success Rate: ${((passCount / results.length) * 100).toFixed(1)}%`);
        console.log(`\nPerformance Metrics:`);
        console.log(`  Average Quality: ${avgQuality.toFixed(1)}%`);
        console.log(`  Average Duration: ${avgDuration.toFixed(0)}ms`);
        console.log(`  Average Agent Calls: ${avgAgentCalls.toFixed(1)}`);

        // Grade
        let grade;
        if (avgQuality >= 95) grade = '10/10 - WORLD-CLASS';
        else if (avgQuality >= 90) grade = '9.5/10 - EXCELLENT';
        else if (avgQuality >= 85) grade = '9/10 - VERY GOOD';
        else if (avgQuality >= 80) grade = '8.5/10 - GOOD';
        else if (avgQuality >= 75) grade = '8/10 - ABOVE AVERAGE';
        else if (avgQuality >= 70) grade = '7/10 - AVERAGE';
        else grade = '6/10 - NEEDS IMPROVEMENT';

        console.log(`\n🏆 OVERALL GRADE: ${grade}`);
    } else {
        console.log('❌ All tests failed. System not operational.');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Backtest completed\n');

    return results;
}

// Polyfill fetch for older Node versions
if (typeof fetch === 'undefined') {
    global.fetch = async (url, options) => {
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');

        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;

            const req = client.request(url, {
                method: options?.method || 'GET',
                headers: options?.headers || {}
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        json: async () => JSON.parse(data),
                        text: async () => data
                    });
                });
            });

            req.on('error', reject);

            if (options?.body) {
                req.write(options.body);
            }

            req.end();
        });
    };
}

testV2System().catch(console.error);
