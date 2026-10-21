/**
 * Path Safety Guard — Chống Path Traversal Attack
 * Đảm bảo mọi đường dẫn đều nằm trong whitelist directories
 */
const path = require('path');

/**
 * Tạo một hàm kiểm tra path an toàn dựa trên danh sách root được phép
 * @param {string[]} allowedRoots - Danh sách thư mục được phép
 * @returns {(targetPath: string) => boolean}
 */
function createPathGuard(allowedRoots) {
    const resolvedRoots = allowedRoots.map(r => path.resolve(r));
    
    return function isSafePath(targetPath) {
        if (!targetPath || typeof targetPath !== 'string') return false;
        try {
            const resolved = path.resolve(targetPath);
            return resolvedRoots.some(root => {
                return resolved.startsWith(root + path.sep) || resolved === root;
            });
        } catch (e) {
            return false;
        }
    };
}

module.exports = { createPathGuard };

