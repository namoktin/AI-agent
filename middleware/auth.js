/**
 * Bearer Token Auth Middleware
 * Xác thực request dựa trên AGENT_SECRET_KEY từ .env
 */

/**
 * Tạo auth middleware
 * @param {string} secretKey - Key bí mật từ env
 * @returns Express middleware
 */
function createAuthMiddleware(secretKey) {
    if (!secretKey) {
        // Chưa cấu hình secret — chạy localhost-only mode
        console.warn('⚠️  [Auth] AGENT_SECRET_KEY chưa cấu hình. Đang chạy ở chế độ localhost-only (không xác thực).');
        console.warn('⚠️  [Auth] Để bảo mật: Thêm AGENT_SECRET_KEY=<your-secret> vào file .env');
        return (req, res, next) => next();
    }
    
    console.log('🔐 [Auth] Xác thực Bearer Token đã được kích hoạt.');
    
    // Danh sách endpoints công khai (không cần auth)
    const publicPaths = ['/api/config', '/api/health'];
    
    return (req, res, next) => {
        // OPTIONS preflight không cần auth
        if (req.method === 'OPTIONS') return next();
        
        // Public endpoints
        if (publicPaths.includes(req.path)) return next();
        
        // Kiểm tra token từ header
        const authHeader = req.headers['authorization'] || req.headers['x-agent-key'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        
        if (!token || token !== secretKey) {
            return res.status(401).json({ 
                success: false, 
                error: 'Unauthorized: Cần cung cấp AGENT_SECRET_KEY hợp lệ trong header "Authorization: Bearer <key>" hoặc "x-agent-key: <key>"'
            });
        }
        next();
    };
}

module.exports = { createAuthMiddleware };

