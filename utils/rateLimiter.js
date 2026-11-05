/**
 * In-memory Rate Limiter
 * Giới hạn số lượng requests để bảo vệ server khỏi abuse
 */
class RateLimiter {
    constructor() {
        this._buckets = new Map();
        // Dọn dẹp buckets cũ mỗi 5 phút
        setInterval(() => {
            const now = Date.now();
            for (const [key, bucket] of this._buckets) {
                if (now - bucket.windowStart > 120000) {
                    this._buckets.delete(key);
                }
            }
        }, 300000).unref(); // unref() để không block process exit
    }

    /**
     * Kiểm tra rate limit cho một IP
     * @param {string} key - IP hoặc key định danh
     * @param {number} limit - Số request tối đa trong window
     * @param {number} windowMs - Thời gian window (ms)
     * @returns {boolean} true nếu được phép, false nếu vượt limit
     */
    check(key, limit = 200, windowMs = 60000) {
        const now = Date.now();
        let bucket = this._buckets.get(key);
        
        if (!bucket || now - bucket.windowStart > windowMs) {
            bucket = { count: 0, windowStart: now };
            this._buckets.set(key, bucket);
        }
        
        bucket.count++;
        return bucket.count <= limit;
    }

    /**
     * Lấy thông tin bucket hiện tại
     * @param {string} key
     * @returns {{ count: number, windowStart: number } | null}
     */
    getBucket(key) {
        return this._buckets.get(key) || null;
    }

    /**
     * Reset rate limit cho một key
     * @param {string} key
     */
    reset(key) {
        this._buckets.delete(key);
    }
}

module.exports = { RateLimiter };

