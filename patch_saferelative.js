const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

const targetStr = `    if ((executable === 'dir' || executable === 'ls') && args.every(safeRelative)) {
        return { file: executable, args, display: value };
    }
    if ((executable === 'type' || executable === 'cat') && args.length === 1 && safeRelative(args[0])) {
        return { file: executable, args, display: value };
    }`;

const targetStrCRLF = targetStr.replace(/\n/g, '\r\n');

const replacementStr = `    const safeRelative = (input) => safePathOrRelative(input);
    if ((executable === 'dir' || executable === 'ls') && args.every(safeRelative)) {
        return { file: process.platform === 'win32' ? 'cmd.exe' : 'ls', args: process.platform === 'win32' ? ['/c', 'dir', ...args] : args, display: value };
    }
    if ((executable === 'type' || executable === 'cat') && args.length === 1 && safeRelative(args[0])) {
        return { file: process.platform === 'win32' ? 'cmd.exe' : 'cat', args: process.platform === 'win32' ? ['/c', 'type', ...args] : args, display: value };
    }`;

const replacementStrCRLF = replacementStr.replace(/\n/g, '\r\n');

if (serverContent.includes(targetStrCRLF)) {
    serverContent = serverContent.replace(targetStrCRLF, replacementStrCRLF);
    fs.writeFileSync(serverPath, serverContent, 'utf8');
    console.log('✅ Đã sửa safeRelative thành công (CRLF).');
} else if (serverContent.includes(targetStr)) {
    serverContent = serverContent.replace(targetStr, replacementStr);
    fs.writeFileSync(serverPath, serverContent, 'utf8');
    console.log('✅ Đã sửa safeRelative thành công (LF).');
} else {
    console.log('⚠️ Không tìm thấy targetStr.');
}

