const fs = require('fs');
const path = require('path');

const workDir = process.env.WORK_DIR || process.cwd();
const outputFileJson = path.join(workDir, 'financial_summary.json');
const outputFileMd = path.join(workDir, 'financial_report.md');

console.log('🚀 [TASK 2] Bắt đầu phân tích dữ liệu tài chính 5,000 dòng...');

async function run() {
    const totalRecords = 5000;
    const categories = ['Cloud Services', 'AI Compute API', 'Data Storage', 'Network Egress', 'Security Shield'];
    const batches = 10;
    const batchSize = totalRecords / batches;

    let totalRevenue = 0;
    const categoryTotals = {};
    categories.forEach(c => categoryTotals[c] = { count: 0, revenue: 0 });

    for (let b = 1; b <= batches; b++) {
        for (let i = 0; i < batchSize; i++) {
            const cat = categories[Math.floor(Math.random() * categories.length)];
            const amount = Math.floor(Math.random() * 500) + 20;
            totalRevenue += amount;
            categoryTotals[cat].count++;
            categoryTotals[cat].revenue += amount;
        }

        const currentRecords = b * batchSize;
        const percent = Math.round((b / batches) * 100);
        console.log(`[PROGRESS] ${b}/${batches} (${percent}%): Đã xử lý ${currentRecords}/${totalRecords} giao dịch`);
        await new Promise(r => setTimeout(r, 90));
    }

    const summary = {
        totalRecords,
        totalRevenueUSD: totalRevenue,
        averagePerTransactionUSD: (totalRevenue / totalRecords).toFixed(2),
        categoryBreakdown: categoryTotals,
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync(outputFileJson, JSON.stringify(summary, null, 2), 'utf8');

    let md = '# 📊 BÁO CÁO PHÂN TÍCH DỮ LIỆU TÀI CHÍNH (BIG DATA ETL)\n\n';
    md += `- **Tổng số giao dịch:** ${totalRecords.toLocaleString()} giao dịch\n`;
    md += `- **Tổng doanh số:** $${totalRevenue.toLocaleString()} USD\n`;
    md += `- **Giá trị trung bình/giao dịch:** $${summary.averagePerTransactionUSD} USD\n\n`;
    md += '| Danh Mục Dịch Vụ | Số Giao Dịch | Doanh Thu (USD) | Tỷ Trọng |\n';
    md += '|:---|:---:|:---:|:---:|\n';
    for (const [cat, data] of Object.entries(categoryTotals)) {
        const share = ((data.revenue / totalRevenue) * 100).toFixed(1);
        md += `| ${cat} | ${data.count.toLocaleString()} | $${data.revenue.toLocaleString()} | ${share}% |\n`;
    }
    fs.writeFileSync(outputFileMd, md, 'utf8');

    console.log(`✅ [TASK 2] Đã xuất báo cáo tài chính thành công vào ${outputFileJson}`);
}

run().catch(err => {
    console.error('❌ [TASK 2] Lỗi:', err);
    process.exit(1);
});
