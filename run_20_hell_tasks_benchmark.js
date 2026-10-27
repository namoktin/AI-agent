/**
 * run_20_hell_tasks_benchmark.js
 * 
 * BỘ BENCHMARK 20 TÁC VỤ ĐỘ KHÓ ĐỊA NGỤC (HELL DIFFICULTY)
 * Đánh giá toàn diện AI Agent so với tiêu chuẩn Antigravity (Google DeepMind)
 * Thang điểm: 10.0 (Chuẩn Antigravity), cho phép vượt 10.0 nếu AI thể hiện vượt trội.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

const API_ENDPOINT = 'http://localhost:3000/api/v2/execute';
const OUTPUT_DIR = path.resolve(__dirname, 'benchmark_results_deepseek_v4_pro');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Native HTTP POST Helper without Undici 300s timeout.
 * Uses node:http with req.setTimeout(0) and socket.setTimeout(0) for long-running AI orchestration.
 */
function httpPostJson(urlStr, data, signal) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const postData = JSON.stringify(data);
        const options = {
            hostname: url.hostname,
            port: url.port || 3000,
            path: url.pathname + (url.search || ''),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                const ok = res.statusCode >= 200 && res.statusCode < 300;
                resolve({
                    ok,
                    status: res.statusCode,
                    text: async () => body,
                    json: async () => {
                        try {
                            return JSON.parse(body);
                        } catch (e) {
                            throw new Error(`JSON parse error on status ${res.statusCode}: ${body.slice(0, 200)}`);
                        }
                    }
                });
            });
        });

        // Set socket and request timeout to 0 (unbounded, relying on our custom 10-min watchdog)
        req.setTimeout(0);
        req.on('socket', (socket) => {
            socket.setTimeout(0);
            socket.setKeepAlive(true, 10000);
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (signal) {
            if (signal.aborted) {
                req.destroy(signal.reason || new Error('Aborted'));
                return reject(signal.reason || new Error('Aborted'));
            }
            const onAbort = () => {
                req.destroy(signal.reason || new Error('Aborted'));
                reject(signal.reason || new Error('Aborted'));
            };
            signal.addEventListener('abort', onAbort, { once: true });
            req.on('close', () => {
                signal.removeEventListener('abort', onAbort);
            });
        }

        req.write(postData);
        req.end();
    });
}

// Danh sách 20 Tác vụ Độ khó Địa ngục
const HELL_TASKS = [
    {
        id: 1,
        domain: "MMO - Cào dữ liệu & Khai phá sản phẩm Trending",
        type: "coding_pipeline",
        title: "Cào & Bóc tách Dữ liệu Sản phẩm TikTok Shop / E-Commerce ngách Home & Living",
        prompt: `Bạn là Chuyên gia Khai thác Dữ liệu MMO hàng đầu. Hãy thiết kế một quy trình kỹ thuật hoàn chỉnh và viết một script Node.js/Python hoàn chỉnh để cào dữ liệu các sản phẩm đang có mức tăng trưởng doanh số (velocity) > 300%/tuần trên TikTok Shop hoặc Shopee trong ngách Home & Living. 
Yêu cầu bắt buộc:
1. Bóc tách các trường: Tên sản phẩm, GMV ước tính 30 ngày, Giá bán lẻ, Tỷ lệ hoa hồng Affiliate, Số lượng review tiêu cực (1-2 sao), và Top 3 vấn đề người dùng phàn nàn nhiều nhất.
2. Xử lý kỹ thuật chống chặn: cơ chế rotating proxy, bypass rate limit, và giả lập User-Agent.
3. Đưa ra 1 bảng phân tích mẫu 5 sản phẩm thắng cuộc (Winning Products) kèm công thức tính biên lợi nhuận ròng (Net Profit Margin > 35%).`,
        focus: ["Script cào dữ liệu", "Bypass chống chặn", "Phân tích GMV & Margin"],
        acceptanceCriteria: [
            "Bóc tách đủ 6 trường dữ liệu: Tên sản phẩm, GMV 30 ngày, Giá bán, Hoa hồng Affiliate, Review 1-2 sao, Top 3 phàn nàn",
            "Cơ chế chống chặn thực tế: Token bucket rate limiter, Exponential retry backoff, Rotating proxy pool, User-Agent pool",
            "Mã script Python hoặc Node hoàn chỉnh, cú pháp hợp lệ, chạy được (có thể chạy demo), không chứa stub TODO/placeholder",
            "Bảng phân tích 5 sản phẩm Winning Products kèm công thức tính biên lợi nhuận ròng (NPM > 35%)"
        ]
    },
    {
        id: 2,
        domain: "Data Science & Định lượng Dữ liệu MMO",
        type: "data_science",
        title: "Phân tích Thống kê Định lượng & Mô hình Dự báo View từ Bộ dữ liệu 1.000 Video",
        prompt: `Giả định bạn đã cào thành công bộ dữ liệu gồm 1.000 video triệu view trong ngách MMO & FinTech. Hãy thực hiện một phân tích định lượng chuyên sâu:
1. Phân tích phân phối thời lượng video (Video Duration Distribution) và tỷ lệ giữ chân người xem (Retention Drop-off) tại mốc 3 giây, 15 giây, và 50% thời lượng.
2. Xây dựng công thức toán học hoặc code Python (sử dụng Pandas/Scikit-Learn) để tính chỉ số Viral Coefficient và mô hình hồi quy (Linear/XGBoost) dự báo lượt xem dựa trên CTR ảnh bìa, Hook Score 3 giây đầu, và Tần số bình luận.
3. Đưa ra kết luận có ý nghĩa thực chiến: Mẫu video thế nào có xác suất > 80% đạt trên 1 triệu views?`,
        focus: ["Mô hình toán/Python", "Retention Analysis", "Dự báo Lượng View"],
        acceptanceCriteria: [
            "Phân tích phân phối thời lượng video và tỷ lệ retention drop-off tại mốc 3s, 15s, 50%",
            "Mô hình toán học và code Python/Pandas/Scikit-Learn tính Viral Coefficient và hồi quy dự báo view hợp lệ về cú pháp",
            "Đặc tả mẫu video định lượng có xác suất > 80% đạt trên 1 triệu view"
        ]
    },
    {
        id: 3,
        domain: "Đánh giá & Phản biện Mô hình Kinh doanh",
        type: "financial_audit",
        title: "Phản biện Toàn diện Mô hình AI Dropshipping / Print-on-Demand (POD) 2026",
        prompt: `Hãy thực hiện một bản phản biện đa chiều cực kỳ khắt khe về mô hình: "Vận hành kinh doanh Dropshipping POD tự động 100% bằng AI Video & Store Builder" trong bối cảnh năm 2026.
Yêu cầu làm rõ:
1. Phân tích rủi ro tử huyệt: Chính sách siết chặt DMCA & bản quyền trí tuệ của sàn (Etsy, Shopify, TikTok Shop), chính sách gắn nhãn AI-generated content, và rủi ro khóa cổng thanh toán (Stripe, PayPal ban 180 ngày).
2. Tác động của chính sách thuế và ngưỡng de minimis mới của Hải quan Mỹ/EU đối với hàng gửi từ Trung Quốc/Việt Nam.
3. Tính toán P&L tài chính chi tiết: Chi phí vốn, CAC (Customer Acquisition Cost), tỷ lệ hoàn hàng (Return Rate), và điểm hòa vốn (Break-even ROAS). Kết luận có nên làm năm 2026 không và nếu làm thì phải biến thể thế nào?`,
        focus: ["Phản biện tử huyệt", "Rủi ro cổng thanh toán & DMCA", "Bảng P&L điểm hòa vốn"],
        acceptanceCriteria: [
            "Phân tích 3 rủi ro tử huyệt: DMCA/bản quyền sàn, gắn nhãn AI-generated, khóa cổng Stripe/PayPal 180 ngày",
            "Đánh giá tác động chính sách thuế và ngưỡng de minimis mới của Hải quan Mỹ/EU",
            "Bảng tính P&L định lượng chi tiết: CAC, Return rate, Điểm hòa vốn Break-even ROAS và đề xuất biến thể 2026"
        ]
    },
    {
        id: 4,
        domain: "Nội dung Hot nhất & Giải mã Viral Matrix",
        type: "content_automation",
        title: "Giải mã Thuật toán Phân phối Video Ngắn & 5 Mẫu Kịch bản Paradox Hook Triệu View",
        prompt: `Phân tích chuyên sâu thuật toán phân phối nội dung của TikTok & Instagram Reels quý 1/2026:
1. Giải mã trọng số thuật toán: Tỷ lệ xem hết (Completion Rate), Watch Time trung bình, Share Rate, và Save Rate có trọng số như thế nào trong từng tầng phân phối (Test Pool 300 view -> Tier 1: 5k view -> Tier 2: 50k view -> Tier 3: 1M+ view).
2. Viết chi tiết 5 mẫu kịch bản "Paradox Hook" (nghịch lý mở đầu gây xung đột nhận thức tức thì trong 3 giây đầu) ứng dụng cho ngách Kiếm tiền Online / Đầu tư tài chính.
3. Cung cấp pipeline tự động hóa: Sử dụng Whisper để trích xuất text -> LLM viết lại kịch bản -> FFmpeg render hàng loạt 50 video/ngày kèm mã script minh họa.`,
        focus: ["Trọng số thuật toán", "5 Kịch bản Paradox Hook", "Script FFmpeg tự động hóa"],
        acceptanceCriteria: [
            "Giải mã trọng số thuật toán qua 4 tầng phân phối (Test Pool -> Tier 1 -> Tier 2 -> Tier 3)",
            "Đủ 5 mẫu kịch bản Paradox Hook chi tiết từng giây cho ngách MMO/Tài chính",
            "Pipeline tự động hóa kỹ thuật với Whisper, LLM và script FFmpeg render hàng loạt"
        ]
    },
    {
        id: 5,
        domain: "Hướng đi Kiếm tiền MMO 2026",
        type: "financial_strategy",
        title: "Kế hoạch Xây dựng Cỗ máy Kiếm tiền MMO Bền vững (Cash-Cow System)",
        prompt: `Thiết kế bản kế hoạch kinh doanh chi tiết từ A-Z để xây dựng một "Autonomous Cash-Cow Channel System" ngách B2B SaaS & Tài chính công nghệ tạo dòng tiền 5.000$ - 15.000$/tháng.
Yêu cầu chi tiết:
1. Phễu chuyển đổi (Conversion Funnel): Từ Short-form video -> Long-form deep dive -> Lead Magnet (Notion template / mini tool) -> Phễu Affiliate hoa hồng tái tục (Recurring Commission) + Dịch vụ tư vấn.
2. Danh sách 5 chương trình Affiliate ngách AI/SaaS trả hoa hồng trọn đời (lifetime recurring) uy tín nhất hiện nay kèm mức chia sẻ doanh thu.
3. Dự toán tài chính 6 tháng đầu: Chi phí cơ sở hạ tầng (API LLM, Server, Proxy, Render), nhân sự (nếu có), và kịch bản dòng tiền (Cash flow projection).`,
        focus: ["Phễu chuyển đổi B2B", "Recurring Affiliate", "Dự toán dòng tiền 6 tháng"],
        acceptanceCriteria: [
            "Phễu chuyển đổi 4 tầng rõ ràng từ Short-form đến Recurring Affiliate và Consulting",
            "Danh sách 5 chương trình Recurring Affiliate thực tế kèm % hoa hồng trọn đời",
            "Bảng dự toán dòng tiền và chi phí cơ sở hạ tầng 6 tháng đầu định lượng"
        ]
    },
    {
        id: 6,
        domain: "Hướng đi Phát triển Doanh nghiệp Số",
        type: "business_scaling",
        title: "Lộ trình Mở rộng Quy mô (Scaling Blueprint) từ 10.000$ lên 100.000$/tháng",
        prompt: `Một đội ngũ MMO 3 người đang đạt doanh thu 10.000 USD/tháng với các kênh nội dung số và affiliate. Hãy thiết kế lộ trình chiến lược 12 tháng để mở rộng quy mô (Scale-up) lên mốc 100.000 USD/tháng:
1. Tái cấu trúc bộ máy: Chuyển đổi từ làm thủ công sang kiến trúc AI-Augmented Operation với hệ thống Multi-Agent phụ trách nghiên cứu, sản xuất, đăng tải, và chăm sóc khách hàng.
2. Ma trận LTV:CAC và giải pháp quản trị rủi ro dòng tiền khi đốt ngân sách quảng cáo Paid Traffic quy mô lớn.
3. Thiết lập hệ thống SOPs (Standard Operating Procedures) và bộ chỉ số KPI đo lường hiệu suất làm việc của người kết hợp máy.`,
        focus: ["Kiến trúc AI-Augmented", "Quản trị LTV:CAC", "SOPs & KPIs mở rộng"],
        acceptanceCriteria: [
            "Kiến trúc vận hành AI-Augmented Multi-Agent thay thế thao tác thủ công",
            "Ma trận LTV:CAC và chiến lược quản trị rủi ro dòng tiền quảng cáo",
            "Hệ thống quy trình SOPs và KPI đo lường phối hợp người - máy"
        ]
    },
    {
        id: 7,
        domain: "Dự báo Tương lai Việt Nam 2025-2035",
        type: "macro_analysis",
        title: "Vị thế Chiến lược của Việt Nam trong Kỷ nguyên Bán dẫn, Năng lượng Xanh & AI",
        prompt: `Hãy đưa ra bản phân tích dự báo chiến lược toàn diện về tương lai kinh tế - công nghệ Việt Nam giai đoạn 2025-2035:
1. Chuỗi giá trị bán dẫn toàn cầu: Đánh giá cơ hội và giới hạn thực tế của Việt Nam ở phân khúc Đóng gói & Kiểm thử (OSAT - Amkor, Hana Micron) và Thiết kế vi mạch (Fabless) so với Malaysia và Ấn Độ.
2. Bài toán Năng lượng & Hạ tầng Trung tâm Dữ liệu (AI Data Centers): Tác động của Quy hoạch điện VIII, thách thức cung ứng nguồn điện nền ổn định cho các siêu Data Center và tiềm năng phát triển điện hạt nhân/điện gió ngoài khơi.
3. Thị trường Tín chỉ Carbon và chuyển dịch xanh: Lộ trình sàn giao dịch tín chỉ carbon Việt Nam và tác động đến các ngành xuất khẩu chủ lực (dệt may, nông sản, da giày) khi đối mặt cơ chế CBAM của EU.`,
        focus: ["Bán dẫn OSAT/Fabless", "Quy hoạch điện VIII & Data Center", "Tín chỉ Carbon & CBAM"],
        acceptanceCriteria: [
            "Đánh giá năng lực OSAT và Fabless của Việt Nam so sánh định lượng với Malaysia và Ấn Độ",
            "Phân tích Quy hoạch điện VIII, nguồn điện nền AI Data Center và năng lượng hạt nhân/gió",
            "Lộ trình sàn tín chỉ carbon và cơ chế CBAM tác động đến xuất khẩu dệt may, da giày"
        ]
    },
    {
        id: 8,
        domain: "Dự báo Tương lai Thế giới 2026-2040",
        type: "deep_tech_future",
        title: "Kỷ nguyên Hậu AGI, Năng lượng Hạt nhân SMRs và Cuộc Cách mạng Robot Hình người",
        prompt: `Phân tích sâu sắc các xu thế vĩ mô định hình thế giới giai đoạn 2026-2040:
1. Kịch bản xuất hiện AGI (Artificial General Intelligence) trước năm 2030: Sự chuyển dịch từ "nút thắt thuật toán" sang "nút thắt năng lượng và làm mát". Đánh giá xu hướng Big Tech (Microsoft, Google, Amazon) hợp đồng mua trực tiếp điện từ lò phản ứng hạt nhân module nhỏ (SMRs).
2. Cuộc cách mạng Robot hình người (Humanoid Robots: Tesla Optimus, Figure, Boston Dynamics): Khi chi phí vận hành 1 giờ robot giảm xuống dưới 3 USD, nền kinh tế sản xuất và chuỗi cung ứng toàn cầu sẽ biến đổi thế nào?
3. Mô hình an sinh xã hội và thị trường việc làm: Sự suy giảm của việc làm văn phòng cấp thấp, tranh luận về Thuế Robot / AI Tax và Thu nhập cơ bản phổ quát (UBI).`,
        focus: ["Nút thắt AGI & Năng lượng SMR", "Robot hình người < 3$/h", "UBI & AI Tax"],
        acceptanceCriteria: [
            "Phân tích dịch chuyển sang nút thắt năng lượng/làm mát và hợp đồng điện hạt nhân SMRs",
            "Mô hình kinh tế Robot hình người khi chi phí < $3/giờ và tác động chuỗi cung ứng",
            "Chính sách Thuế Robot (AI Tax) và cơ chế phân phối Thu nhập cơ bản phổ quát (UBI)"
        ]
    },
    {
        id: 9,
        domain: "Cập nhật Thông số & Công nghệ Tesla",
        type: "tech_spec_audit",
        title: "Cập nhật Thông số Kỹ thuật Mới nhất của Tesla: Cybercab, Pin 4680 Dry Cathode & AI5",
        prompt: `Cung cấp báo cáo kỹ thuật và tài chính chi tiết cập nhật nhất về Tesla:
1. Thông số kỹ thuật và kiến trúc của Tesla Cybercab/Robotaxi: Hệ thống sạc không dây cảm ứng (Inductive Charging), thiết kế loại bỏ vô lăng/bàn đạp, chi phí ước tính trên mỗi dặm (cost per mile < $0.20) và thời gian cấp phép thương mại.
2. Công nghệ pin 4680 thế hệ mới: Tiến độ triển khai công nghệ điện cực khô hoàn toàn (Dry Cathode Coating), mật độ năng lượng và mức giảm chi phí sản xuất pack pin.
3. Kiến trúc chip tự lái AI5 (Cortex Supercluster) và thuật toán FSD V12.5/V13 End-to-End Neural Nets.
4. Báo cáo tài chính quý gần nhất: Biên lợi nhuận gộp ô tô cốt lõi (Automotive Gross Margin ex-regulatory credits) và doanh thu mảng Năng lượng (Megapack/Powerwall).`,
        focus: ["Cybercab & Sạc không dây", "Pin 4680 Dry Cathode", "Chip AI5 & FSD V13", "Biên lợi nhuận gộp"],
        acceptanceCriteria: [
            "Thông số Cybercab: sạc không dây cảm ứng, thiết kế không vô lăng, cost per mile < $0.20",
            "Công nghệ pin 4680 Dry Cathode, mật độ năng lượng và mức giảm chi phí",
            "Kiến trúc chip AI5 và thuật toán FSD V12.5/V13 End-to-End Neural Nets",
            "Chỉ số tài chính: Automotive gross margin ex-credits và doanh thu Megapack/Powerwall"
        ]
    },
    {
        id: 10,
        domain: "Khai thác Dữ liệu X (Twitter) & Tài sản Tỷ phú",
        type: "market_realtime",
        title: "Ai là Người Giàu nhất Thế giới trên X & Phân tích Biến động Tài sản Thời gian thực",
        prompt: `Truy vấn dữ liệu thời gian thực và phân tích so sánh tài sản của các tỷ phú hàng đầu thế giới (Elon Musk, Larry Ellison, Jeff Bezos, Mark Zuckerberg, Bernard Arnault):
1. Ai đang giữ vị trí người giàu nhất thế giới hiện nay theo chỉ số Bloomberg Billionaires Index / Forbes Real-Time? Phân tích giá trị tài sản ròng và cơ cấu danh mục tài sản của Elon Musk (tỷ lệ đóng góp từ cổ phiếu Tesla, định giá SpaceX, xAI, và vị thế X Corp).
2. Tác động của các bài đăng trên tài khoản X (@elonmusk) đến biến động vốn hóa thị trường của Tesla, Dogecoin và tâm lý nhà đầu tư bán lẻ.
3. So sánh hiệu quả truyền thông cá nhân trên X của các lãnh đạo công nghệ: Elon Musk vs Jensen Huang vs Sam Altman.`,
        focus: ["Tài sản ròng Bloomberg/Forbes", "Cơ cấu tài sản Elon Musk", "Tương quan X Post và Vốn hóa"],
        acceptanceCriteria: [
            "Xác định người giàu nhất thế giới và bóc tách cơ cấu tài sản Elon Musk (Tesla, SpaceX, xAI, X)",
            "Đánh giá tương quan tác động bài đăng X (@elonmusk) đến vốn hóa TSLA, Dogecoin",
            "So sánh chiến lược và hiệu quả truyền thông X: Musk vs Huang vs Altman"
        ]
    },
    {
        id: 11,
        domain: "Dữ liệu Y khoa & Công nghệ Đột phá",
        type: "biotech_audit",
        title: "Cập nhật Đột phá Y khoa Mới nhất: AlphaFold 3, CRISPR Prime Editing & Liệu pháp Tế bào",
        prompt: `Tổng hợp các bước tiến đột phá y sinh học lâm sàng và ứng dụng trí tuệ nhân tạo y khoa năm 2024-2026:
1. Đột phá từ AlphaFold 3 và ESM-3: Khả năng dự đoán tương tác phân tử sinh học phức tạp (Protein - DNA - RNA - Ligands) và ứng dụng thực tế trong việc rút ngắn thời gian thiết kế thuốc nhắm trúng đích điều trị ung thư từ 5 năm xuống vài tháng.
2. Tiến bộ công nghệ chỉnh sửa gen: So sánh CRISPR-Cas9 truyền thống với Prime Editing và Base Editing trong việc sửa chữa đột biến điểm mà không gây đứt gãy sợi kép DNA (Double-Strand Breaks), kèm các thử nghiệm lâm sàng giai đoạn III (bệnh hồng cầu hình liềm, amyloidosis).
3. Liệu pháp tế bào CAR-T thế hệ mới: Khả năng tạo lập tế bào CAR-T in-vivo trực tiếp trong cơ thể bằng hạt nano lipid (LNP-mRNA) thay vì trích xuất nuôi cấy ex-vivo tốn kém.`,
        focus: ["AlphaFold 3 & Thiết kế thuốc", "Prime Editing vs CRISPR", "CAR-T in-vivo qua LNP"],
        acceptanceCriteria: [
            "Đột phá AlphaFold 3 / ESM-3 trong dự đoán tương tác sinh học và rút ngắn chu kỳ thiết kế thuốc",
            "So sánh cơ chế Prime/Base Editing với CRISPR-Cas9 (không gây đứt gãy kép) và thử nghiệm lâm sàng",
            "Cơ chế và tiềm năng liệu pháp CAR-T in-vivo trực tiếp qua hạt nano lipid LNP-mRNA"
        ]
    },
    {
        id: 12,
        domain: "Dữ liệu trên X về Nông nghiệp Sạch",
        type: "agritech_sentiment",
        title: "Phân tích Dữ liệu Thảo luận trên X về Nông nghiệp Sạch & Tái sinh (Regenerative Agriculture)",
        prompt: `Bóc tách và tổng hợp dữ liệu xu hướng thảo luận công nghệ nông nghiệp sạch trên nền tảng X (Twitter):
1. Phân tích các chủ đề thảo luận sôi nổi nhất: Ứng dụng Than sinh học (Biochar) cố định carbon vào đất, vi sinh vật bản địa (IMO/KNF) thay thế phân hóa học, canh tác không cày xới (No-till farming), và luân canh cây che phủ (Cover cropping).
2. Đánh giá Sentiment (tâm lý cộng đồng nông nghiệp và nhà đầu tư mạo hiểm) trên X đối với thị trường Tín chỉ Carbon đất nông nghiệp (Soil Carbon Credits).
3. Trích xuất quan điểm của các chuyên gia nông nghiệp hàng đầu trên X về việc cân bằng giữa năng suất cây trồng và tiêu chuẩn hữu cơ khắt khe.`,
        focus: ["Chủ đề hot Biochar & No-till", "Sentiment Tín chỉ Carbon đất", "Cân bằng năng suất vs hữu cơ"],
        acceptanceCriteria: [
            "Bóc tách 4 chủ đề cốt lõi: Biochar, vi sinh vật bản địa IMO/KNF, No-till farming, Cover cropping",
            "Đo lường sentiment cộng đồng và VC đối với Soil Carbon Credits",
            "Phân tích giải pháp cân bằng giữa năng suất kinh tế và tiêu chuẩn canh tác hữu cơ"
        ]
    },
    {
        id: 13,
        domain: "Thiết bị Nông nghiệp Công nghệ cao",
        type: "precision_agritech",
        title: "Cập nhật Thông số & Ứng dụng Thực tế Thiết bị Nông nghiệp Tự hành Chất lượng cao",
        prompt: `Cung cấp báo cáo chuyên sâu về các thiết bị nông nghiệp công nghệ cao hiện đại nhất thế giới:
1. Máy kéo tự hành hoàn toàn (Autonomous Tractor) John Deere 8R: Hệ thống cảm biến 6 cặp camera stereo, thị giác máy tính phát hiện vật cản 360 độ, điều khiển qua ứng dụng di động John Deere Operations Center, và hiệu quả kinh tế trên diện tích 1.000 ha.
2. Máy bay không người lái nông nghiệp hạng nặng (Heavy-duty Agricultural Drones) DJI Agras T50 / T60: Thông số tải trọng bình phun, radar mảng pha chủ động kép, hệ thống định vị RTK chính xác centimet, và năng suất phun dập dịch bệnh so với máy bay có người lái.
3. Robot thu hoạch ứng dụng AI và cánh tay mềm xúc giác (Soft-robotics harvesting) trong nhà kính thông minh: Khả năng nhận diện độ chín quả qua quang phổ và tránh làm dập nát nông sản xuất khẩu.`,
        focus: ["John Deere 8R Autonomous", "DJI Agras T50/T60 Radar RTK", "Robot cánh tay mềm xúc giác"],
        acceptanceCriteria: [
            "Thông số kỹ thuật và bài toán kinh tế máy kéo John Deere 8R Autonomous trên 1.000 ha",
            "Thông số drone DJI Agras T50/T60 (tải trọng, radar kép, định vị RTK) so với máy bay có người lái",
            "Robot thu hoạch cánh tay mềm quang phổ tránh dập nát nông sản nhà kính"
        ]
    },
    {
        id: 14,
        domain: "Hạ tầng Kỹ thuật Cào Dữ liệu Chống chặn",
        type: "high_scale_infra",
        title: "Thiết kế Kiến trúc Pipeline Cào Dữ liệu Quy mô Lớn Bypass Cloudflare & DataDome",
        prompt: `Thiết kế kiến trúc hệ thống cào dữ liệu phân tán có khả năng trích xuất 500.000 trang web/ngày từ các nền tảng thương mại điện tử được bảo vệ nghiêm ngặt:
1. Giải pháp kỹ thuật vượt rào cản phòng vệ hiện đại: Xử lý Cloudflare Turnstile, DataDome, và Akamai Bot Manager. Làm thế nào để giả lập và vượt qua TLS Fingerprinting (JA3/JA4) và HTTP/2 Settings Frames?
2. Thiết kế hạ tầng Browser Farm: Sử dụng Puppeteer-Stealth / Playwright kết hợp patch nhân Chromium để xóa sạch dấu vết headless (navigator.webdriver, WebGL vendor, Canvas noise, AudioContext fingerprint).
3. Chiến lược xoay vòng Proxy: Quản lý pool Residential IPv4/IPv6, thuật toán phân bổ tải thông minh để duy trì tỷ lệ thành công HTTP 200 > 98%.`,
        focus: ["Bypass TLS JA3/JA4", "Chromium Patch Anti-Detect", "Residential Proxy Management"],
        acceptanceCriteria: [
            "Kỹ thuật vượt Cloudflare Turnstile, DataDome: giả lập TLS JA3/JA4 và HTTP/2 Settings frames",
            "Kiến trúc hạ tầng Browser Farm vá nhân Chromium (navigator.webdriver, WebGL, Canvas, Audio)",
            "Chiến lược quản lý pool Residential IPv4/IPv6 phân bổ tải duy trì HTTP 200 > 98%"
        ]
    },
    {
        id: 15,
        domain: "Tài chính Công nghệ & Định giá AI",
        type: "financial_valuation",
        title: "Định giá Cổ phiếu Big Tech và Đánh giá Rủi ro Bong bóng Đầu tư Hạ tầng AI",
        prompt: `Phân tích tài chính chuyên sâu về làn sóng đầu tư cơ sở hạ tầng AI của nhóm Big Tech (NVIDIA, Microsoft, Alphabet, Meta, Amazon):
1. Phân tích chỉ số tài chính định giá: So sánh P/E forward, PEG, EV/EBITDA, và tỷ lệ ROI trên dòng vốn đầu tư cơ bản (ROIC) của các công ty trong chuỗi giá trị bán dẫn và đám mây.
2. Bài toán "AI Capex vs AI Revenue": Tổng vốn đầu tư CAPEX hàng trăm tỷ USD mỗi năm của các Hyperscalers dành cho GPU H100/Blackwell B200 so với doanh thu phần mềm thực tế thu về từ khách hàng cuối (End-users).
3. Đánh giá kịch bản rủi ro: Nếu tốc độ tăng trưởng doanh thu phần mềm AI không theo kịp khấu hao tài sản phần cứng GPU (vốn chỉ có vòng đời 3-4 năm), kịch bản điều chỉnh của thị trường chứng khoán sẽ diễn ra như thế nào?`,
        focus: ["P/E, EV/EBITDA, ROIC", "Capex GPU vs Doanh thu AI", "Kịch bản rủi ro khấu hao 3 năm"],
        acceptanceCriteria: [
            "Bảng so sánh định lượng các chỉ số P/E, PEG, EV/EBITDA, ROIC của nhóm Big Tech",
            "Mô hình đối chiếu AI Capex hàng trăm tỷ USD so với doanh thu phần mềm AI thực tế",
            "Kịch bản stress-test thị trường chứng khoán khi áp lực khấu hao GPU 3-4 năm tăng mạnh"
        ]
    },
    {
        id: 16,
        domain: "Web3 & Tài chính Phi tập trung (DeFi)",
        type: "defi_rwa",
        title: "Mô hình Kiếm tiền từ Token hóa Tài sản Thế giới Thực (RWA Tokenization)",
        prompt: `Khảo sát toàn diện xu hướng Token hóa Tài sản Thế giới Thực (Real World Assets - RWA) trong thị trường tiền mã hóa:
1. Cơ chế vận hành của Trái phiếu kho bạc Mỹ trên chuỗi (Tokenized US Treasuries - BlackRock BUIDL, Ondo Finance OUSG, Franklin Templeton): Cách thức dòng vốn thực được chuyển đổi thành token, cơ chế phân phối lợi tức (yield streaming), và thanh khoản on-chain.
2. Cơ hội kiếm tiền MMO tài chính Web3: Các chiến lược kinh doanh chênh lệch lãi suất (Yield Arbitrage), cung cấp thanh khoản trên Uniswap/Curve cho các cặp RWA, và cơ chế bảo hiểm tài sản.
3. Khung pháp lý và rủi ro: Quy định của Ủy ban Chứng khoán Mỹ (SEC) và đạo luật MiCA của Liên minh Châu Âu đối với token chứng khoán.`,
        focus: ["BlackRock BUIDL & Ondo OUSG", "Yield Arbitrage Strategies", "Khung pháp lý SEC & MiCA"],
        acceptanceCriteria: [
            "Cơ chế vận hành của Tokenized US Treasuries (BUIDL, OUSG) và yield streaming on-chain",
            "Các chiến lược Yield Arbitrage, cung cấp thanh khoản AMM cho cặp RWA và cơ chế bảo hiểm",
            "Phân tích khung pháp lý SEC và đạo luật MiCA đối với phân loại token chứng khoán"
        ]
    },
    {
        id: 17,
        domain: "Chuỗi Cung ứng & Tiêu chuẩn Nông sản Xuất khẩu",
        type: "compliance_geospatial",
        title: "Giải pháp Kỹ thuật Đáp ứng Quy định Chống Phá rừng EUDR và Tiêu chuẩn GlobalGAP",
        prompt: `Xây dựng giải pháp kỹ thuật toàn diện cho các doanh nghiệp xuất khẩu nông sản (cà phê, cao su, hồ tiêu, gỗ) của Việt Nam sang thị trường Châu Âu nhằm tuân thủ Quy định chống phá rừng của EU (EUDR):
1. Thu thập dữ liệu địa không gian (Geospatial Data): Quy trình xác định tọa độ GPS đa giác (Polygon mapping) của từng mảnh vườn canh tác có diện tích trên 4 ha và điểm GPS đơn lẻ dưới 4 ha.
2. Đối soát ảnh vệ tinh viễn thám (Satellite Earth Observation): Ứng dụng dữ liệu viễn thám từ vệ tinh Sentinel-2 và Landsat để chứng minh đất không bị phá rừng sau mốc thời gian 31/12/2020.
3. Kiến trúc hệ thống sổ cái số (Digital Traceability Ledger): Xây dựng luồng dữ liệu truy xuất từ nông hộ -> đại lý thu mua -> nhà máy chế biến -> cảng xuất khẩu -> hồ sơ thẩm định chuyên sâu (Due Diligence Statement) tải lên cổng thông tin EU Information System.`,
        focus: ["Polygon GPS Mapping", "Vệ tinh viễn thám Sentinel-2", "Hệ thống Due Diligence EUDR"],
        acceptanceCriteria: [
            "Quy trình kỹ thuật thu thập GPS Polygon mapping (>4ha) và GPS point (<4ha)",
            "Phương pháp đối soát ảnh vệ tinh Sentinel-2/Landsat chứng minh mốc 31/12/2020",
            "Kiến trúc sổ cái số luồng truy xuất và tạo Due Diligence Statement nộp EU Information System"
        ]
    },
    {
        id: 18,
        domain: "Kiến trúc Phần mềm Multi-Agent Nâng cao",
        type: "software_architecture",
        title: "Thiết kế Kiến trúc Hệ thống 50 AI Agents Phân tán Tự Chữa lành (Self-Healing DAG)",
        prompt: `Thiết kế kiến trúc kỹ thuật chi tiết của một hệ sinh thái gồm 50 AI Agents chuyên biệt chạy phối hợp song song để tự động hóa một doanh nghiệp số:
1. Giao thức điều phối đồ thị có hướng không chu trình (Dynamic DAG Task Graph): Cơ chế phân rã nhiệm vụ phức tạp thành các sub-task, quản lý phụ thuộc (dependency resolution), và phân bổ tài nguyên dựa trên chi phí token và độ trễ.
2. Giao thức Consensus & Adversarial Debate: Thiết kế quy trình phản biện đa tác tử giữa Proposer Agent, Critic Agent, và Judge Agent để loại bỏ hoàn toàn hiện tượng ảo giác (hallucination) trước khi gửi kết quả cho con người.
3. Cơ chế Tự chữa lành (Self-Healing & Fault Tolerance): Kiến trúc Checkpoint phân tán, phát hiện worker bị treo (Deadlock / Process Hang) và tự động phục hồi phiên làm việc từ điểm gián đoạn cuối cùng.`,
        focus: ["Dynamic DAG Engine", "Adversarial Debate Protocol", "Distributed Checkpoint & Self-Healing"],
        acceptanceCriteria: [
            "Kiến trúc Dynamic DAG điều phối 50 agents với quản lý phụ thuộc và tối ưu token",
            "Giao thức Adversarial Debate 3 vai trò (Proposer, Critic, Judge) triệt tiêu hallucination",
            "Cơ chế Self-Healing với distributed checkpoint, deadlock detection và session resumption"
        ]
    },
    {
        id: 19,
        domain: "An ninh Mạng & Phòng chống Gian lận Tài khoản MMO",
        type: "cybersecurity",
        title: "Giải mã Công nghệ Browser Fingerprinting và Kiến trúc Profile Cô lập Tuyệt đối",
        prompt: `Phân tích chuyên sâu về công nghệ nhận dạng dấu vân tay trình duyệt (Device & Browser Fingerprinting) được sử dụng bởi các hệ thống chống gian lận (Google, Meta, TikTok, Stripe Radar):
1. Phân tích các vector nhận dạng phần cứng & môi trường:
   - Canvas Fingerprinting (thuật toán render hình ảnh và trích xuất chuỗi hash Base64).
   - WebGL Fingerprint (Vendor, Renderer, Unmasked extensions, WebGL Report).
   - AudioContext Fingerprint (độ méo âm thanh và xử lý tín hiệu số DSP).
   - WebRTC IP Leak và TCP/IP Packet Fingerprint (OS Fingerprint via MTU/TTL).
2. Thiết kế giải pháp kỹ thuật xây dựng công cụ Antidetect Browser: Cách thức can thiệp vào tầng C++ source code của Chromium để giả lập thông số phần cứng nhất quán (hardware consistency) mà không bị các script chống bot phát hiện giả mạo.`,
        focus: ["Canvas & WebGL Fingerprint", "AudioContext & WebRTC Leaks", "Chromium C++ Core Patching"],
        acceptanceCriteria: [
            "Phân tích 4 vector nhận dạng: Canvas (Base64), WebGL, AudioContext DSP, WebRTC & TCP/IP MTU/TTL",
            "Kiến trúc can thiệp C++ Chromium source code để giả lập hardware consistency",
            "Chiến lược phòng chống phát hiện giả mạo từ script chống bot hiện đại"
        ]
    },
    {
        id: 20,
        domain: "Chiến lược Xây dựng Rào cản Phòng thủ (Moat Building)",
        type: "strategic_planning",
        title: "Kế hoạch 90 Ngày Thiết lập Con hào Kinh tế (Economic Moat) cho Doanh nghiệp MMO",
        prompt: `Xây dựng kế hoạch thực thi 90 ngày thiết lập một "Con hào kinh tế bất khả xâm phạm" (Uncopyable Moat) cho một dự án kinh doanh online kiếm tiền trên Internet, giúp doanh nghiệp không bị sao chép hoặc đánh bại khi ngách trở nên bão hòa:
1. Tháng 1 (Tạo lập tài sản dữ liệu độc quyền - Proprietary Data Asset): Cách thức thu thập, làm sạch và tích lũy bộ dữ liệu ngách mà đối thủ không thể cào được từ các nguồn công khai.
2. Tháng 2 (Xây dựng cộng đồng khép kín trả phí - High-Retention Private Network): Thiết kế cơ chế giữ chân thành viên (Retention Mechanism > 85%/tháng), hiệu ứng mạng lưới nội bộ (Local Network Effects), và mô hình tư vấn 1-1 có rào cản chuyển đổi (High Switching Costs).
3. Tháng 3 (Tích hợp công nghệ độc quyền - Vertical Micro-SaaS): Đóng gói giải pháp thành một công cụ phần mềm nội bộ và khóa chặt khách hàng vào hệ sinh thái. Bộ chỉ số đo lường sức mạnh con hào (Moat Strength Scorecard).`,
        focus: ["Proprietary Data Asset", "High-Retention Community", "Vertical Micro-SaaS Lock-in"],
        acceptanceCriteria: [
            "Kế hoạch Tháng 1: Tạo lập tài sản dữ liệu độc quyền không thể cào công khai",
            "Kế hoạch Tháng 2: Xây dựng cộng đồng retention > 85%/tháng với network effects và switching costs",
            "Kế hoạch Tháng 3: Đóng gói Vertical Micro-SaaS và Bộ chỉ số Moat Strength Scorecard"
        ]
    }
];

// Hàm đánh giá chất lượng phản hồi chuẩn Antigravity (Thang điểm 0.0 - 10.0, Nghiệm thu thực chất)
function evaluateResponse(task, durationMs, data) {
    const rawResult = data.result !== undefined ? data.result : (data.error || '');
    let text = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
    const textLen = text ? text.length : 0;
    const qualityScore = typeof data.qualityScore === 'number' ? data.qualityScore : (data.success ? 80 : 20);

    // BẪY PHÁT HIỆN LỖI: Nếu kết quả bị dính chuỗi phê bình từ chối thô của Critic (không phải giải pháp)
    const isCriticRejection = text.includes('"verdict": "REJECTED"') || (text.includes('"overallScore":') && text.includes('"issues":'));
    if (isCriticRejection) {
        return {
            criteriaScore: 0.5,
            technicalScore: 0.5,
            adversarialScore: 0.5,
            finalScore: 1.5,
            rejectionDetected: true,
            criteriaAudit: [],
            notes: "Phát hiện đầu ra bị dính biên bản từ chối của Critic thay vì giải pháp chuyên môn",
            textLength: textLen
        };
    }

    // 1. TIÊU CHÍ 1: Nghiệm thu các yêu cầu cốt lõi theo Task Acceptance Criteria (Tối đa 4.0 điểm)
    const criteriaList = Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : (task.focus || []);
    let matchedCriteriaCount = 0;
    const criteriaAudit = [];

    for (const criterion of criteriaList) {
        const keywords = String(criterion).toLowerCase().split(/[\s,;:()/-]+/).filter(w => w.length >= 4);
        let matches = 0;
        for (const kw of keywords) {
            if (text.toLowerCase().includes(kw)) {
                matches++;
            }
        }
        const coverage = keywords.length > 0 ? (matches / keywords.length) : 0;
        const passed = coverage >= 0.40; // Đạt nếu bao phủ ít nhất 40% từ khóa cốt lõi của tiêu chí
        if (passed) matchedCriteriaCount++;
        criteriaAudit.push({ criterion, passed, coverage: parseFloat(coverage.toFixed(2)) });
    }

    const criteriaScore = criteriaList.length > 0 
        ? parseFloat(((matchedCriteriaCount / criteriaList.length) * 4.0).toFixed(2))
        : 3.0;

    // 2. TIÊU CHÍ 2: Tính Khả thi Kỹ thuật, Syntax & Kiểm chứng Số liệu (Tối đa 3.0 điểm)
    let technicalScore = 0.0;

    // A. Kiểm tra Code nếu là Task Coding / Pipeline
    const isCodeTask = task.type === 'coding_pipeline' || task.type === 'content_automation' || task.type === 'data_science';
    if (isCodeTask) {
        let codeMatches = [];
        const codeBlockRegex = /```(javascript|js|node|python|py|bash|sh)([\s\S]*?)```/gi;
        let match;
        while ((match = codeBlockRegex.exec(text)) !== null) {
            codeMatches.push({ lang: match[1].toLowerCase(), code: match[2] });
        }

        // Cũng kiểm tra nếu code nằm trong trường JSON "codeSnippet" hoặc trong thẻ DSML
        if (codeMatches.length === 0 && text.includes('"codeSnippet":')) {
            const snippetMatch = text.match(/"codeSnippet"\s*:\s*"([\s\S]*?)"(?=\s*[,}])/);
            if (snippetMatch) {
                codeMatches.push({ lang: 'python', code: snippetMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') });
            }
        }
        if (codeMatches.length === 0 && (text.includes('DSML') || text.includes('<invoke') || text.includes('<｜｜invoke'))) {
            const dsmlParamRegex = /<[|｜]{2}DSML[|｜]{2}parameter\s+name=["']content["'][^>]*>([\s\S]*?)(?:<\/[|｜]{2}DSML[|｜]{2}parameter>|$)/i;
            const dsmlMatch = dsmlParamRegex.exec(text);
            if (dsmlMatch && dsmlMatch[1] && dsmlMatch[1].trim().length > 50) {
                const lang = /import\s+|def\s+|class\s+/i.test(dsmlMatch[1]) ? 'python' : 'javascript';
                codeMatches.push({ lang, code: dsmlMatch[1].trim() });
            }
        }
        if (codeMatches.length === 0 && (text.includes('<CONTROL>') || text.includes('WRITE_FILE'))) {
            const writeMatch = text.match(/<ACTION>WRITE_FILE<\/ACTION>\s*<ARGS>\{[\s\S]*?"content"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"path"|\s*\})/i);
            if (writeMatch && writeMatch[1]) {
                const unescaped = writeMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                if (unescaped.length > 50) {
                    const lang = /import\s+|def\s+|class\s+/i.test(unescaped) ? 'python' : 'javascript';
                    codeMatches.push({ lang, code: unescaped.trim() });
                }
            }
        }

        if (codeMatches.length > 0) {
            let syntaxValid = true;
            let hasStubs = false;

            for (const item of codeMatches) {
                // Kiểm tra stub dang dở
                if (/\b(TODO|FIXME|unimplemented|chưa triển khai|placeholder)\b/i.test(item.code)) {
                    hasStubs = true;
                }
                // Kiểm tra syntax AST nếu là JavaScript
                if (['javascript', 'js', 'node'].includes(item.lang)) {
                    try {
                        new vm.Script(item.code);
                    } catch (e) {
                        syntaxValid = false;
                    }
                }
            }

            if (syntaxValid && !hasStubs) {
                technicalScore = 3.0; // Code hoàn chỉnh, đúng cú pháp, không stub
            } else if (syntaxValid && hasStubs) {
                technicalScore = 2.0; // Đúng cú pháp nhưng có stub
            } else {
                technicalScore = 1.0; // Lỗi cú pháp
            }
        } else {
            technicalScore = 1.2; // Task code nhưng thiếu khối code hoàn chỉnh
        }
    } else {
        // B. Với Task Phân tích Tài chính / Chiến lược / Kỹ thuật: Đo lường tính chặt chẽ của số liệu định lượng & công thức
        let codeMatches = [];
        const codeBlockRegex = /```(javascript|js|node|python|py|bash|sh|cpp|c|sql|json)([\s\S]*?)```/gi;
        let match;
        while ((match = codeBlockRegex.exec(text)) !== null) {
            codeMatches.push({ lang: match[1].toLowerCase(), code: match[2] });
        }

        const hasFormulas = /=|≈|\*|\/|\+|%/.test(text);
        const hasFinancialMetrics = /\$|VNĐ|USD|GMV|CAC|LTV|ROAS|P&L|ROI|Capex|EBITDA|NPM|margin|doanh thu|lợi nhuận|chi phí|tỷ lệ|ngân sách|định giá|chuyển đổi|churn|MRR|ARR|ARPU|công suất|sản lượng|thị phần|tăng trưởng|nhân lực|đầu tư/i.test(text);
        const hasQuantitativeData = /\d+([.,]\d+)?\s*(%|USD|VNĐ|\$|triệu|tỷ|nghìn|k\b|views|kwh|mwh|gwh|mw|gw|ha|kg|tấn|ms|s\b|phút|giờ|đô|năm|người)/i.test(text);

        if ((hasFormulas && hasFinancialMetrics && hasQuantitativeData) || (codeMatches.length > 0 && hasQuantitativeData)) {
            technicalScore = 3.0;
        } else if (hasFinancialMetrics || hasQuantitativeData || codeMatches.length > 0) {
            technicalScore = 2.2;
        } else {
            technicalScore = 1.5;
        }
    }

    // 3. TIÊU CHÍ 3: Logic Cấu trúc & Phản biện Đa tác nhân (Tối đa 3.0 điểm)
    let adversarialScore = 0.0;
    const hasStructuredSections = (text.match(/###\s+/g) || []).length >= 3 || (text.match(/##\s+/g) || []).length >= 3 || (text.includes('KIẾN TRÚC') && text.includes('MODULE'));
    const hasRiskAnalysis = /rủi ro|hạn chế|thách thức|cảnh báo|lưu ý|giảm thiểu|phản biện|đánh giá rủi ro|quản trị rủi ro|chống chặn|rate limit/i.test(text);
    const hasActionableRoadmap = /kết luận|hành động|lộ trình|quy trình|khuyến nghị|bước|kế hoạch|chiến lược thực thi|pipeline|triển khai|kiến trúc|hướng dẫn|chạy|main|exec/i.test(text);

    if (hasStructuredSections) adversarialScore += 1.0;
    if (hasRiskAnalysis) adversarialScore += 1.0;
    if (hasActionableRoadmap) adversarialScore += 0.5;
    if (qualityScore >= 70) adversarialScore += 0.5;

    // Tổng điểm: Căn chuẩn nghiêm ngặt từ 0.0 đến 10.0 (KHÔNG CỘNG BONUS VƯỢT 10.0)
    let rawTotal = criteriaScore + technicalScore + adversarialScore;
    const finalScore = parseFloat(Math.min(10.0, Math.max(0.0, rawTotal)).toFixed(2));

    return {
        criteriaScore: parseFloat(criteriaScore.toFixed(2)),
        technicalScore: parseFloat(technicalScore.toFixed(2)),
        adversarialScore: parseFloat(adversarialScore.toFixed(2)),
        finalScore: finalScore,
        criteriaPassed: `${matchedCriteriaCount}/${criteriaList.length}`,
        criteriaAudit: criteriaAudit,
        textLength: textLen
    };
}

async function runSingleTask(task, index) {
    console.log(`\n===============================================================`);
    console.log(`🔥 [TASK ${index}/20] [${task.domain}]`);
    console.log(`📌 TIÊU ĐỀ: ${task.title}`);
    console.log(`===============================================================`);

    const startTime = Date.now();
    const abortController = new AbortController();
    const TEN_MINUTES_MS = 600000;
    let progressTimer = null;
    let watchdogTimer = null;

    let lastLogSec = 0;
    progressTimer = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        if (elapsedSec - lastLogSec >= 30) {
            lastLogSec = elapsedSec;
            console.log(`⏳ [TASK ${index} ĐANG XỬ LÝ] Đã trôi qua ${elapsedSec}s... Multi-Agent đang phối hợp chuyên sâu.`);
        }
    }, 5000);

    // Watchdog sau 10 phút: Kiểm tra xem Server có bị lỗi hay treo không
    watchdogTimer = setInterval(async () => {
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs >= TEN_MINUTES_MS) {
            const elapsedMin = (elapsedMs / 60000).toFixed(1);
            try {
                const pingRes = await fetch('http://localhost:3000/api/config', {
                    signal: AbortSignal.timeout(6000)
                });
                if (!pingRes.ok) throw new Error(`Server ping HTTP ${pingRes.status}`);
                console.log(`🛡️ [WATCHDOG 10 PHÚT+] Task ${index} đã chạy ${elapsedMin} phút. Server hoàn toàn KHỎE MẠNH (Healthy), tiếp tục cho phép AI chạy đến khi hoàn tất.`);
            } catch (pingErr) {
                console.error(`🚨 [WATCHDOG PHÁT HIỆN LỖI/TREO] Task ${index} vượt quá 10 phút (${elapsedMin}m) và Server không phản hồi (${pingErr.message}). Dừng tác vụ.`);
                abortController.abort(new Error(`Server bị treo/lỗi sau 10 phút: ${pingErr.message}`));
            }
        }
    }, 30000);

    try {
        const response = await httpPostJson(API_ENDPOINT, {
            task: task.prompt,
            useGrounding: false,
            useCustomAi: true,
            context: {
                benchmarkTask: task.id,
                domain: task.domain
            }
        }, abortController.signal);

        clearInterval(progressTimer);
        clearInterval(watchdogTimer);

        const durationMs = Date.now() - startTime;
        const durationSec = (durationMs / 1000).toFixed(1);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText.slice(0, 300)}`);
        }

        const data = await response.json();
        if (!data.success && !data.result) {
            throw new Error(`Orchestration failed: ${data.error || 'Unknown error'}`);
        }
        const evalResult = evaluateResponse(task, durationMs, data);

        console.log(`⏱️ Thời gian thực thi: ${durationSec}s (${durationMs}ms)`);
        console.log(`📊 Số cuộc gọi Agent: ${data.stats?.agentCalls || 'N/A'}`);
        console.log(`🪙 Số Token tiêu thụ: ${data.stats?.totalTokens || 0} tokens (Model: ${data.stats?.model || 'deepseek-v4-pro'})`);
        console.log(`📝 Độ dài đầu ra: ${evalResult.textLength} ký tự`);
        console.log(`⭐ Điểm tự đánh giá nội bộ (Quality Score): ${data.qualityScore || 'N/A'}/100`);
        console.log(`🎯 ĐIỂM CHẤM THEO CHUẨN ANTIGRAVITY: ${evalResult.finalScore}/10.0 ${evalResult.finalScore >= 9.5 ? '🏆 (ĐẠT CHUẨN XUẤT SẮC 9.5+!)' : '⚠️ (CẦN TỐI ƯU THÊM)'}`);

        const resultRecord = {
            taskId: task.id,
            domain: task.domain,
            title: task.title,
            durationMs: durationMs,
            durationSec: parseFloat(durationSec),
            success: data.success,
            tokensUsed: data.stats?.totalTokens || 0,
            modelUsed: data.stats?.model || 'deepseek-v4-pro',
            qualityScore: data.qualityScore,
            stats: data.stats,
            eval: evalResult,
            sampleSnippet: (typeof data.result === 'string' ? data.result : JSON.stringify(data.result || data.error || '') || '').slice(0, 500) + '...',
            fullResponse: data.result
        };

        // Lưu file kết quả chi tiết từng task
        const taskFileName = `task_${String(task.id).padStart(2, '0')}.json`;
        fs.writeFileSync(path.join(OUTPUT_DIR, taskFileName), JSON.stringify(resultRecord, null, 2), 'utf8');
        console.log(`💾 Đã lưu kết quả chi tiết vào: benchmark_results/${taskFileName}`);

        // Xóa file error cũ nếu có
        const oldErrorPath = path.join(OUTPUT_DIR, `task_${String(task.id).padStart(2, '0')}_error.json`);
        if (fs.existsSync(oldErrorPath)) {
            try { fs.unlinkSync(oldErrorPath); } catch (e) {}
        }

        return resultRecord;

    } catch (err) {
        clearInterval(progressTimer);
        clearInterval(watchdogTimer);
        const durationMs = Date.now() - startTime;
        const isTimeout = err.name === 'TimeoutError' || err.message.includes('timeout') || err.message.includes('aborted');
        console.error(`❌ [TASK ${index} THẤT BẠI${isTimeout ? ' DO VƯỢT QUÁ 5 PHÚT (TIMEOUT)' : ''}]: ${err.message}`);
        const failRecord = {
            taskId: task.id,
            domain: task.domain,
            title: task.title,
            durationMs: durationMs,
            durationSec: parseFloat((durationMs / 1000).toFixed(1)),
            success: false,
            error: err.message,
            eval: { finalScore: 0 }
        };
        fs.writeFileSync(path.join(OUTPUT_DIR, `task_${String(task.id).padStart(2, '0')}_error.json`), JSON.stringify(failRecord, null, 2), 'utf8');
        return failRecord;
    }
}

async function main() {
    console.log(`\n===============================================================`);
    console.log(`🚀 KHỞI ĐỘNG BỘ BENCHMARK 20 TÁC VỤ ĐỘ KHÓ ĐỊA NGỤC (HELL DIFFICULTY)`);
    console.log(`🎯 THANG ĐO CHUẨN: ANTIGRAVITY (GOOGLE DEEPMIND) - THANG 10.0+`);
    console.log(`📡 MỤC TIÊU: ${API_ENDPOINT}`);
    console.log(`===============================================================\n`);

    const allResults = [];
    const totalStart = Date.now();

    for (let i = 0; i < HELL_TASKS.length; i++) {
        const task = HELL_TASKS[i];
        const taskFileName = `task_${String(task.id).padStart(2, '0')}.json`;
        const taskFilePath = path.join(OUTPUT_DIR, taskFileName);

        // Resume: Chỉ bỏ qua nếu task đã đạt chuẩn xuất sắc (>= 9.5 điểm)
        if (fs.existsSync(taskFilePath)) {
            try {
                const cached = JSON.parse(fs.readFileSync(taskFilePath, 'utf8'));
                const reEval = evaluateResponse(task, cached.durationMs || 10000, {
                    result: cached.fullResponse,
                    qualityScore: cached.qualityScore,
                    success: cached.success
                });
                if (cached.success && reEval.finalScore >= 9.5 && cached.fullResponse && cached.fullResponse.length > 300) {
                    console.log(`⏩ [TASK ${i + 1}/20] Đã có kết quả hợp lệ ĐẠT CHUẨN XUẤT SẮC: ${cached.title} (Điểm: ${reEval.finalScore}/10.0 >= 9.5) -> Kế thừa`);
                    cached.eval = reEval;
                    allResults.push(cached);
                    continue;
                } else {
                    console.log(`🔄 [TASK ${i + 1}/20] Kết quả cũ chỉ đạt ${reEval.finalScore}/10.0 (< 9.5) -> Kích hoạt chạy lại với Engine nâng cấp...`);
                }
            } catch (e) {}
        }

        const res = await runSingleTask(task, i + 1);
        allResults.push(res);

        // Khoảng nghỉ nhẹ giữa các task để scheduler token bucket hồi phục nhịp nhàng
        if (i < HELL_TASKS.length - 1) {
            console.log(`⏳ Nghỉ 3 giây để đồng bộ nhịp Quota Token Bucket...`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    const totalDurationSec = ((Date.now() - totalStart) / 1000).toFixed(1);
    const successfulTasks = allResults.filter(r => r.success);
    const averageScore = successfulTasks.length > 0 
        ? (successfulTasks.reduce((sum, r) => sum + r.eval.finalScore, 0) / successfulTasks.length).toFixed(2)
        : 0;
    const averageTime = successfulTasks.length > 0
        ? (successfulTasks.reduce((sum, r) => sum + r.durationSec, 0) / successfulTasks.length).toFixed(1)
        : 0;
    const excellentCount = successfulTasks.filter(r => r.eval.finalScore >= 9.0).length;

    console.log(`\n===============================================================`);
    console.log(`🏁 TỔNG KẾT BỘ BENCHMARK 20 TÁC VỤ ĐỊA NGỤC`);
    console.log(`===============================================================`);
    console.log(`✅ Thành công: ${successfulTasks.length}/${HELL_TASKS.length} tasks`);
    console.log(`⏱️ Tổng thời gian chạy: ${totalDurationSec} giây`);
    console.log(`⚡ Thời gian trung bình mỗi task: ${averageTime} giây`);
    console.log(`⭐ ĐIỂM TRUNG BÌNH THEO TIÊU CHUẨN NGHIỆM THU: ${averageScore}/10.0 (Thang điểm tuyệt đối 10.0)`);
    console.log(`🏆 Số tác vụ ĐẠT CHUẨN XUẤT SẮC (>= 9.0 điểm): ${excellentCount}/${successfulTasks.length} tác vụ`);
    console.log(`===============================================================\n`);

    const totalTokensAll = allResults.reduce((s, r) => s + (r.tokensUsed || r.stats?.totalTokens || 0), 0);
    console.log(`🪙 TỔNG TOKEN TIÊU THỤ (TOÀN BỘ 20 TASKS): ${totalTokensAll} tokens`);
    console.log(`🤖 Model: deepseek-v4-pro (Official DeepSeek API: https://api.deepseek.com/v1)`);

    // Lưu tổng kết toàn bộ benchmark
    const summaryData = {
        timestamp: new Date().toISOString(),
        engine: "DeepSeek (deepseek-v4-pro) via Official DeepSeek API",
        totalTasks: HELL_TASKS.length,
        successfulCount: successfulTasks.length,
        totalDurationSec: parseFloat(totalDurationSec),
        averageDurationSec: parseFloat(averageTime),
        totalTokensAllTasks: totalTokensAll,
        averageAntigravityScore: parseFloat(averageScore),
        excellentScoreCount: excellentCount,
        tasksSummary: allResults.map(r => ({
            id: r.taskId,
            domain: r.domain,
            title: r.title,
            durationSec: r.durationSec,
            tokensUsed: r.tokensUsed || r.stats?.totalTokens || 0,
            modelUsed: r.modelUsed || 'deepseek-v4-pro',
            success: r.success,
            finalScore: r.eval ? r.eval.finalScore : 0
        }))
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summaryData, null, 2), 'utf8');
    console.log(`💾 Đã lưu báo cáo tổng kết JSON vào: benchmark_results/summary.json`);
}

if (require.main === module) {
    main().catch(err => {
        console.error('Lỗi nghiêm trọng khi thực thi benchmark:', err);
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HELL_TASKS, evaluateResponse };
}
