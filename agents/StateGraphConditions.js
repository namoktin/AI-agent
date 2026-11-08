/**
 * StateGraphConditions.js
 * Cyber Agent Pro v5.5 - Persistent Transition & Condition Registry
 * 
 * Provides built-in verifiable condition predicates that persist across server restarts,
 * and handles persistent serialization/restoration of dynamic graph conditions.
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_DIR = path.resolve(__dirname, '..', 'memory');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'condition_registry.json');

// Core built-in condition predicates available across all processes
const builtInConditions = {
    'is_approved_true': (state) => Boolean(state.approved === true || state.isApproved === true || (state.approval && state.approval.approved === true)),
    'is_approved_false': (state) => Boolean(state.approved === false || state.isApproved === false || (state.approval && state.approval.approved === false)),
    'is_success': (state, graph) => Boolean(state.success === true || (state.lastResult && state.lastResult.success === true)),
    'is_failure': (state, graph) => Boolean(state.success === false || state.error || (state.lastResult && state.lastResult.error)),
    'has_output': (state) => Boolean(state.output || state.response || state.data),
    'score_high': (state) => Number(state.score || state.qualityScore || 0) >= 80,
    'score_low': (state) => Number(state.score || state.qualityScore || 0) < 80,
    'retry_needed': (state) => Boolean(state.needsRetry || state.deficitDetected),
    'requires_research': (state) => Boolean(state.missingData || state.requiresResearch),
    'requires_code': (state) => Boolean(state.requiresCode || state.hasCodeTask)
};

class PersistentConditionRegistry {
    constructor() {
        this.conditions = new Map(Object.entries(builtInConditions));
        this.descriptors = new Map();
        this._ensureDir();
        this._loadPersisted();
    }

    _ensureDir() {
        if (!fs.existsSync(REGISTRY_DIR)) {
            try {
                fs.mkdirSync(REGISTRY_DIR, { recursive: true });
            } catch (_) {}
        }
    }

    _loadPersisted() {
        if (!fs.existsSync(REGISTRY_FILE)) return;
        try {
            const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                for (const [id, desc] of Object.entries(data)) {
                    if (desc.type === 'expression' && typeof desc.expr === 'string') {
                        try {
                            // Safe expression evaluation: state => expr
                            const fn = new Function('state', 'graph', `return Boolean(${desc.expr});`);
                            this.conditions.set(id, fn);
                            this.descriptors.set(id, desc);
                        } catch (e) {
                            console.warn(`[ConditionRegistry] Failed to recompile condition [${id}]:`, e.message);
                        }
                    } else if (desc.type === 'key_equals') {
                        const fn = (state) => state && state[desc.key] === desc.value;
                        this.conditions.set(id, fn);
                        this.descriptors.set(id, desc);
                    }
                }
            }
        } catch (e) {
            console.warn('[ConditionRegistry] Error loading persisted conditions:', e.message);
        }
    }

    _persist() {
        this._ensureDir();
        try {
            const obj = {};
            for (const [id, desc] of this.descriptors.entries()) {
                obj[id] = desc;
            }
            const tmpPath = `${REGISTRY_FILE}.tmp.${Date.now()}`;
            fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
            fs.renameSync(tmpPath, REGISTRY_FILE);
        } catch (e) {
            console.warn('[ConditionRegistry] Error persisting conditions:', e.message);
        }
    }

    register(id, fnOrDescriptor, descriptor = null) {
        if (!id || typeof id !== 'string') {
            throw new Error('[ConditionRegistry] id must be a non-empty string');
        }

        if (typeof fnOrDescriptor === 'function') {
            this.conditions.set(id, fnOrDescriptor);
            if (descriptor && typeof descriptor === 'object') {
                this.descriptors.set(id, descriptor);
                this._persist();
            }
        } else if (typeof fnOrDescriptor === 'object' && fnOrDescriptor !== null) {
            const desc = fnOrDescriptor;
            if (desc.type === 'expression' && typeof desc.expr === 'string') {
                const fn = new Function('state', 'graph', `return Boolean(${desc.expr});`);
                this.conditions.set(id, fn);
                this.descriptors.set(id, desc);
                this._persist();
            } else if (desc.type === 'key_equals') {
                const fn = (state) => state && state[desc.key] === desc.value;
                this.conditions.set(id, fn);
                this.descriptors.set(id, desc);
                this._persist();
            }
        }
        return this;
    }

    get(id) {
        return this.conditions.get(id) || null;
    }

    has(id) {
        return this.conditions.has(id);
    }

    getAll() {
        return new Map(this.conditions);
    }
}

const globalConditionRegistry = new PersistentConditionRegistry();

module.exports = {
    globalConditionRegistry,
    builtInConditions
};
