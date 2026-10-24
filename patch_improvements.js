const fs = require('fs');

let content = fs.readFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\agents\\AgentOrchestrator.js', 'utf8');

// 1. Replace fetch timeout with AbortSignal.timeout
content = content.replace(/timeout:\s*this\.config\.timeout/g, 'signal: AbortSignal.timeout(this.config.timeout || 45000)');

// 2. Update Developer system prompt with the proven Facebook procedure
const oldDevTarget = `- QUY TRÌNH CHUẨN ĐỂ LẤY VÀ TẢI 5 REELS CỦA TÁC GIẢ TỪ 1 LINK BAN ĐẦU:
  * Bước 1 (Lấy thông tin tác giả): Dùng RUN_CMD gọi "yt-dlp --cookies \\"C:\\\\Users\\\\Nam\\\\Desktop\\\\AI agent\\\\memory\\\\cookies\\\\facebook.com.txt\\" --skip-download --print \\"%(uploader)s | %(uploader_id)s\\" <URL_GỐC_TỪ_USER_REQUEST>" để trích xuất tên tác giả (uploader) và uploader_id.
  * Bước 2 (Lấy 5 link Reels thật): Dùng BROWSE_WEB với url: "https://www.facebook.com/people/<uploader>/<uploader_id>/?sk=reels_tab" (hoặc https://www.facebook.com/<uploader_id>/?sk=reels_tab) và extractReels: true. Tool này sẽ tự động duyệt trang và trả về mảng deepMediaLinks chứa danh sách link reel thật!
  * Bước 3 (Tải từng video): Chạy RUN_CMD với yt-dlp tải từng link reel trong danh sách vào thư mục đích (bao gồm cả link reel ban đầu):
    yt-dlp --cookies "C:\\\\Users\\\\Nam\\\\Desktop\\\\AI agent\\\\memory\\\\cookies\\\\facebook.com.txt" -o "<output_dir>\\\\facebook_reel_%(id)s.mp4" <LINK_REEL>
    (Hoặc viết 1 script python ngắn gọn đọc danh sách 5 link trên rồi gọi yt-dlp tải từng file).
  * Bước 4 (Nghiệm thu): Gọi LIST_FILES để xác nhận các file video .mp4 đã lưu thành công trong thư mục đích.`;

const newDevTarget = `- QUY TRÌNH CHUẨN ĐỂ LẤY VÀ TẢI 5 REELS CỦA TÁC GIẢ TỪ 1 LINK BAN ĐẦU:
  * Bước 1 (Lấy thông tin tác giả & Tải ngay reel đầu tiên):
    - Dùng RUN_CMD gọi "yt-dlp --cookies \\"C:\\\\Users\\\\Nam\\\\Desktop\\\\AI agent\\\\memory\\\\cookies\\\\facebook.com.txt\\" --skip-download --print \\"%(uploader)s | %(uploader_id)s\\" <URL_GỐC>" để trích xuất tên tác giả (uploader) và uploader_id.
    - Chạy RUN_CMD tải ngay video reel gốc này: "yt-dlp --cookies \\"C:\\\\Users\\\\Nam\\\\Desktop\\\\AI agent\\\\memory\\\\cookies\\\\facebook.com.txt\\" -o \\"<output_dir>\\\\facebook_reel_%(id)s.mp4\\" <URL_GỐC>". (Đây là 1 video thật 100%!).
  * Bước 2 (Lấy danh sách link Reels tiếp theo qua BROWSE_WEB):
    - CẢNH BÁO QUAN TRỌNG: Facebook KHÔNG CHO yt-dlp cào trực tiếp link profile /reels/ (sẽ bị lỗi HTTP 500)! BẮT BUỘC dùng công cụ BROWSE_WEB với url dạng: "https://www.facebook.com/people/<uploader>/<uploader_id>/?sk=reels_tab" và extractReels: true. Tool BROWSE_WEB sẽ duyệt bằng Stealth Browser và trả về mảng deepMediaLinks chứa các URL reel thật.
  * Bước 3 (Tải các video còn lại bằng RUN_CMD):
    - Lấy 4 URL reel khác từ kết quả deepMediaLinks của BROWSE_WEB, chạy lệnh tải từng video qua RUN_CMD:
      yt-dlp --cookies "C:\\\\Users\\\\Nam\\\\Desktop\\\\AI agent\\\\memory\\\\cookies\\\\facebook.com.txt" -o "<output_dir>\\\\facebook_reel_%(id)s.mp4" <LINK_REEL>
  * Bước 4 (Nghiệm thu): Gọi LIST_FILES để xác nhận các file video .mp4 đã lưu thành công trong thư mục đích.`;

if (content.includes(oldDevTarget)) {
    content = content.replace(oldDevTarget, newDevTarget);
    console.log('Replaced Developer system prompt!');
} else {
    console.log('Old developer target not found, trying CRLF...');
    const crlfOld = oldDevTarget.replace(/\n/g, '\r\n');
    if (content.includes(crlfOld)) {
        content = content.replace(crlfOld, newDevTarget.replace(/\n/g, '\r\n'));
        console.log('Replaced Developer system prompt with CRLF!');
    }
}

// 3. Fast debate consensus: maxRounds default to 1 for quick decision
content = content.replace(/async achieveConsensus\(results, directive, maxRounds = 2\)/g, 'async achieveConsensus(results, directive, maxRounds = 1)');

fs.writeFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\agents\\AgentOrchestrator.js', content, 'utf8');
console.log('Patched AgentOrchestrator successfully!');

