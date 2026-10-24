const fs = require('fs');

let content = fs.readFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\agents\\AgentOrchestrator.js', 'utf8');

const target = `            // 2. Trích xuất text phản hồi cuối cùng sau khi hoàn tất chuỗi công cụ
            const text = currentParts.filter(p => p.text).map(p => p.text).join('\\n');
            const thoughts = currentParts.filter(p => p.thought).map(p => p.thought).join('\\n');`;

const replacement = `            // 2. Trích xuất text phản hồi cuối cùng sau khi hoàn tất chuỗi công cụ
            let text = currentParts.filter(p => p.text).map(p => p.text).join('\\n');
            const thoughts = currentParts.filter(p => p.thought).map(p => p.thought).join('\\n');

            // BẢO CHỨNG ĐẦU RA (OUTPUT SAFETY GATE): Nếu đã chạy công cụ nhưng text rỗng, tự động tổng kết báo cáo
            if (!text.trim() && toolIterationCount > 0) {
                try {
                    const finalizeBody = {
                        contents: [
                            ...conversationContents,
                            { role: 'user', parts: [{ text: "Hãy tổng kết toàn bộ kết quả thực thi các công cụ trên và trả về kết quả nghiệm thu cuối cùng theo đúng định dạng JSON yêu cầu của bạn." }] }
                        ],
                        systemInstruction: requestBody.systemInstruction,
                        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
                    };
                    const finRes = await fetch(
                        \`\${this.baseUrl}/models/gemini-3.5-flash-lite:generateContent?key=\${this.apiKey}\`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(finalizeBody),
                            timeout: this.config.timeout
                        }
                    );
                    if (finRes.ok) {
                        const finData = await finRes.json();
                        const finCandidate = finData.candidates?.[0];
                        if (finCandidate && finCandidate.content) {
                            text = finCandidate.content.parts?.filter(p => p.text).map(p => p.text).join('\\n') || text;
                        }
                    }
                } catch (finErr) {
                    this.log(\`⚠️ Finalize note: \${finErr.message}\`);
                }
            }`;

const crlfTarget = target.replace(/\n/g, '\r\n');
if (content.includes(crlfTarget)) {
    content = content.replace(crlfTarget, replacement.replace(/\n/g, '\r\n'));
    fs.writeFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\agents\\AgentOrchestrator.js', content, 'utf8');
    console.log('Successfully patched AgentOrchestrator with CRLF!');
} else if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\agents\\AgentOrchestrator.js', content, 'utf8');
    console.log('Successfully patched AgentOrchestrator with LF!');
} else {
    console.log('Target not found in AgentOrchestrator!');
}

