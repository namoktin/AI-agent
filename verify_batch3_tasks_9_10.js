const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = 'C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24';

async function verifyTask(id, title, prompt, expectedFile) {
    console.log(`\n===============================================================`);
    console.log(`🚀 [CHẠY LẠI TASK ${id} VỚI MODEL MỚI GEMINI 3.5 FLASH]: ${title}`);
    console.log(`===============================================================`);

    const startTime = Date.now();
    try {
        const response = await fetch(`${BASE_URL}/api/v2/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task: prompt,
                context: { taskId: `retest_batch3_${id}_${Date.now()}` }
            }),
            signal: AbortSignal.timeout(240000)
        });

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (response.ok) {
            const data = await response.json();
            console.log(`✅ [TASK ${id} HOÀN TẤT SAU ${elapsed}s]`);
            console.log(`- Success: ${data.success}`);
            console.log(`- Mode: ${data.mode}`);
            console.log(`- Quality Score: ${data.qualityScore}`);
            console.log(`- Audit Status: ${data.audit?.status || data.verification?.status}`);
            
            const targetPath = path.join(OUTPUT_DIR, expectedFile);
            if (fs.existsSync(targetPath)) {
                console.log(`- File vật lý: ✅ Tồn tại (${fs.statSync(targetPath).size} bytes) tại ${targetPath}`);
            }
            return { id, success: data.success, score: data.qualityScore, elapsed, mode: data.mode };
        } else {
            console.error(`❌ HTTP Error: ${response.status}`);
            return { id, success: false, score: 0, elapsed };
        }
    } catch (err) {
        console.error(`💥 Error: ${err.message}`);
        return { id, success: false, score: 0 };
    }
}

async function run() {
    // Task 9
    await verifyTask(
        9,
        'Luận Chiến Kỹ Thuật: Đồng Thuận Phân Tán Raft vs Paxos',
        'Đóng vai Hội đồng Kiến trúc sư Hệ thống Phân tán: Kỹ sư Đảm bảo Độ trễ Thấp và Chuyên gia Khả năng Chịu lỗi tranh luận chuyên sâu về Raft Consensus và Multi-Paxos trong State Machine Replication. Phân tích Leader Election, Log Replication, Network Partition, Quorum loss. Lưu báo cáo vào C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\tranh_luan_raft_vs_paxos.md.',
        'tranh_luan_raft_vs_paxos.md'
    );

    // Task 10
    await verifyTask(
        10,
        'Công Cụ Dọn Dẹp Ổ Đĩa An Toàn Kèm Báo Cáo Kiểm Toán',
        'Viết một script Node.js hoàn chỉnh tại C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\safe_disk_cleaner.js quét kiểm toán một thư mục mục tiêu. Script phải nhận diện các file rác (.tmp, .bak, .old, .log cũ quá 7 ngày), tính toán tổng dung lượng có thể thu hồi, hỗ trợ cờ --dry-run (chỉ quét và báo cáo, không xóa thật), và khi chạy ở chế độ thực thi thật thì xuất một bản kê khai kiểm toán JSON (audit manifest) lưu tại C:\\Users\\Nam\\Desktop\\gemini\\2026-10-24\\disk_cleanup_manifest.json ghi lại danh sách file đã dọn, thời gian và dung lượng byte đã giải phóng. Script phải có xử lý ngoại lệ an toàn và tự chạy tạo manifest mẫu.',
        'safe_disk_cleaner.js'
    );
}

run();

