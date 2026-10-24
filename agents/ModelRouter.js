/**
 * ModelRouter.js - Centralized Model Registry and Dynamic Routing Engine
 * Cyber Agent Pro v3.5 Ultimate
 */

class ModelRouter {
    constructor(customConfig = {}) {
        this.defaultModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

        // Unified Model Registry with Tiers
        this.registry = {
            FAST: process.env.GEMINI_MODEL_FAST || 'gemini-flash-lite-latest',
            STANDARD: this.defaultModel,
            REASONING: process.env.GEMINI_MODEL_HEAVY || this.defaultModel,
            FALLBACK_POOL: [
                'gemini-3.1-flash-lite',
                'gemini-flash-lite-latest',
                'gemini-3.1-flash-lite-preview'
            ],
            ...customConfig
        };

        // Usage and fallback tracking
        this.dispatchLog = [];
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

        const model = this.registry[chosenTier] || this.defaultModel;
        this.logDispatch(role, mode, chosenTier, model);
        return model;
    }

    /**
     * Get fallback model on retry (e.g. Rate Limit / 429)
     */
    getFallbackModel(currentModel, attempt = 1) {
        const pool = this.registry.FALLBACK_POOL;
        if (!pool || pool.length === 0) return this.defaultModel;

        const nextModel = pool[(attempt - 1) % pool.length];
        console.log(`🔄 [ModelRouter] Fallback (attempt ${attempt}): [${currentModel}] -> [${nextModel}]`);
        return nextModel;
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
            registry: this.registry
        };
    }
}

module.exports = { ModelRouter };
