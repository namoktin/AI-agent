/**
 * 💾 CONTEXT CACHE MANAGER
 *
 * Gemini Context Caching để giảm latency và cost:
 * - Cache system prompts của các agents
 * - Cache long-term memory
 * - Automatic TTL management
 * - Cost tracking
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Fetch polyfill
function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const requestOptions = {
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.signal?._timeout || 180000
        };

        const req = client.request(url, requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: async () => JSON.parse(data),
                    text: async () => data
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

class ContextCacheManager {
    constructor(geminiApiKey) {
        this.apiKey = geminiApiKey;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.caches = new Map();
        this.inMemoryCache = new Map();
        this.MIN_REMOTE_CACHE_TOKENS = 32768; // Gemini API CachedContents requires >= 32,768 tokens
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            totalSaved: 0 // tokens saved
        };
    }

    /**
     * Create or retrieve cached content
     */
    async getCachedContent(name, content, model = 'gemini-3.8-flash', ttlSeconds = 3600) {
        // Check if cache exists and is valid
        const existing = this.caches.get(name);
        if (existing && existing.expireTime > new Date()) {
            this.stats.cacheHits++;
            this.stats.totalSaved += existing.tokensCount || 0;
            console.log(`💾 Cache HIT: ${name}`);
            return existing.cacheName;
        }

        // Create new cached content
        this.stats.cacheMisses++;
        const estimatedTokens = this.estimateTokens(content || '');
        console.log(`🔄 Cache MISS: Creating cache for ${name} (~${estimatedTokens} tokens)`);

        // If content is below Gemini's 32,768 token threshold or no API key, use in-memory cache
        if (estimatedTokens < this.MIN_REMOTE_CACHE_TOKENS || !this.apiKey) {
            const cacheName = `in_memory_${name}`;
            const meta = {
                cacheName: cacheName,
                content: content,
                expireTime: new Date(Date.now() + ttlSeconds * 1000),
                createTime: new Date(),
                model: model,
                tokensCount: estimatedTokens,
                isLocal: true
            };
            this.caches.set(name, meta);
            this.inMemoryCache.set(name, meta);
            console.log(`💾 Stored in local memory cache (${estimatedTokens} tokens < ${this.MIN_REMOTE_CACHE_TOKENS} remote threshold): ${name}`);
            return cacheName;
        }

        try {
            const cleanModel = model.replace(/^models\//, '');
            const response = await fetch(`${this.baseUrl}/cachedContents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey
                },
                body: JSON.stringify({
                    model: `models/${cleanModel}`,
                    contents: [{
                        role: 'user',
                        parts: [{ text: content }]
                    }],
                    ttl: `${ttlSeconds}s`,
                    displayName: name
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.warn(`⚠️ Remote cache creation rejected: ${error}. Falling back to memory cache.`);
                const fallbackName = `in_memory_${name}`;
                const fallbackMeta = {
                    cacheName: fallbackName,
                    content: content,
                    expireTime: new Date(Date.now() + ttlSeconds * 1000),
                    createTime: new Date(),
                    model: model,
                    tokensCount: estimatedTokens,
                    isLocal: true
                };
                this.caches.set(name, fallbackMeta);
                return fallbackName;
            }

            const data = await response.json();

            // Store cache metadata
            this.caches.set(name, {
                cacheName: data.name,
                expireTime: new Date(data.expireTime),
                createTime: new Date(data.createTime),
                model: cleanModel,
                tokensCount: estimatedTokens,
                isLocal: false
            });

            console.log(`✅ Remote cache created: ${data.name}`);
            return data.name;

        } catch (error) {
            console.warn(`⚠️ Cache creation exception: ${error.message}. Using local memory cache.`);
            const fallbackName = `in_memory_${name}`;
            this.caches.set(name, {
                cacheName: fallbackName,
                content: content,
                expireTime: new Date(Date.now() + ttlSeconds * 1000),
                createTime: new Date(),
                model: model,
                tokensCount: estimatedTokens,
                isLocal: true
            });
            return fallbackName;
        }
    }

    /**
     * Cache all agent system prompts
     */
    async cacheAgentPrompts(agents) {
        const cachePromises = Object.entries(agents).map(async ([role, agent]) => {
            if (!agent.cacheSystemPrompt && role !== 'developer') {
                return null; // Skip non-cached agents
            }

            const cacheName = await this.getCachedContent(
                `agent_${role}_prompt`,
                agent.systemPrompt,
                agent.model,
                3600 // 1 hour TTL
            );

            return { role, cacheName };
        });

        const results = await Promise.all(cachePromises);
        const cached = results.filter(r => r !== null && r.cacheName);

        console.log(`📦 Cached ${cached.length} agent prompts`);
        return Object.fromEntries(cached.map(r => [r.role, r.cacheName]));
    }

    /**
     * Cache long-term memory for context
     */
    async cacheMemory(experiences, model = 'gemini-1.5-pro') {
        if (!Array.isArray(experiences) || experiences.length === 0) {
            return null;
        }

        // Format experiences as context
        const memoryText = this.formatExperiencesForCache(experiences);

        const cacheName = await this.getCachedContent(
            `memory_context_${Date.now()}`,
            memoryText,
            model,
            1800 // 30 minutes TTL
        );

        return cacheName;
    }

    /**
     * Format experiences for efficient caching
     */
    formatExperiencesForCache(experiences) {
        return experiences.map((exp, idx) => {
            return `[Experience ${idx + 1}]
ID: ${exp.id}
Task: ${exp.task}
Solution: ${exp.solution}
Takeaway: ${exp.takeaway}
Quality: ${exp.qualityScore}% (${exp.grade})
Tags: ${exp.tags?.join(', ') || 'N/A'}
---`;
        }).join('\n\n');
    }

    /**
     * Generate content using cached context
     */
    async generateWithCache(cacheName, prompt, model = 'gemini-3.8-flash') {
        if (!cacheName) {
            throw new Error('Cache name is required');
        }

        const cleanModel = model.replace(/^models\//, '');

        if (cacheName.startsWith('in_memory_')) {
            const cached = Array.from(this.caches.values()).find(c => c.cacheName === cacheName);
            const body = {
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }]
                }]
            };
            if (cached && cached.content) {
                body.systemInstruction = {
                    parts: [{ text: cached.content }]
                };
            }
            const response = await fetch(
                `${this.baseUrl}/models/${cleanModel}:generateContent?key=${this.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }
            );
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Generate with cache failed: ${error}`);
            }
            return await response.json();
        }

        const response = await fetch(
            `${this.baseUrl}/models/${cleanModel}:generateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [{ text: prompt }]
                    }],
                    cachedContent: cacheName
                })
            }
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Generate with cache failed: ${error}`);
        }

        return await response.json();
    }

    /**
     * Delete expired or unused caches
     */
    async cleanupCaches() {
        const now = new Date();
        const expired = [];

        for (const [name, cache] of this.caches.entries()) {
            if (cache.expireTime <= now) {
                expired.push(name);
            }
        }

        for (const name of expired) {
            this.caches.delete(name);
            console.log(`🗑️ Removed expired cache: ${name}`);
        }

        return {
            removed: expired.length,
            remaining: this.caches.size
        };
    }

    /**
     * Estimate token count (rough approximation)
     */
    estimateTokens(text) {
        // Rough estimate: 1 token ≈ 4 characters for English
        // For Vietnamese: 1 token ≈ 2.5 characters
        return Math.ceil(text.length / 3);
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeCaches: this.caches.size,
            hitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses),
            caches: Array.from(this.caches.entries()).map(([name, cache]) => ({
                name,
                model: cache.model,
                tokens: cache.tokensCount,
                expiresIn: Math.round((cache.expireTime - new Date()) / 1000)
            }))
        };
    }

    /**
     * Force refresh a specific cache
     */
    async refreshCache(name, content, model, ttlSeconds = 3600) {
        this.caches.delete(name);
        return await this.getCachedContent(name, content, model, ttlSeconds);
    }
}

module.exports = { ContextCacheManager };
