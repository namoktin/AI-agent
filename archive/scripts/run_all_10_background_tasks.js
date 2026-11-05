const fs = require('fs');
const path = require('path');

const BASE_DIR = 'C:\\Users\\Nam\\Desktop\\AI agent';
const TEST_OUTPUT_DIR = 'C:\\Users\\Nam\\Desktop\\gemini\\2026-10-25\\10_tasks_test';
const WORKERS_DIR = path.join(BASE_DIR, 'workers', 'tasks_10');

if (!fs.existsSync(TEST_OUTPUT_DIR)) fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

const tasksConfig = [
    {
        num: 1,
        title: 'Cào dữ liệu 15 tin tức công nghệ AI (Web Scraping Batch)',
        type: 'web_scraping',
        scriptPath: path.join(WORKERS_DIR, 'task1_web_scraper.js'),
        expectedFile: 'tech_news_batch.csv',
        totalItems: 15
    },
    {
        num: 2,
        title: 'Xử lý dữ liệu lớn 5,000 giao dịch tài chính (Big Data ETL)',
        type: 'big_data',
        scriptPath: path.join(WORKERS_DIR, 'task2_big_data_processor.js'),
        expectedFile: 'financial_summary.json',
        totalItems: 10
    },
    {
        num: 3,
        title: 'Mô phỏng Monte Carlo 10,000 kịch bản rủi ro đầu tư (Simulation)',
        type: 'simulation',
        scriptPath: path.join(WORKERS_DIR, 'task3_monte_carlo.js'),
        expectedFile: 'monte_carlo_risk_results.json',
        totalItems: 10
    },
    {
        num: 4,
        title: 'Trích xuất thực thể thông minh Named Entity Recognition (NLP)',
        type: 'nlp_ner',
        scriptPath: path.join(WORKERS_DIR, 'task4_entity_extractor.js'),
        expectedFile: 'entity_extraction_results.json',
        totalItems: 8
    },
    {
        num: 5,
        title: 'Kiểm tra sức khỏe đồng thời 10 endpoint mạng (Link Health Audit)',
        type: 'network_audit',
        scriptPath: path.join(WORKERS_DIR, 'task5_link_health_auditor.js'),
        expectedFile: 'link_health_report.csv',
        totalItems: 10
    },
    {
        num: 6,
        title: 'Thuật toán phân cụm K-Means bằng Python (Python Data Science)',
        type: 'python_science',
        scriptPath: path.join(WORKERS_DIR, 'task6_kmeans_clustering.py'),
        expectedFile: 'kmeans_clusters.json',
        totalItems: 10
    },
    {
        num: 7,
        title: 'Dựng Dashboard HTML tương tác và biểu đồ SVG (Dashboard Generator)',
        type: 'html_dashboard',
        scriptPath: path.join(WORKERS_DIR, 'task7_dashboard_generator.js'),
        expectedFile: 'system_analytics_dashboard.html',
        totalItems: 5
    },
    {
        num: 8,
        title: 'Tính toán mã băm SHA256 xác thực toàn vẹn tệp (Integrity Checksum)',
        type: 'security_checksum',
        scriptPath: path.join(WORKERS_DIR, 'task8_checksum_archiver.js'),
        expectedFile: 'backup_manifest.json',
        totalItems: 5
    },
    {
        num: 9,
        title: 'Thử nghiệm áp lực chạy song song 2 luồng ngầm A & B (Concurrent Stress)',
        type: 'concurrency_test',
        scriptPath: path.join(WORKERS_DIR, 'task9_concurrent_a.js'),
        parallelScript: path.join(WORKERS_DIR, 'task9_concurrent_b.js'),
        expectedFile: 'stress_test_a_results.json',
        expectedFile2: 'stress_test_b_results.json',
        totalItems: 8
    },
    {
        num: 10,
        title: 'Thẩm định quy trình xử lý đa phương tiện (Media Batch Pipeline)',
        type: 'media_pipeline',
        scriptPath: path.join(WORKERS_DIR, 'task10_media_batch.js'),
        expectedFile: 'media_download_summary.json',
        totalItems: 4
    }
];

async function startTask(cfg) {
    const res = await fetch('http://localhost:3000/api/tasks/start-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: cfg.title,
            type: cfg.type,
            scriptPath: cfg.scriptPath,
            workDir: TEST_OUTPUT_DIR,
            totalItems: cfg.totalItems
        })
    });
    return await res.json();
}

async function getTaskStatus(taskId) {
    const res = await fetch(`http://localhost:3000/api/tasks/${taskId}/status`);
    return await res.json();
}

async function runAll() {
    console.log('===============================================================');
    console.log('🚀 BẮT ĐẦU KIỂM THỬ THỰC CHIẾN 10 TÁC VỤ NỀN ĐA DẠNG');
    console.log('📁 Thư mục lưu sản phẩm:', TEST_OUTPUT_DIR);
    console.log('===============================================================\n');

    const results = [];
    const overallStart = Date.now();

    for (const cfg of tasksConfig) {
        console.log(`\n-------------------------------------------------------------`);
        console.log(`▶️ [TASK #${cfg.num}/10]: ${cfg.title}`);
        console.log(`🔧 Script: ${path.basename(cfg.scriptPath)}`);

        const tStart = Date.now();
        const startRes = await startTask(cfg);

        if (!startRes.success) {
            console.error(`❌ Khởi chạy thất bại:`, startRes.error);
            results.push({ num: cfg.num, title: cfg.title, status: 'FAILED_START', error: startRes.error });
            continue;
        }

        const taskId = startRes.task.id;
        console.log(`✅ Khởi chạy thành công: ID = ${taskId}`);

        // If Task 9, also launch parallel script B
        let parallelTaskId = null;
        if (cfg.parallelScript) {
            const pRes = await fetch('http://localhost:3000/api/tasks/start-task', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: cfg.title + ' [Luồng B]',
                    type: cfg.type,
                    scriptPath: cfg.parallelScript,
                    workDir: TEST_OUTPUT_DIR,
                    totalItems: cfg.totalItems
                })
            });
            const pData = await pRes.json();
            parallelTaskId = pData.task?.id;
            console.log(`⚡ Kích hoạt song song luồng B: ID = ${parallelTaskId}`);
        }

        // Poll until completion
        let done = false;
        let lastPercent = 0;
        let finalStatus = 'UNKNOWN';
        let retries = 0;

        while (!done && retries < 60) {
            await new Promise(r => setTimeout(r, 400));
            retries++;
            const st = await getTaskStatus(taskId);
            if (st.task) {
                const p = st.task.progress;
                if (p && p.percent !== lastPercent) {
                    lastPercent = p.percent;
                    process.stdout.write(`   📊 Tiến độ: ${p.current}/${p.total} (${p.percent}%) - ${p.message || ''}\n`);
                }
                if (st.task.status === 'COMPLETED' || st.task.status === 'FAILED' || st.task.status === 'CANCELLED') {
                    done = true;
                    finalStatus = st.task.status;
                }
            }
        }

        // If parallel task 9, also wait for it
        if (parallelTaskId) {
            let pDone = false;
            let pRetries = 0;
            while (!pDone && pRetries < 30) {
                await new Promise(r => setTimeout(r, 300));
                pRetries++;
                const pSt = await getTaskStatus(parallelTaskId);
                if (pSt.task && (pSt.task.status === 'COMPLETED' || pSt.task.status === 'FAILED')) pDone = true;
            }
        }

        const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(2);

        // Check expected output file
        const targetPath = path.join(TEST_OUTPUT_DIR, cfg.expectedFile);
        const fileExists = fs.existsSync(targetPath);
        const fileSize = fileExists ? fs.statSync(targetPath).size : 0;

        let extraCheck = true;
        if (cfg.expectedFile2) {
            const p2 = path.join(TEST_OUTPUT_DIR, cfg.expectedFile2);
            extraCheck = fs.existsSync(p2) && fs.statSync(p2).size > 0;
        }

        const isPass = finalStatus === 'COMPLETED' && fileExists && fileSize > 0 && extraCheck;
        console.log(`🏁 Kết thúc Task #${cfg.num}: ${isPass ? '✅ HOÀN TẤT THÀNH CÔNG' : '❌ LỖI'} (Thời gian: ${elapsedSec}s)`);
        console.log(`📁 Tệp sản phẩm: ${cfg.expectedFile} (${fileSize.toLocaleString()} bytes)`);

        results.push({
            num: cfg.num,
            title: cfg.title,
            taskId,
            status: finalStatus,
            elapsedSec,
            file: cfg.expectedFile,
            fileSizeBytes: fileSize,
            pass: isPass
        });
    }

    const totalElapsedMin = ((Date.now() - overallStart) / 1000 / 60).toFixed(2);
    const passCount = results.filter(r => r.pass).length;

    console.log('\n===============================================================');
    console.log(`📊 TỔNG KẾT KẾT QUẢ KIỂM THỬ 10 TÁC VỤ: ${passCount}/10 PASS (${((passCount/10)*100).toFixed(1)}%)`);
    console.log(`⏱️ Tổng thời gian thực thi 10 tác vụ: ${totalElapsedMin} phút`);
    console.log('===============================================================\n');

    // Create report file
    let md = '# 📊 BÁO CÁO NGHIỆM THU KIỂM THỬ THỰC CHIẾN 10 TÁC VỤ CHẠY NGẦM\n\n';
    md += `> **Mục tiêu:** Kiểm thử thực tế năng lực chạy ngầm đa nhiệm (Universal Background Task Runner) trên 10 loại hình công việc hoàn toàn khác nhau.\n`;
    md += `> **Thời gian thực hiện:** ${new Date().toLocaleString('vi-VN')}\n`;
    md += `> **Thư mục lưu trữ sản phẩm:** \`${TEST_OUTPUT_DIR}\`\n`;
    md += `> **Kết quả chung:** **${passCount}/10 Tác vụ ĐẠT 100% SUCCESS** (Tổng thời gian: ${totalElapsedMin} phút)\n\n`;
    md += '| STT | Tên Tác Vụ Nền | Loại Hình | Thời Gian (s) | Tệp Sản Phẩm Tạo Ra | Dung Lượng | Đánh Giá |\n';
    md += '|:---:|:---|:---|:---:|:---|:---:|:---:|\n';

    results.forEach(r => {
        const typeStr = tasksConfig[r.num - 1].type;
        const sizeStr = (r.fileSizeBytes / 1024).toFixed(1) + ' KB';
        md += `| ${r.num} | ${r.title} | \`${typeStr}\` | ${r.elapsedSec}s | \`${r.file}\` | ${sizeStr} | ${r.pass ? '✅ PASS' : '❌ FAIL'} |\n`;
    });

    const reportFile = path.join(TEST_OUTPUT_DIR, 'BAO_CAO_10_TAC_VU_NGAM.md');
    fs.writeFileSync(reportFile, md, 'utf8');
    console.log('📝 Báo cáo tổng kết đã lưu tại:', reportFile);
}

runAll().catch(e => {
    console.error('Lỗi chạy suite 10 tasks:', e);
});
