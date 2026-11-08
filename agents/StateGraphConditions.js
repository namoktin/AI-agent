/**
 * StateGraphConditions.js
 * Cyber Agent Pro v5.7 - Hardened Persistent Condition Registry & Condition DSL
 * 
 * Provides built-in verifiable condition predicates that persist across server restarts,
 * and handles persistent serialization/restoration of dynamic graph conditions
 * using a safe, declarative AST/DSL without eval or new Function (Zero Arbitrary Code Execution).
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

/**
 * Safely extract a property by dotted path without prototype pollution or code injection
 */
function safeGet(obj, pathStr) {
    if (!obj || typeof obj !== 'object' || typeof pathStr !== 'string') return undefined;
    const cleanPath = pathStr.replace(/^state\./, '').trim();
    if (!cleanPath) return obj;
    const parts = cleanPath.split('.');
    let curr = obj;
    for (const p of parts) {
        if (!p || p === '__proto__' || p === 'constructor' || p === 'prototype') return undefined;
        if (curr == null) return undefined;
        curr = curr[p];
    }
    return curr;
}

const ALLOWED_LOGICAL_OPS = new Set(['and', 'or', 'not']);
const ALLOWED_COMPARISON_OPS = new Set([
    'equals', '==', '===',
    'not_equals', '!=', '!==',
    'gt', '>',
    'gte', '>=',
    'lt', '<',
    'lte', '<=',
    'in',
    'contains',
    'exists',
    'truthy',
    'falsy'
]);

/**
 * Update 21: Strict schema validator for Condition DSL descriptors
 * Limits nesting depth to 5, max child conditions to 20, validates operators and field paths
 */
function validateDslDescriptor(dsl, depth = 0) {
    if (!dsl || typeof dsl !== 'object') return false;
    if (depth > 5) return false; // Enforce nesting depth limit

    const type = dsl.type || 'comparison';

    if (type === 'logical') {
        const op = String(dsl.operator || 'and').toLowerCase();
        if (!ALLOWED_LOGICAL_OPS.has(op)) return false;

        const conditions = Array.isArray(dsl.conditions) ? dsl.conditions : [];
        if (op === 'not') {
            const target = (conditions.length > 0) ? conditions[0] : dsl.condition;
            if (!target || typeof target !== 'object') return false;
            return validateDslDescriptor(target, depth + 1);
        }

        // For 'and' or 'or', conditions must be non-empty array with <= 20 items
        if (conditions.length === 0 || conditions.length > 20) return false;
        return conditions.every(c => validateDslDescriptor(c, depth + 1));
    }

    if (type === 'key_equals') {
        if (!dsl.key || typeof dsl.key !== 'string') return false;
        if (/__(?:proto|lookup[GS]etter)__|constructor|prototype/.test(dsl.key)) return false;
        return true;
    }

    if (type === 'comparison') {
        const op = String(dsl.operator || 'equals').toLowerCase();
        if (!ALLOWED_COMPARISON_OPS.has(op)) return false;

        const pathStr = dsl.path || dsl.key;
        if (!pathStr || typeof pathStr !== 'string') return false;
        if (/__(?:proto|lookup[GS]etter)__|constructor|prototype/.test(pathStr)) return false;
        return true;
    }

    return false;
}

/**
 * Safely evaluate a declarative condition DSL descriptor against state and graph
 * Supported types:
 * 1. 'comparison': { type: 'comparison', path: 'state.metric', operator: '>', value: 50 }
 * 2. 'logical': { type: 'logical', operator: 'and'|'or'|'not', conditions: [ ... ] }
 * 3. 'key_equals': { type: 'key_equals', key: 'approved', value: true }
 */
function safeEvaluateDsl(dsl, state, graph) {
    if (!validateDslDescriptor(dsl)) return false;

    // Logical Combinators
    if (dsl.type === 'logical') {
        const op = String(dsl.operator || 'and').toLowerCase();
        const conditions = Array.isArray(dsl.conditions) ? dsl.conditions : [];
        if (op === 'and') return conditions.every(c => safeEvaluateDsl(c, state, graph));
        if (op === 'or') return conditions.some(c => safeEvaluateDsl(c, state, graph));
        if (op === 'not') {
            const target = (conditions.length > 0) ? conditions[0] : dsl.condition;
            if (!target) return false; // Fail closed on missing NOT target
            return !safeEvaluateDsl(target, state, graph);
        }
        return false;
    }

    // Key-Equals shorthand
    if (dsl.type === 'key_equals') {
        const val = safeGet(state, dsl.key);
        return val === dsl.value;
    }

    // Comparison AST
    if (dsl.type === 'comparison' || !dsl.type) {
        const pathStr = dsl.path || dsl.key || '';
        const val = safeGet(state, pathStr);
        const target = dsl.value;
        const op = String(dsl.operator || 'equals').toLowerCase();

        switch (op) {
            case 'equals':
            case '==':
            case '===':
                return val === target;
            case 'not_equals':
            case '!=':
            case '!==':
                return val !== target;
            case 'gt':
            case '>':
                return Number(val) > Number(target);
            case 'gte':
            case '>=':
                return Number(val) >= Number(target);
            case 'lt':
            case '<':
                return Number(val) < Number(target);
            case 'lte':
            case '<=':
                return Number(val) <= Number(target);
            case 'in':
                return Array.isArray(target) && target.includes(val);
            case 'contains':
                if (typeof val === 'string') return val.includes(String(target));
                if (Array.isArray(val)) return val.includes(target);
                return false;
            case 'exists':
                return val !== undefined && val !== null && val !== '';
            case 'truthy':
                return Boolean(val);
            case 'falsy':
                return !val;
            default:
                return false; // Strict: Unrecognized operator fails closed
        }
    }

    return false;
}

/**
 * Safely parse a simple legacy binary expression string into safe DSL AST
 * STRICT: Rejects any complex statements, function calls, or malicious syntax
 */
function parseExpressionToDsl(expr) {
    if (!expr || typeof expr !== 'string') return null;
    const trimmed = expr.trim();

    // Match pattern: (state.path || 0) > 50 or state.path === true
    const match = trimmed.match(/^(?:\(?\s*state\.([a-zA-Z0-9_.]+)(?:\s*\|\|\s*0)?\s*\)?)\s*(===|==|!==|!=|>=|<=|>|<)\s*([a-zA-Z0-9_.-]+|'[^']*'|"[^"]*")$/);
    if (!match) return null;

    const path = match[1];
    const rawOp = match[2];
    const rawVal = match[3];

    let op = rawOp;
    if (rawOp === '===' || rawOp === '==') op = 'equals';
    else if (rawOp === '!==' || rawOp === '!=') op = 'not_equals';

    let val = rawVal;
    if (rawVal === 'true') val = true;
    else if (rawVal === 'false') val = false;
    else if (rawVal === 'null') val = null;
    else if (!isNaN(Number(rawVal))) val = Number(rawVal);
    else val = rawVal.replace(/^['"]|['"]$/g, '');

    return {
        type: 'comparison',
        path,
        operator: op,
        value: val
    };
}

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
                    this._compileAndRegister(id, desc, false);
                }
            }
        } catch (e) {
            console.warn('[ConditionRegistry] Error loading persisted conditions:', e.message);
        }
    }

    _compileAndRegister(id, desc, persist = true) {
        if (!desc || typeof desc !== 'object') return false;

        let dslObj = desc;

        // Legacy expression format: convert to DSL AST (NEVER use new Function or eval!)
        if (desc.type === 'expression' && typeof desc.expr === 'string') {
            const parsed = parseExpressionToDsl(desc.expr);
            if (!parsed) {
                console.warn(`[ConditionRegistry] REJECTED unsafe or unparseable expression for [${id}]: "${desc.expr}". Only safe Condition DSL is permitted.`);
                return false;
            }
            dslObj = parsed;
        }

        // Schema validation
        if (!validateDslDescriptor(dslObj)) {
            console.warn(`[ConditionRegistry] REJECTED invalid condition descriptor schema for [${id}]`);
            return false;
        }

        // Pure safe DSL evaluation closure
        const fn = (state, graph) => safeEvaluateDsl(dslObj, state, graph);
        this.conditions.set(id, fn);
        this.descriptors.set(id, dslObj);

        if (persist) {
            this._persist();
        }
        return true;
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
                this._compileAndRegister(id, descriptor, true);
            }
        } else if (typeof fnOrDescriptor === 'object' && fnOrDescriptor !== null) {
            this._compileAndRegister(id, fnOrDescriptor, true);
        }
        return this;
    }

    get(id) {
        // If not in cache, try reloading from disk in case another process updated the file
        if (!this.conditions.has(id)) {
            this._loadPersisted();
        }
        return this.conditions.get(id) || null;
    }

    has(id) {
        if (this.conditions.has(id)) return true;
        this._loadPersisted();
        return this.conditions.has(id);
    }

    getAll() {
        return new Map(this.conditions);
    }
}

const globalConditionRegistry = new PersistentConditionRegistry();

module.exports = {
    globalConditionRegistry,
    builtInConditions,
    safeGet,
    safeEvaluateDsl,
    parseExpressionToDsl,
    validateDslDescriptor,
    ALLOWED_LOGICAL_OPS,
    ALLOWED_COMPARISON_OPS
};
