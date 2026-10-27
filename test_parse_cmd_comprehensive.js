const assert = require('assert');
const path = require('path');

// We require server functions or test parseSafeCommand logic
// Let's test the regex and validation logic directly
const safePathOrRelative = input => {
    if (typeof input !== 'string' || !input || input.length > 500) return false;
    if (input.includes('..') || /[;&|`$<>]/.test(input) || /[\r\n\0]/.test(input)) return false;
    if (path.isAbsolute(input)) {
        const normalized = path.normalize(input).toLowerCase();
        return normalized.startsWith('c:\\users\\nam\\desktop\\ai agent') ||
               normalized.startsWith('c:\\users\\nam\\desktop\\gemini');
    }
    return /^[\w./\\:= -]+$/.test(input);
};

console.log('--- Testing safePathOrRelative ---');
assert.strictEqual(safePathOrRelative('script.py'), true, 'relative py file');
assert.strictEqual(safePathOrRelative('--demo'), true, 'flag --demo');
assert.strictEqual(safePathOrRelative('--out=results.csv'), true, 'flag with = and path');
assert.strictEqual(safePathOrRelative('output_data/result.csv'), true, 'subpath with forward slash');
assert.strictEqual(safePathOrRelative('output_data\\result.csv'), true, 'subpath with backslash');
assert.strictEqual(safePathOrRelative('../secret.txt'), false, 'path traversal must fail');
assert.strictEqual(safePathOrRelative('foo; rm -rf /'), false, 'semicolon must fail');
assert.strictEqual(safePathOrRelative('foo && bar'), false, '&& must fail');
assert.strictEqual(safePathOrRelative('foo | bar'), false, 'pipe must fail');
assert.strictEqual(safePathOrRelative('foo`bar`'), false, 'backtick must fail');
assert.strictEqual(safePathOrRelative('foo$bar'), false, 'dollar must fail');
console.log('✅ All safePathOrRelative tests passed!');

console.log('--- Testing parseSafeCommand logic ---');
function parseSafeCommand(command) {
    if (typeof command !== "string" || !command.trim() || command.length > 2000) return null;
    const value = command.trim();
    if (/[\r\n\0`]|\$\([\s\S]*?\)|\b(?:cmd\.exe|powershell(?:\.exe)?|pwsh(?:\.exe)?|sh\b|bash\b)/i.test(value)) return null;

    const parts = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    if (!parts || parts.length === 0) return null;
    const args = parts.map(part => part.replace(/^(["'])|(["'])$/g, ""));
    const executable = args.shift().toLowerCase();
    if (executable !== "yt-dlp" && executable !== "yt-dlp.exe") {
        if (/[&|<>$;`]/.test(value)) return null;
    }
    const scriptArg = args[0] || '';

    if (executable === 'node') {
        if (args.length === 1 && /^(--version|-v)$/i.test(scriptArg)) {
            return { file: process.execPath, args, display: value };
        }
        if (scriptArg === '-c' && args[1] && /^[-\w./\\:]+\.js$/i.test(args[1]) && safePathOrRelative(args[1])) {
            return { file: process.execPath, args, display: value };
        }
        if (/^[-\w./\\:]+\.js$/i.test(scriptArg)) {
            if (!safePathOrRelative(scriptArg)) return null;
            const extraArgs = args.slice(1);
            if (!extraArgs.every(arg => safePathOrRelative(arg))) return null;
            return { file: process.execPath, args, display: value };
        }
    }
    if (executable === 'python' || executable === 'python3' || executable === 'py') {
        if (args.length === 1 && /^(--version|-v|-V)$/i.test(scriptArg)) {
            return { file: executable === 'py' ? 'py' : executable, args, display: value };
        }
        if (scriptArg === '-m' && args[1] === 'py_compile' && args[2] && /^[-\w./\\:]+\.py$/i.test(args[2]) && safePathOrRelative(args[2])) {
            return { file: executable === 'py' ? 'py' : executable, args, display: value };
        }
        if (scriptArg === '-u' && args[1] && /^[-\w./\\:]+\.py$/i.test(args[1]) && safePathOrRelative(args[1])) {
            const extraArgs = args.slice(2);
            if (!extraArgs.every(arg => safePathOrRelative(arg))) return null;
            return { file: executable === 'py' ? 'py' : executable, args, display: value };
        }
        if (/^[-\w./\\:]+\.py$/i.test(scriptArg)) {
            if (!safePathOrRelative(scriptArg)) return null;
            const extraArgs = args.slice(1);
            if (!extraArgs.every(arg => safePathOrRelative(arg))) return null;
            return { file: executable === 'py' ? 'py' : executable, args, display: value };
        }
    }
    if (executable === 'pip' || executable === 'pip3') {
        if (args.length === 1 && /^(--version|-v|-V|list)$/i.test(scriptArg)) {
            return { file: executable, args, display: value };
        }
    }
    return null;
}

assert.notStrictEqual(parseSafeCommand('node -v'), null, 'node -v should be allowed');
assert.notStrictEqual(parseSafeCommand('node --version'), null, 'node --version should be allowed');
assert.notStrictEqual(parseSafeCommand('node -c test.js'), null, 'node -c test.js should be allowed');
assert.notStrictEqual(parseSafeCommand('node test.js --foo=bar'), null, 'node test.js --foo=bar should be allowed');
assert.notStrictEqual(parseSafeCommand('python -V'), null, 'python -V should be allowed');
assert.notStrictEqual(parseSafeCommand('python --version'), null, 'python --version should be allowed');
assert.notStrictEqual(parseSafeCommand('python -m py_compile script.py'), null, 'python -m py_compile script.py should be allowed');
assert.notStrictEqual(parseSafeCommand('python -u script.py --demo'), null, 'python -u script.py --demo should be allowed');
assert.notStrictEqual(parseSafeCommand('python home_living_scraper.py --demo --out=res.csv'), null, 'python with flags and = should be allowed');
assert.notStrictEqual(parseSafeCommand('pip list'), null, 'pip list should be allowed');

// Malicious commands must be blocked:
assert.strictEqual(parseSafeCommand('node -e "process.exit()"'), null, 'arbitrary node -e must be blocked');
assert.strictEqual(parseSafeCommand('python -c "import os"'), null, 'arbitrary python -c must be blocked');
assert.strictEqual(parseSafeCommand('python script.py & calc.exe'), null, 'shell chaining must be blocked');
assert.strictEqual(parseSafeCommand('cmd.exe /c dir'), null, 'cmd.exe must be blocked');
assert.strictEqual(parseSafeCommand('powershell -Command Get-Process'), null, 'powershell must be blocked');
assert.strictEqual(parseSafeCommand('bash -c "whoami"'), null, 'bash must be blocked');
assert.strictEqual(parseSafeCommand('python ../../../windows/system32/calc.exe'), null, 'path traversal in python must be blocked');

console.log('✅ All parseSafeCommand security & feature tests passed with 100% precision!');

