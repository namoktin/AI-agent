/**
 * 🧪 TEST V2 SYSTEM
 */
// Global fetch is built-in in Node.js 18+
const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

async function testV2System() {
    console.log('🧪 Testing V2 Multi-Agent System\n');

    const tests = [
        {
            name: 'Simple reasoning',
            task: 'Giải thích tại sao bầu trời màu xanh bằng vật lý',
            useGrounding: true
        },
        {
            name: 'Code generation',
            task: 'Viết hàm JavaScript để tìm số nguyên tố trong mảng',
            useGrounding: false
        },
        {
            name: 'Research',
            task: 'Tóm tắt các breakthrough trong AI năm 2024',
            useGrounding: true
        }
    ];

    for (const test of tests) {
        console.log(`🔬 Test: ${test.name}`);

        try {
            const response = await fetchFn('http://localhost:3000/api/v2/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: test.task,
                    useCache: true,
                    useGrounding: test.useGrounding
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log(`   ✅ Success - Quality: ${result.qualityScore}%`);
                console.log(`   ⏱️  Time: ${result.stats.executionTime}`);
                console.log(`   🤖 Agent Calls: ${result.stats.agentCalls}`);
            } else {
                console.log(`   ❌ Failed: ${result.error}`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }

        console.log('');
    }

    console.log('✅ V2 System tests completed\n');
}

testV2System().catch(console.error);
