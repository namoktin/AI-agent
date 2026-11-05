/**
 * Sandbox Worker — Thực thi JavaScript code trong tiến trình con cô lập
 * SECURITY: File này được spawn bởi server.js qua child_process
 * - Không có quyền truy cập process.env (env bị override)
 * - Không có require(), fs, child_process, net
 * - RAM giới hạn 64MB qua NODE_OPTIONS
 * - Timeout kiểm soát bởi parent process
 */

const vm = require('vm');

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
    try {
        const { code, timeout = 5000 } = JSON.parse(input);
        const logs = [];

        const sandbox = {
            console: {
                log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')),
                error: (...a) => logs.push('[ERR] ' + a.map(String).join(' ')),
                warn: (...a) => logs.push('[WARN] ' + a.map(String).join(' ')),
                info: (...a) => logs.push('[INFO] ' + a.map(String).join(' '))
            },
            Math, JSON, Array, Object, String, Number, Boolean, Date, RegExp, Error,
            parseInt, parseFloat, isNaN, isFinite,
            encodeURIComponent, decodeURIComponent,
            // Disabled: setTimeout, setInterval, require, process, global, fs, http, net
        };

        let result;
        try {
            result = new vm.Script(code, { filename: 'sandbox.js', timeout })
                .runInContext(vm.createContext(sandbox), { timeout });
        } catch (e) {
            process.stdout.write(JSON.stringify({
                success: false,
                error: e.name + ': ' + e.message,
                logs
            }));
            process.exit(0);
        }

        process.stdout.write(JSON.stringify({
            success: true,
            result: result !== undefined
                ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result))
                : undefined,
            logs
        }));
    } catch (e) {
        process.stdout.write(JSON.stringify({
            success: false,
            error: 'Worker parse error: ' + e.message,
            logs: []
        }));
    }
    process.exit(0);
});

