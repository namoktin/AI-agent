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

        // Tự động giải phóng các slot đang bay bị treo (stale inflight slots > 45s) để chống nghẽn vĩnh viễn
        const staleThreshold = now - 45000;
        for (const [sId, sInfo] of this.activeSlots.entries()) {
            if (sInfo.timestamp < staleThreshold) {
                this.activeSlots.delete(sId);
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

        // 4. TPM Limit
        const currentTPM = this.tokenUsage.reduce((s, x) => s + (x.tokens || 0), 0);
        if (currentTPM + estimatedTokens > this.limits.maxTPM) return false;

        return true;
    }

    /**
     * PROACTIVE TOKEN-BUCKET SCHEDULER:
     * Reserves slot and queues request BEFORE dispatching to prevent 429 rate limit spikes.
     */
    async acquireDispatchSlot(options = {}) {
        const { estimatedTokens = 1200, model = this.defaultModel, priority = 1, timeout = 10000 } = options;
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
                timeoutTimer: null
            };

            // Immediate slot allocation if under limits
            if (this._canDispatchNow(estimatedTokens)) {
                this.activeSlots.set(slotId, { timestamp: Date.now(), model });
                this.inflightRequests = this.activeSlots.size;
                return resolve({ granted: true, waitedMs: 0, immediate: true, slotId });
            }

            // Otherwise, enqueue and schedule orderly drainage
            queueItem.timeoutTimer = setTimeout(() => {
                this._removeFromQueue(queueItem);
                this.activeSlots.set(slotId, { timestamp: Date.now(), model });
                this.inflightRequests = this.activeSlots.size;
                console.warn(`⏳ [QuotaScheduler] Queue wait timeout (${timeout}ms). Force granting slot.`);
                resolve({ granted: true, waitedMs: Date.now() - startTime, forced: true, slotId });
            }, timeout);

            this.dispatchQueue.push(queueItem);
            this.dispatchQueue.sort((a, b) => b.priority - a.priority);
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
    }

    _drainDispatchQueue() {
        while (this.dispatchQueue.length > 0) {
            const nextItem = this.dispatchQueue[0];
            if (this._canDispatchNow(nextItem.estimatedTokens)) {
                this.dispatchQueue.shift();
                if (nextItem.timeoutTimer) clearTimeout(nextItem.timeoutTimer);
                this.activeSlots.set(nextItem.slotId, { timestamp: Date.now(), model: nextItem.model });
                this.inflightRequests = this.activeSlots.size;
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
     * Release slot upon API completion
     */
    releaseDispatchSlot(actualTokens = 1000, model = '', slotId = null) {
        if (slotId && this.activeSlots.has(slotId)) {
            this.activeSlots.delete(slotId);
        } else if (this.activeSlots.size > 0) {
            const oldestKey = this.activeSlots.keys().next().value;
            if (oldestKey) this.activeSlots.delete(oldestKey);
        }
        this.inflightRequests = this.activeSlots.size;
        this.recordUsage(actualTokens, model);
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

    /**
     * Record quota / 429 error and update cooldowns
     */
    recordQuotaError(model, statusCode = 429, errorDetails = '') {
        const now = Date.now();
        // 503 là lỗi quá tải tạm thời (Spike in demand) nên chỉ cần cooldown 5 giây; 429 là hết hạn ngạch nên cooldown 60 giây
        const cooldownDuration = statusCode === 503 ? 5000 : 60000;

        if (statusCode === 429 || statusCode === 503) {
            this.modelCooldowns.set(model, now + cooldownDuration);
            console.warn(`⚠️ [ModelRouter Quota Guard] Model [${model}] gặp lỗi ${statusCode}. Cooldown ${cooldownDuration / 1000}s.`);

            // Check if all models in FALLBACK_POOL are currently exhausted
            const pool = this.registry.FALLBACK_POOL || [];
            const allExhausted = pool.every(m => !this.isModelAvailable(m));

            if (allExhausted && statusCode === 429) {
                this.globalCooldownUntil = now + 30000; // 30s pause
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
