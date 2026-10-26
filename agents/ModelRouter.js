/**
 * ModelRouter.js - Centralized Model Registry, Proactive Quota-Aware Scheduler and Dynamic Routing Engine
 * Cyber Agent Pro v4.5 Enterprise
 */

class ModelRouter {
    constructor(customConfig = {}) {
        this.defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

        // Unified Model Registry with Distinct Tiers (Fast, Standard, Reasoning Pro)
        this.registry = {
            FAST: process.env.GEMINI_MODEL_FAST || 'gemini-flash-lite-latest',
            STANDARD: process.env.GEMINI_MODEL_STANDARD || this.defaultModel || 'gemini-3.5-flash-lite',
            REASONING: process.env.GEMINI_MODEL_HEAVY || 'gemini-3.5-flash-lite',
            FALLBACK_POOL: [
                'gemini-3.5-flash-lite',
                'gemini-flash-lite-latest'
            ],
            ...customConfig
        };

        // Budget & Quota Thresholds (RPM: Requests Per Minute, TPM: Tokens Per Minute, RPD: Requests Per Day)
        this.limits = {
            maxRPM: customConfig.maxRPM || 60,
            maxTPM: customConfig.maxTPM || 1000000,
            maxRPD: customConfig.maxRPD || 1500
        };

        // Sliding window data
        this.requestTimestamps = [];
        this.tokenUsage = [];
        this.dailyRequests = [];

        // Circuit Breaker & Quota Tracking
        this.modelCooldowns = new Map(); // modelName -> cooldownUntilTimestamp
        this.globalCooldownUntil = 0;

        // PROACTIVE PRE-DISPATCH SCHEDULER & CONCURRENCY THROTTLE
        this.inflightRequests = 0;
        this.maxInflight = customConfig.maxInflight || 10;
        this.activeSlots = new Map(); // slotId -> { timestamp, model }
        this.slotCounter = 0;
        this.dispatchQueue = [];
        this.schedulerTimer = null;

        // Usage and fallback tracking
        this.dispatchLog = [];
    }

    /**
     * Clean sliding window logs
     */
    cleanSlidingWindows() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const oneDayAgo = now - 86400000;

        this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
        this.tokenUsage = this.tokenUsage.filter(entry => entry.timestamp > oneMinuteAgo);
        this.dailyRequests = this.dailyRequests.filter(t => t > oneDayAgo);

        // Clean expired model cooldowns
        for (const [model, cooldownUntil] of this.modelCooldowns.entries()) {
            if (now >= cooldownUntil) {
                this.modelCooldowns.delete(model);
            }
        }

        // Tự động giải phóng các slot đang bay bị treo (stale inflight slots) vượt quá maxDuration của request (Fix Lỗi C)
        for (const [sId, sInfo] of this.activeSlots.entries()) {
            const slotLifetime = sInfo.maxDuration || 90000;
            if (now - sInfo.timestamp > slotLifetime) {
                console.warn(`⏳ [ModelRouter] Giải phóng slot treo [${sId}] sau ${Math.round((now - sInfo.timestamp)/1000)}s (> ${Math.round(slotLifetime/1000)}s)`);
                this.cancelDispatchSlot(sId);
            }
        }
        this.inflightRequests = this.activeSlots.size;
    }

    /**
     * Check if an API call can be safely dispatched immediately without violating quotas
     */
    _canDispatchNow(estimatedTokens = 1200) {
        this.cleanSlidingWindows();

        // 1. Circuit Breaker tripped
        if (this.isCircuitBreakerTripped()) return false;

        // 2. Max Inflight Concurrency
        if (this.inflightRequests >= this.maxInflight) return false;

        // 3. RPM Limit
        if (this.requestTimestamps.length >= this.limits.maxRPM) return false;

        // 4. RPD Limit (Fix for Lỗi 3)
        if (this.dailyRequests.length >= this.limits.maxRPD) return false;

        // 5. TPM Limit
        const currentTPM = this.tokenUsage.reduce((s, x) => s + (x.tokens || 0), 0);
        if (currentTPM + estimatedTokens > this.limits.maxTPM) return false;

        return true;
    }

    /**
     * Pre-reserve slot and budget in counters upon slot grant (Fix for Lỗi 3 & Lỗi C)
     */
    _reserveSlot(slotId, model, estimatedTokens = 1200, maxDuration = 90000) {
        const now = Date.now();
        this.activeSlots.set(slotId, {
            timestamp: now,
            model,
            estimatedTokens,
            maxDuration: Math.max(maxDuration || 90000, 90000)
        });
        this.inflightRequests = this.activeSlots.size;

        // Pre-reserve request count in RPM & RPD counters immediately
        this.requestTimestamps.push(now);
        this.dailyRequests.push(now);

        // Pre-reserve estimated tokens in TPM counter immediately
        this.tokenUsage.push({
            timestamp: now,
            tokens: estimatedTokens,
            slotId,
            isReserved: true
        });
    }

    /**
     * Cancel slot and reclaim pre-reserved budgets if request is cancelled or fails before dispatch
     */
    cancelDispatchSlot(slotId) {
        if (!slotId || !this.activeSlots.has(slotId)) return;
        const slot = this.activeSlots.get(slotId);
        this.activeSlots.delete(slotId);
        this.inflightRequests = this.activeSlots.size;

        // Reclaim pre-reserved request and token budgets
        const tokenIdx = this.tokenUsage.findIndex(e => e.slotId === slotId);
        if (tokenIdx !== -1) {
            this.tokenUsage.splice(tokenIdx, 1);
        }
        const reqIdx = this.requestTimestamps.indexOf(slot.timestamp);
        if (reqIdx !== -1) {
            this.requestTimestamps.splice(reqIdx, 1);
        }
        const dailyIdx = this.dailyRequests.indexOf(slot.timestamp);
        if (dailyIdx !== -1) {
            this.dailyRequests.splice(dailyIdx, 1);
        }
        this._drainDispatchQueue();
    }

    /**
     * PROACTIVE TOKEN-BUCKET SCHEDULER:
     * Pre-reserves slot and budget BEFORE dispatching to prevent 429 rate limit spikes under concurrency.
     */
    async acquireDispatchSlot(optionsOrModel = {}, estimatedTokensArg = 1200, timeoutArg = 10000, extraOptions = {}) {
        let options = {};
        if (typeof optionsOrModel === 'string') {
            options = {
                model: optionsOrModel,
                estimatedTokens: estimatedTokensArg,
                timeout: timeoutArg,
                ...(typeof extraOptions === 'object' ? extraOptions : {})
            };
        } else if (optionsOrModel && typeof optionsOrModel === 'object') {
            options = { ...optionsOrModel };
        }

        const {
            estimatedTokens = 1200,
            model = this.defaultModel,
            priority = 1,
            timeout = 10000,
            maxDuration = 90000
        } = options;

        const startTime = Date.now();
        const slotId = `slot_${++this.slotCounter}_${startTime}`;

        return new Promise((resolve) => {
            const queueItem = {
                slotId,
                resolve,
                estimatedTokens,
                model,
                priority,
                startTime,
                maxDuration,
                timeoutTimer: null
            };

            // Immediate slot allocation if under limits
            if (this._canDispatchNow(estimatedTokens)) {
                this._reserveSlot(slotId, model, estimatedTokens, maxDuration);
                return resolve({ granted: true, waitedMs: 0, immediate: true, slotId });
            }

            // Otherwise, enqueue and schedule orderly drainage
            queueItem.timeoutTimer = setTimeout(() => {
                this._removeFromQueue(queueItem);
                
                // V2: Không tự cấp slot cưỡng bức nếu đang vi phạm quota.
                // Thử tìm model fallback còn quota trước:
                const viableFallback = this.getFallbackModel(model, 1);
                if (viableFallback && this.isModelAvailable(viableFallback) && this._canDispatchNow(estimatedTokens)) {
                    console.log(`🔄 [QuotaScheduler V2] Queue wait completed: Điều tuyến sang model khả dụng [${viableFallback}]`);
                    this._reserveSlot(slotId, viableFallback, estimatedTokens, maxDuration);
                    return resolve({ granted: true, waitedMs: Date.now() - startTime, model: viableFallback, slotId });
                }

                // Nếu tất cả model đều kẹt quota, từ chối cấp slot cưỡng bức để bảo vệ hạn mức RPM/TPM/RPD
                console.warn(`⏳ [QuotaScheduler V2] Queue wait timeout (${timeout}ms). Giữ vững kỷ luật quota, hoãn slot.`);
                resolve({ granted: false, waitedMs: Date.now() - startTime, quotaDeferred: true, slotId });
            }, timeout);

            this.dispatchQueue.push(queueItem);
            this.dispatchQueue.sort((a, b) => (b.priority - a.priority) || (a.startTime - b.startTime));
            this._scheduleNextDrain();
        });
    }

    _scheduleNextDrain() {
        if (this.schedulerTimer || this.dispatchQueue.length === 0) return;

        this.cleanSlidingWindows();
        const oldestTs = this.requestTimestamps[0] || Date.now();
        const timeUntilWindowSlot = Math.max(100, (oldestTs + 60000) - Date.now() + 50);

        this.schedulerTimer = setTimeout(() => {
            this.schedulerTimer = null;
            this._drainDispatchQueue();
        }, Math.min(timeUntilWindowSlot, 1000));
        if (this.schedulerTimer && typeof this.schedulerTimer.unref === 'function') {
            this.schedulerTimer.unref();
        }
    }

    _drainDispatchQueue() {
        while (this.dispatchQueue.length > 0) {
            const nextItem = this.dispatchQueue[0];
            if (this._canDispatchNow(nextItem.estimatedTokens)) {
                this.dispatchQueue.shift();
                if (nextItem.timeoutTimer) clearTimeout(nextItem.timeoutTimer);
                this._reserveSlot(nextItem.slotId, nextItem.model, nextItem.estimatedTokens, nextItem.maxDuration);
                nextItem.resolve({ granted: true, waitedMs: Date.now() - nextItem.startTime, immediate: false, slotId: nextItem.slotId });
            } else {
                this._scheduleNextDrain();
                break;
            }
        }
    }

    _removeFromQueue(item) {
        const idx = this.dispatchQueue.indexOf(item);
        if (idx !== -1) this.dispatchQueue.splice(idx, 1);
    }

    /**
     * Release slot upon API completion and reconcile actual tokens (Fix for Lỗi 3)
     */
    releaseDispatchSlot(actualTokens = 1000, model = '', slotId = null) {
        let targetSlotId = slotId;
        let removedSlot = null;
        if (targetSlotId) {
            // Đối chiếu chính xác slotId: Nếu slotId được truyền vào thì BẮT BUỘC phải tìm đúng slotId
            if (this.activeSlots.has(targetSlotId)) {
                removedSlot = this.activeSlots.get(targetSlotId);
                this.activeSlots.delete(targetSlotId);
            } else {
                // slotId không tồn tại hoặc đã được giải phóng -> TUYỆT ĐỐI KHÔNG giải phóng nhầm slot của request khác!
                this._drainDispatchQueue();
                return;
            }
        } else if (this.activeSlots.size > 0) {
            // Chỉ fallback lấy slot lâu nhất khi caller là legacy code không truyền slotId (slotId == null)
            targetSlotId = this.activeSlots.keys().next().value;
            if (targetSlotId) {
                removedSlot = this.activeSlots.get(targetSlotId);
                this.activeSlots.delete(targetSlotId);
            }
        }
        this.inflightRequests = this.activeSlots.size;

        // Reconcile pre-reserved tokens with actual tokens
        let reconciled = false;
        if (targetSlotId) {
            const entry = this.tokenUsage.find(e => e.slotId === targetSlotId);
            if (entry) {
                entry.tokens = actualTokens;
                entry.isReserved = false;
                reconciled = true;
            }
        }
        if (!reconciled) {
            this.recordUsage(actualTokens, model);
        }

        this._drainDispatchQueue();
    }

    /**
     * Record successful API call tokens and request count
     */
    recordUsage(estimatedTokens = 1000, model = '') {
        this.cleanSlidingWindows();
        const now = Date.now();
        this.requestTimestamps.push(now);
        this.dailyRequests.push(now);
        this.tokenUsage.push({ timestamp: now, tokens: estimatedTokens });
    }

    /**
     * Check if a specific model is currently available (not in cooldown)
     */
    isModelAvailable(model) {
        if (!model) return false;
        const cooldownUntil = this.modelCooldowns.get(model);
        if (cooldownUntil && Date.now() < cooldownUntil) {
            return false;
        }
        return true;
    }

    /**
     * Check if global circuit breaker is active
     */
    isCircuitBreakerTripped() {
        return Date.now() < this.globalCooldownUntil;
    }

    get quotas() {
        return this.limits;
    }

    parseRetryDelay(errorDetails) {
        if (!errorDetails) return 0;
        try {
            const text = typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails);
            const hourMatch = text.match(/(\d+)\s*h(?:our|ours)?/i);
            const minMatch = text.match(/(\d+)\s*m(?:in|inute|inutes)?(?![a-z])/i);
            const secMatch = text.match(/(\d+(?:\.\d+)?)\s*s(?:ec|econd|econds)?(?![a-z])/i);

            let parsedSeconds = 0;
            if (hourMatch) parsedSeconds += parseInt(hourMatch[1], 10) * 3600;
            if (minMatch) parsedSeconds += parseInt(minMatch[1], 10) * 60;
            if (secMatch) parsedSeconds += parseFloat(secMatch[1]);

            return Math.round(parsedSeconds * 1000);
        } catch (e) {
            return 0;
        }
    }

    calculateBackoff(model, baseDelayMs = 20000) {
        const jitter = Math.floor(Math.random() * Math.min(baseDelayMs * 0.2, 4000));
        return baseDelayMs + jitter;
    }

    async acquireSlot(model, estimatedTokens, timeoutMs, options) {
        return this.acquireDispatchSlot(model, estimatedTokens, timeoutMs, options);
    }

    /**
     * Record quota / 429 error and update cooldowns with dynamic retryDelay parsing
     */
    recordQuotaError(model, statusCodeOrErr = 429, errorDetails = '') {
        let statusCode = 429;
        let details = errorDetails;

        if (typeof statusCodeOrErr === 'number') {
            statusCode = statusCodeOrErr;
        } else if (statusCodeOrErr && typeof statusCodeOrErr === 'object') {
            details = statusCodeOrErr;
            statusCode = statusCodeOrErr.status || statusCodeOrErr.statusCode || 429;
        }

        const now = Date.now();
        let cooldownDuration = statusCode === 503 ? 5000 : 60000;

        // Bóc tách retryDelay động từ phản hồi của Gemini API
        if (details) {
            try {
                const parsedMs = this.parseRetryDelay(details);
                if (parsedMs > 0) {
                    cooldownDuration = this.calculateBackoff(model, parsedMs);
                }
            } catch (e) {}
        }

        if (statusCode === 429 || statusCode === 503) {
            this.modelCooldowns.set(model, now + cooldownDuration);
            console.warn(`⚠️ [ModelRouter Quota Guard] Model [${model}] gặp lỗi ${statusCode}. Dynamic cooldown ${Math.round(cooldownDuration / 1000)}s.`);

            // Check if all models in FALLBACK_POOL are currently exhausted
            const pool = this.registry.FALLBACK_POOL || [];
            const allExhausted = pool.every(m => !this.isModelAvailable(m));

            if (allExhausted && statusCode === 429) {
                this.globalCooldownUntil = now + Math.min(cooldownDuration, 30000); // Max 30s pause for circuit breaker
                console.warn(`⚠️ [ModelRouter Circuit Breaker] Các model trong pool đang phục hồi nhịp độ quota...`);
            }
        }
    }

    /**
     * Get real-time budget and quota status
     */
    getBudgetStatus() {
        this.cleanSlidingWindows();
        const currentRPM = this.requestTimestamps.length;
        const currentTPM = this.tokenUsage.reduce((sum, item) => sum + (item.tokens || 0), 0);
        const currentRPD = this.dailyRequests.length;

        return {
            rpm: {
                current: currentRPM,
                limit: this.limits.maxRPM,
                percent: Math.min(100, Math.round((currentRPM / this.limits.maxRPM) * 100))
            },
            tpm: {
                current: currentTPM,
                limit: this.limits.maxTPM,
                percent: Math.min(100, Math.round((currentTPM / this.limits.maxTPM) * 100))
            },
            rpd: {
                current: currentRPD,
                limit: this.limits.maxRPD,
                percent: Math.min(100, Math.round((currentRPD / this.limits.maxRPD) * 100))
            },
            scheduler: {
                inflightRequests: this.inflightRequests,
                maxInflight: this.maxInflight,
                queueLength: this.dispatchQueue.length
            },
            circuitBreaker: {
                tripped: this.isCircuitBreakerTripped(),
                remainingMs: Math.max(0, this.globalCooldownUntil - Date.now()),
                cooldownModels: Array.from(this.modelCooldowns.entries())
                    .filter(([_, until]) => Date.now() < until)
                    .map(([model, until]) => ({ model, remainingSeconds: Math.ceil((until - Date.now()) / 1000) }))
            }
        };
    }

    /**
     * Resolve the optimal model based on agent role and task mode
     */
    resolveModel(role = 'developer', mode = 'standard') {
        let chosenTier = 'STANDARD';

        if (mode === 'fast') {
            chosenTier = 'FAST';
        } else if (mode === 'deep_research' || mode === 'autonomous') {
            if (role === 'director' || role === 'critic' || role === 'consensus') {
                chosenTier = 'REASONING';
            } else {
                chosenTier = 'STANDARD';
            }
        } else {
            // standard mode
            if (role === 'director' || role === 'critic') {
                chosenTier = 'REASONING';
            } else {
                chosenTier = 'STANDARD';
            }
        }

        let model = this.registry[chosenTier] || this.defaultModel;

        // If the chosen model is in cooldown due to 429, pick an available fallback
        if (!this.isModelAvailable(model)) {
            const fallback = this.getFallbackModel(model, 1);
            if (fallback) {
                console.warn(`🔄 [ModelRouter] Model [${model}] đang trong cooldown 429, tự động định tuyến sang [${fallback}]`);
                model = fallback;
            }
        }

        this.logDispatch(role, mode, chosenTier, model);
        return model;
    }

    /**
     * Get fallback model on retry with Quota & Cooldown awareness
     */
    getFallbackModel(currentModel, attempt = 1) {
        this.cleanSlidingWindows();

        const pool = this.registry.FALLBACK_POOL || [];
        if (pool.length === 0) return this.defaultModel || 'gemini-3.5-flash';

        // Ưu tiên chọn model khác model hiện tại VÀ không đang trong thời gian cooldown 429
        const viable = pool.filter(m => m !== currentModel && this.isModelAvailable(m));

        if (viable.length > 0) {
            const nextModel = viable[(attempt - 1) % viable.length];
            console.log(`🔄 [ModelRouter] Fallback khả dụng (attempt ${attempt}): [${currentModel}] -> [${nextModel}]`);
            return nextModel;
        }

        // Nếu tất cả candidate khác đều cooldown, kiểm tra lại toàn bộ pool
        const anyViable = pool.filter(m => this.isModelAvailable(m));
        if (anyViable.length > 0) {
            return anyViable[0];
        }

        // Circuit Breaker: Nếu toàn bộ Fallback Pool đều dính 429, ngắt mạch hoàn toàn và trả về null để dừng spam
        if (this.isCircuitBreakerTripped()) {
            return null;
        }

        // Nếu chưa trip circuit breaker, chọn model có thời gian cooldown sắp hết nhất
        let earliestModel = pool[0];
        let minCooldown = Infinity;
        for (const m of pool) {
            const cd = this.modelCooldowns.get(m) || 0;
            if (cd < minCooldown) {
                minCooldown = cd;
                earliestModel = m;
            }
        }
        return earliestModel || this.defaultModel || 'gemini-3.5-flash-lite';
    }

    logDispatch(role, mode, tier, model) {
        this.dispatchLog.push({
            timestamp: new Date().toISOString(),
            role,
            mode,
            tier,
            model
        });
        if (this.dispatchLog.length > 200) this.dispatchLog.shift();
    }

    getStats() {
        return {
            totalDispatches: this.dispatchLog.length,
            recentDispatches: this.dispatchLog.slice(-10),
            registry: this.registry,
            budget: this.getBudgetStatus()
        };
    }
}

module.exports = { ModelRouter };
