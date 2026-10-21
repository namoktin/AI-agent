const path = require('path');
const fs = require('fs');

function isWithinRoot(targetPath, rootPath) {
    const target = path.resolve(targetPath);
    const root = path.resolve(rootPath);
    return target === root || target.startsWith(root + path.sep);
}

/**
 * Tạo một hàm kiểm tra path an toàn dựa trên danh sách root được phép.
 * Existing symlinks are resolved so a link cannot escape an allowed root.
 * @param {string[]} allowedRoots - Danh sách thư mục được phép
 * @returns {(targetPath: string) => boolean}
 */
function createPathGuard(allowedRoots) {
    const resolvedRoots = allowedRoots
        .filter(r => typeof r === 'string' && r.trim())
        .map(r => path.resolve(r));

    return function isSafePath(targetPath) {
        if (!targetPath || typeof targetPath !== 'string') return false;
        try {
            const resolved = path.resolve(targetPath);
            if (!resolvedRoots.some(root => isWithinRoot(resolved, root))) return false;

            // Resolve the longest existing ancestor. This also catches symlinks
            // when the requested file itself does not exist yet (write case).
            let existing = resolved;
            while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
                existing = path.dirname(existing);
            }
            const realExisting = fs.realpathSync.native(existing);
            return resolvedRoots.some(root => {
                let realRoot = root;
                try { realRoot = fs.realpathSync.native(root); } catch (e) {}
                return isWithinRoot(realExisting, realRoot);
            });
        } catch (e) {
            return false;
        }
    };
}

module.exports = { createPathGuard, isWithinRoot };
