const crypto = require('crypto');

function tokensMatch(provided, expected) {
    if (typeof provided !== 'string' || typeof expected !== 'string') return false;
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Tạo auth middleware
 * @param {string} secretKey - Key bí mật từ env
 * @returns Express middleware
 */
function createAuthMiddleware(secretKey) {
    if (!secretKey) {
        // SECURITY: Chưa cấu hình secret — chỉ cho phép localhost
        console.warn('⚠️  [Auth] AGENT_SECRET_KEY chưa cấu hình. Chỉ cho phép truy cập từ localhost.');
        console.warn('⚠️  [Auth] Để bảo mật: Thêm AGENT_SECRET_KEY=<your-secret> vào file .env');
        return (req, res, next) => {
            const ip = req.ip || req.connection.remoteAddress || '';
            const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
            if (!isLocal) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden: Server chỉ chấp nhận kết nối từ localhost khi chưa cấu hình AGENT_SECRET_KEY.'
                });
            }
            next();
        };
    }

    console.log('🔐 [Auth] Xác thực Bearer Token đã được kích hoạt.');

    // Danh sách endpoints công khai (không cần auth)
    const publicPaths = ['/api/health'];

    return (req, res, next) => {
        if (req.method === 'OPTIONS') return next();
        if (publicPaths.includes(req.path)) return next();

        const authHeader = req.headers['authorization'] || req.headers['x-agent-key'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

        if (!tokensMatch(token, secretKey)) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: Cần cung cấp AGENT_SECRET_KEY hợp lệ trong header "Authorization: Bearer <key>" hoặc "x-agent-key: <key>"'
            });
        }
        next();
    };
}

module.exports = { createAuthMiddleware, tokensMatch };
