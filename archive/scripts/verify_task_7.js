/**
 * verify_task_7.js - Re-run or verify Task 7 with adequate timeout
 */

const BASE_URL = 'http://localhost:3000';

async function verifyTask7() {
    console.log('Testing Task 7 with 300s timeout...');
    const startTime = Date.now();
    try {
        const response = await fetch(`${BASE_URL}/api/v2/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task: 'Tạo file C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\secure_auth_middleware.js chứa một middleware Express.js xác thực JWT và bảo vệ chống tấn công Timing Attack khi so sánh HMAC secret bằng crypto.timingSafeEqual, tích hợp rate limiting bộ nhớ và gắn headers bảo mật.',
                context: {
                    taskId: `hard_task_7_retry_${Date.now()}`
                }
            }),
            signal: AbortSignal.timeout(300000)
        });

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`Response status: ${response.status} after ${elapsed}s`);
        const data = await response.json();
        console.log('Result:', {
            success: data.success,
            qualityScore: data.qualityScore,
            status: data.verification?.status || data.audit?.status,
            mode: data.mode
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

verifyTask7();

