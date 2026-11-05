/**
 * Async Mutex — Tránh concurrent write corruption cho file JSON
 * Đảm bảo chỉ một write operation xảy ra tại một thời điểm
 */
class AsyncMutex {
    constructor() {
        this._queue = Promise.resolve();
    }
    
    /**
     * Thực thi function với mutex lock
     * @param {() => Promise<T>} fn - Async function cần lock
     * @returns {Promise<T>}
     */
    async lock(fn) {
        let release;
        const prev = this._queue;
        this._queue = new Promise(resolve => { release = resolve; });
        await prev;
        try {
            return await fn();
        } finally {
            release();
        }
    }
}

module.exports = { AsyncMutex };

