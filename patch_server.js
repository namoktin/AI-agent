const fs = require('fs');
const path = require('path');

let content = fs.readFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\server.js', 'utf8');

const target = `    const scriptArg = args[0] || '';
    const safeRelative = input => typeof input === 'string' &&
        input.length > 0 && input.length <= 240 &&
        !path.isAbsolute(input) && !input.includes('..') &&
        /^[\\w./\\\\:-]+$/.test(input);

    if (executable === 'node' && /^[-\\w./\\\\]+\\.js$/i.test(scriptArg)) {
        const extraArgs = args.slice(1);
        if (!extraArgs.every(arg => safeRelative(arg))) return null;
        return { file: process.execPath, args, display: value };
    }
    if ((executable === 'python' || executable === 'python3' || executable === 'py') &&
        /^[\\w./\\\\-]+\\.py$/i.test(scriptArg)) {
        const extraArgs = args.slice(1);
        if (!extraArgs.every(arg => safeRelative(arg))) return null;
        return { file: executable === 'py' ? 'py' : executable, args, display: value };
    }`;

const replacement = `    const scriptArg = args[0] || '';
    const safePathOrRelative = input => {
        if (typeof input !== 'string' || !input || input.length > 300) return false;
        if (input.includes('..') || /[;&|\`$<>]/.test(input)) return false;
        if (path.isAbsolute(input)) {
            const normalized = path.normalize(input).toLowerCase();
            return normalized.startsWith('c:\\\\users\\\\nam\\\\desktop\\\\ai agent') ||
                   normalized.startsWith('c:\\\\users\\\\nam\\\\desktop\\\\gemini');
        }
        return /^[\\w./\\\\:-]+$/.test(input);
    };

    if (executable === 'node' && /^[-\\w./\\\\:]+\\.js$/i.test(scriptArg)) {
        if (!safePathOrRelative(scriptArg)) return null;
        const extraArgs = args.slice(1);
        if (!extraArgs.every(arg => safePathOrRelative(arg))) return null;
        return { file: process.execPath, args, display: value };
    }
    if ((executable === 'python' || executable === 'python3' || executable === 'py') &&
        /^[-\\w./\\\\:]+\\.py$/i.test(scriptArg)) {
        if (!safePathOrRelative(scriptArg)) return null;
        const extraArgs = args.slice(1);
        if (!extraArgs.every(arg => safePathOrRelative(arg))) return null;
        return { file: executable === 'py' ? 'py' : executable, args, display: value };
    }`;

const crlfTarget = target.replace(/\n/g, '\r\n');
if (content.includes(crlfTarget)) {
    content = content.replace(crlfTarget, replacement.replace(/\n/g, '\r\n'));
    fs.writeFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\server.js', content, 'utf8');
    console.log('Successfully replaced with CRLF!');
} else if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\server.js', content, 'utf8');
    console.log('Successfully replaced with LF!');
} else {
    console.log('Target not found!');
}

