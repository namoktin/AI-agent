const BASE_URL = 'http://localhost:3000';

async function testTask3() {
    console.log('Testing Task 3...');
    const startTime = Date.now();
    try {
        const response = await fetch(`${BASE_URL}/api/v2/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task: 'Tìm hiểu cách tặng thẻ quà tặng trên website Starbucks và trích xuất ngữ cảnh văn bản sau chữ "Amazon" tại mục More ways to gift.',
                context: {
                    taskId: `task_3_verify_${Date.now()}`
                }
            }),
            signal: AbortSignal.timeout(180000)
        });
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const data = await response.json();
        console.log(`Task 3 completed in ${elapsed}s:`, {
            success: data.success,
            qualityScore: data.qualityScore,
            status: data.verification?.status || data.audit?.status
        });
    } catch (e) {
        console.error('Task 3 error:', e.message);
    }
}

testTask3();

