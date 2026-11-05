const http = require('http');

const task = `Nhiệm vụ: Lồng tiếng lại toàn bộ 5 video Facebook Reels tại thư mục ngày hôm nay 'C:/Users/Nam/Desktop/gemini/2026-11-04/' (reel_1.mp4 đến reel_5.mp4) sang tiếng Việt tự nhiên chất lượng cao nhất của con người.
Tài nguyên API được cấp: ElevenLabs API Key: sk_151633ee9853f84cccecd001cc64cb9d2c270da1a520d593
Yêu cầu kỹ thuật bắt buộc:
1. Model & Voice: Sử dụng giọng Adam (Voice ID: 'pNInz6obpgDQGcFmaJgB', model 'eleven_multilingual_v2') với cài đặt truyền cảm xúc: stability=0.35, similarity_boost=0.85, style=0.45, use_speaker_boost=true để giọng đọc có ngữ điệu biểu cảm, nhấn nhá cảm xúc sống động. CƠ CHẾ DỰ PHÒNG BẮT BUỘC: Nếu ElevenLabs API trả về 401 Unauthorized hoặc hết hạn mức, BẮT BUỘC tự động fallback sang Edge-TTS giọng nam truyền cảm 'vi-VN-NamMinhNeural' (hoặc gTTS) để đảm bảo 100% tạo ra file giọng đọc tiếng Việt truyền cảm, tự nhiên chuẩn tai người nghe, rõ ràng, không ngọng, không để pipeline bị gãy.
2. FORCE OVERWRITE: BẮT BUỘC ghi đè tái tạo lại 100% các file âm thanh mới (voice_eleven_1.mp3 đến voice_eleven_5.mp3) tại thư mục 'C:/Users/Nam/Desktop/gemini/2026-11-04/'. Đặc biệt phải xóa bỏ hoàn toàn file rác cũ voice_eleven_5.mp3 (76KB nháp). Tuyệt đối không dùng 'if not os.path.exists()' bỏ qua việc sinh audio.
3. Nội dung thuyết minh: Sử dụng các kịch bản tiếng Việt sát nghĩa đã bóc tách từ video gốc (script_faithful_1.txt đến script_faithful_5.txt) trong thư mục 'C:/Users/Nam/Desktop/gemini/2026-11-04/'. Toàn bộ 5 kịch bản đã được bóc tách đầy đủ 100% nội dung gốc từ giây đầu đến giây cuối, khớp hoàn toàn từng giây với độ dài video tương ứng.
4. ĐỒNG BỘ THUYẾT MINH & TỐC ĐỘ NÓI TỰ NHIÊN: Giọng đọc thuyết minh BẮT BUỘC giữ tốc độ nói tự nhiên của con người (1.0x đến 1.05x hoạt bát). TUYỆT ĐỐI CẤM dùng filter atempo < 1.0 để kéo dãn giọng nói chậm lại (vì làm biến dạng giọng, ngọng và chậm bất thường). Giọng đọc phát CÙNG LÚC với video từ giây 0.0s.
5. Ghép video: Dùng FFmpeg audio ducking ([1:a]atempo=1.05,volume=1.8[voice];[0:a]volume=0.20[bg];[bg][voice]amix=inputs=2:duration=first:dropout_transition=2[aout]) để tạo ra 5 video thành phẩm: 'final_reel_eleven_1.mp4' đến 'final_reel_eleven_5.mp4' tại thư mục 'C:/Users/Nam/Desktop/gemini/2026-11-04/'. Khi giọng đọc hết câu, nhạc nền gốc tiếp tục phát tự nhiên đến hết video.
6. KIỂM ĐỊNH MEDIA: Dùng tool INSPECT_MEDIA kiểm định cả 5 video thành phẩm, xác nhận có stream audio, video và duration > 2.0s. Xuất file báo cáo nghiệm thu 'elevenlabs_dubbing_manifest_v2.json' tại 'C:/Users/Nam/Desktop/gemini/2026-11-04/'.`;

console.log('🚀 [TASK 0] Bắt đầu giao nhiệm vụ cho AI Agent: Lồng tiếng 5 video Facebook Reels 100% tự hành...');
console.log('Nhiệm vụ:', task);
const startTime = Date.now();

const postData = JSON.stringify({
    task: task,
    useCache: false
});

const req = http.request('http://127.0.0.1:3000/api/v2/execute', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 900000 // 15 phút
}, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n================ KẾT QUẢ TASK 0 TỰ HÀNH (${elapsed}s) ================`);
        try {
            const data = JSON.parse(body);
            console.log('Success:', data.success);
            console.log('Quality Score:', data.qualityScore);
            console.log('Critic Verdict:', data.critique?.verdict || 'N/A');
            console.log('Critic Score:', data.critique?.overallScore ?? data.critique?.score ?? 'N/A');
            console.log('Audit Status:', data.audit?.status);
            console.log('Audit Quality Score:', data.audit?.qualityScore);
            console.log('Audit Pass Ratio:', data.audit?.passRatio);
            console.log('Audit Checks:', `${data.audit?.passedChecks}/${data.audit?.totalChecks}`);
            console.log('\n--- CRITIC ISSUES & STRENGTHS ---');
            console.log('Issues:', JSON.stringify(data.critique?.issues || [], null, 2));
            console.log('Strengths:', JSON.stringify(data.critique?.strengths || [], null, 2));
            console.log('\n--- BÁO CÁO CỦA AI ---');
            console.log(typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2));
            if (data.executionLog && Array.isArray(data.executionLog)) {
                console.log('\n--- EXECUTION LOG SUMMARY ---');
                data.executionLog.forEach(l => {
                    if (l.tool || l.message?.includes('Critic') || l.message?.includes('Verifier') || l.message?.includes('Score') || l.message?.includes('Stage')) {
                        console.log(`- ${l.message || l.tool}`);
                    }
                });
            }
        } catch (e) {
            console.error('Parse Error:', e.message, body.slice(0, 500));
        }
    });
});

req.on('error', (e) => {
    console.error('Request Error:', e.message);
});

req.write(postData);
req.end();

