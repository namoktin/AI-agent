# Báo cáo Phân tích Kiến trúc Codebase & Định vị Rò rỉ Bộ nhớ (Memory Leak Audit)

**Ngày quét:** 2026-03-31  
**Kỹ sư thực hiện:** Kỹ Sư Trưởng Backend (Lead Coder) - Hội Đồng Xử Lý Lỗi Hệ Thống & Tối Ưu Node.js  
**Đối tượng quét:** Toàn bộ codebase dự án (`package.json`, `server.js`, `index.html`)  

---

## 1. Sơ đồ Kiến trúc Tổng quan Codebase

Dự án hiện tại là một **Autonomous Agent Web Application** chạy trên nền tảng **Node.js + Express** ở backend và giao diện đơn trang **HTML/Tailwind CSS** ở frontend. Cấu trúc bao gồm các tệp mã nguồn chính sau:

1. **`server.js` (~181KB, 3713 dòng):** Tệp điều khiển backend cốt lõi. Chứa toàn bộ API endpoints (quản lý file, hệ thống snapshot/rollback, chạy lệnh CMD, web search, bộ đa tầng chống bot Puppeteer Extra Stealth, Jina AI Reader, Custom AI Provider Gateway, và Kho trí nhớ tự học `experiences.json`).
2. **`package.json`:** Khai báo cấu hình dự án, quản lý dependencies (`express`, `cors`, `puppeteer-core`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`).
3. **`index.html` (~394KB):** Giao diện bảng điều khiển (Dashboard UI) của trợ lý AI Agent.
4. **`memory/experiences.json` & `memory/EXPERIENCES.md`:** Kho tri thức dài hạn và lịch sử bài học kinh nghiệm tích lũy của AI Agent.
5. **`.snapshots/`:** Thư mục lưu trữ các bản sao lưu tự động trước khi sửa đổi file mã nguồn.

---

## 2. Kết quả Rà soát Rò rỉ Bộ nhớ (Memory Leak Analysis)

Sau khi quét sâu vào `server.js` và các cấu trúc thời gian chạy (Runtime), chúng tôi đã định vị được **3 nhóm điểm tiềm ẩn rò rỉ bộ nhớ & nghẽn luồng** cần được chú ý và xử lý tối ưu:

### 🔴 Nhóm 1: Tiến trình Daemon Chạy Ngầm (`activeDaemons` Map)
* **Vị trí trong mã nguồn:** `server.js` (dòng định nghĩa `const activeDaemons = new Map();` và API `/api/manage-daemon`).
* **Nguyên nhân tiềm ẩn:** 
  * Khi người dùng khởi chạy các tiến trình nền dài hạn (`action === 'start'`), các đối tượng tiến trình `child_process` (spawn/exec) và mảng log (`daemonRecord.logs`) được lưu trữ vĩnh viễn trong bộ nhớ RAM (`activeDaemons` Map).
  * Mảng `daemonRecord.logs` giới hạn ở 500 dòng nhưng nếu có nhiều daemons chạy đồng thời hoặc sinh log liên tục tần suất cao (stdout/stderr data listeners), RAM sẽ bị chiếm dụng dần nếu không có cơ chế tự động dọn dẹp (garbage collection) các daemon đã dừng (`EXITED` / `STOPPED`).
* **Giải pháp khắc phục:** Bổ sung cơ chế tự động xóa bỏ (cleanup) các daemon đã dừng quá 1 giờ hoặc giới hạn tổng số lượng daemon tối đa trong Map.

### 🟡 Nhóm 2: Bộ đệm Trình duyệt Ẩn danh Puppeteer (`puppeteer.launch`)
* **Vị trí trong mã nguồn:** `server.js` (các API `/api/browse-web` và `/api/export-design`, `api/fetch-webpage`).
* **Nguyên nhân tiềm ẩn:**
  * Mỗi lần gọi cào web hoặc xuất ảnh/PDF, Puppeteer khởi chạy một phiên bản trình duyệt mới (`puppeteer.launch`). 
  * Mặc dù trong code đã có các khối `try...finally` gọi `await browser.close()`, nhưng trong trường hợp xảy ra ngoại lệ không mong muốn (Timeout, network drop đột ngột, hoặc hủy kết nối HTTP giữa chừng từ client), tiến trình Chrome mồ côi (orphan chrome processes) có thể bị kẹt lại trên hệ thống điều hành, ngốn RAM và CPU.
* **Giải pháp khắc phục:** Bổ sung trình dọn dẹp tiến trình Chrome mồ côi định kỳ (orphan process killer) hoặc giới hạn concurrency queue cho các tác vụ Puppeteer.

### 🟢 Nhóm 3: Nghẽn Luồng Event Loop do Đồng bộ Hóa Dữ liệu Trí nhớ Lớn (`fs.readFileSync` / `writeFileSync`)
* **Vị trí trong mã nguồn:** `server.js` (các API đọc/ghi `experiences.json`).
* **Nguyên nhân tiềm ẩn:**
  * Các hàm `fs.readFileSync` và `fs.writeFileSync` được thực thi đồng bộ (synchronous). Khi file `experiences.json` phình to qua thời gian (hàng nghìn bài học), thao tác phân tích cú pháp JSON (`JSON.parse` / `JSON.stringify`) trên main thread sẽ gây ra hiện tượng chặn luồng (Event Loop Blocking), làm tăng độ trễ phản hồi của Express server.
* **Giải pháp khắc phục:** Chuyển sang sử dụng các luồng bất đồng bộ (`fs.promises.readFile` / `writeFile`) hoặc áp dụng phân trang/bộ đệm trong RAM cho kho trí nhớ.

---

## 3. Tổng kết & Đề xuất Hành động Tiếp theo

Codebase hiện tại được cấu trúc rất chặt chẽ, có cơ chế tự động sao lưu Snapshot (`.snapshots`), kiểm tra cú pháp trước khi ghi (`Pre-flight Syntax Check`), và hệ thống phòng thủ bot đa tầng tiên tiến. Để duy trì sự ổn định tối đa cho môi trường Production, chúng tôi khuyến nghị:
1. Theo dõi sát sao lượng RAM tiêu thụ khi chạy các tiến trình Daemon nền.
2. Thực hiện định kỳ lệnh tinh lọc kho trí nhớ `/api/prune-experiences` để giữ dung lượng tệp JSON gọn gàng.
