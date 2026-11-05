const fs = require('fs');
const path = require('path');

const workDir = process.env.WORK_DIR || process.cwd();
const outputFile = path.join(workDir, 'monte_carlo_risk_results.json');

console.log('🚀 [TASK 3] Bắt đầu mô phỏng Monte Carlo 10,000 kịch bản rủi ro...');

async function run() {
    const totalSimulations = 10000;
    const initialPortfolioUSD = 100000;
    const expectedReturnAnnual = 0.12;
    const volatilityAnnual = 0.20;
    const days = 30;
    const dt = 1 / 252;

    const outcomes = [];
    const steps = 10;
    const chunkSize = totalSimulations / steps;

    // Box-Muller transform for normal distribution
    function randn() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    for (let s = 1; s <= steps; s++) {
        for (let i = 0; i < chunkSize; i++) {
            let price = initialPortfolioUSD;
            for (let d = 0; d < days; d++) {
                const drift = (expectedReturnAnnual - 0.5 * volatilityAnnual * volatilityAnnual) * dt;
                const shock = volatilityAnnual * Math.sqrt(dt) * randn();
                price *= Math.exp(drift + shock);
            }
            outcomes.push(price);
        }

        const percent = Math.round((s / steps) * 100);
        console.log(`[PROGRESS] ${s}/${steps} (${percent}%): Đã chạy ${s * chunkSize}/${totalSimulations} kịch bản thị trường`);
        await new Promise(r => setTimeout(r, 70));
    }

    outcomes.sort((a, b) => a - b);
    const var95Idx = Math.floor(totalSimulations * 0.05);
    const var99Idx = Math.floor(totalSimulations * 0.01);
    const medianIdx = Math.floor(totalSimulations * 0.50);

    const report = {
        totalSimulations,
        initialPortfolioUSD,
        simulationDays: days,
        medianOutcomeUSD: outcomes[medianIdx].toFixed(2),
        var95_USD: (initialPortfolioUSD - outcomes[var95Idx]).toFixed(2),
        var99_USD: (initialPortfolioUSD - outcomes[var99Idx]).toFixed(2),
        worstCaseUSD: outcomes[0].toFixed(2),
        bestCaseUSD: outcomes[outcomes.length - 1].toFixed(2),
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(`✅ [TASK 3] Đã lưu kết quả Monte Carlo vào ${outputFile}`);
}

run().catch(err => {
    console.error('❌ [TASK 3] Lỗi:', err);
    process.exit(1);
});
