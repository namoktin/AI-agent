/**
 * ModelRouter.js - Centralized Model Registry, Quota Guard and Dynamic Routing Engine
 * Cyber Agent Pro v4.0 Ultimate
 */

class ModelRouter {
    constructor(customConfig = {}) {
        this.defaultModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

        // Unified Model Registry with Distinct Tiers (Fast, Standard, Reasoning Pro)
        this.registry = {
            FAST: process.env.GEMINI_MODEL_FAST || 'gemini-3.1-flash-lite',
            STANDARD: process.env.GEMINI_MODEL_STANDARD || this.defaultModel || 'gemini-3.5-flash',
            REASONING: process.env.GEMINI_MODEL_HEAVY || 'gemini-3.5-flash',
            FALLBACK_POOL: [
                'gemini-3.5-flash',
                'gemini-3.5-flash-lite',
                'gemini-3.1-flash-lite',
                'gemini-3-flash-preview'
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
        const cooldownDuration = 60000; // 60s cooldown

        if (statusCode === 429 || statusCode === 503) {
            this.modelCooldowns.set(model, now + cooldownDuration);
            console.warn(`⚠️ [ModelRouter Quota Guard] Model [${model}] gặp lỗi ${statusCode}. Cooldown 60s.`);

            // Check if all models in FALLBACK_POOL are currently exhausted
            const pool = this.registry.FALLBACK_POOL || [];
            const allExhausted = pool.every(m => !this.isModelAvailable(m));

            if (allExhausted) {
                this.globalCooldownUntil = now + cooldownDuration;
                console.error(`🚨 [ModelRouter Circuit Breaker] TOÀN BỘ model trong pool đều chạm hạn ngạch 429! Kích hoạt tạm dừng 60s để tránh đứt gãy nhiệm vụ.`);
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

        if (this.isCircuitBreakerTripped()) {
            const remaining = Math.ceil((this.globalCooldownUntil - Date.now()) / 1000);
            console.warn(`⏸️ [ModelRouter] Circuit Breaker đang kích hoạt. Tạm dừng chuyển model trong ${remaining}s.`);
            return null;
        }

        const pool = this.registry.FALLBACK_POOL || [];
        if (pool.length === 0) return this.defaultModel;

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

        // Toàn bộ pool đã dính 429 -> Kích hoạt Circuit Breaker
        this.globalCooldownUntil = Date.now() + 60000;
        console.error(`🚨 [ModelRouter] Tất cả các model trong Fallback Pool đều đã chạm giới hạn 429. Dừng chuyển model để bảo vệ API key.`);
        return null;
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
