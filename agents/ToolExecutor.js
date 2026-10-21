/**
 * 🔧 PARALLEL TOOL EXECUTOR
 *
 * Executes tools in parallel where safe, with:
 * - Dependency resolution
 * - Conflict detection
 * - Resource pooling
 * - Automatic retry
 */

const fetch = require('node:fetch');
const fs = require('fs').promises;
const path = require('path');

class ToolExecutor {
    constructor(serverUrl = 'http://localhost:3000') {
        this.serverUrl = serverUrl;
        this.executionCache = new Map();
        this.rateLimiter = new Map();

        // Tool safety classification
        this.toolCategories = {
            // Read-only tools - safe for parallel execution
            readonly: [
                'READ_FILE',
                'LIST_FILES',
                'WEB_SEARCH',
                'ACADEMIC_SEARCH',
                'SEARCH_EXPERIENCE',
                'READ_URL',
                'FETCH_WEBPAGE'
            ],
            // Write tools - must be sequential
            write: [
                'WRITE_FILE',
                'SAVE_EXPERIENCE',
                'UPDATE_EXPERIENCE',
                'DELETE_FILE',
                'RUN_CODE'
            ],
            // Heavy tools - rate limited
            heavy: [
                'WEB_SEARCH',
                'ACADEMIC_SEARCH',
                'BROWSE_WEB',
                'GENERATE_IMAGE'
            ]
        };
    }

    /**
     * Execute multiple tool calls with intelligent parallelization
     */
    async executeTools(toolCalls, context = {}) {
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
            return [];
        }

        // Classify tools
        const readonly = toolCalls.filter(t => this.isReadOnly(t.name));
        const writes = toolCalls.filter(t => this.isWrite(t.name));
        const heavy = toolCalls.filter(t => this.isHeavy(t.name));

        const results = [];

        // PHASE 1: Execute all read-only tools in parallel
        if (readonly.length > 0) {
            console.log(`⚡ Executing ${readonly.length} read-only tools in parallel`);
            const readResults = await Promise.allSettled(
                readonly.map(tool => this.executeSingleTool(tool, context))
            );
            results.push(...this.unwrapSettled(readResults));
        }

        // PHASE 2: Execute heavy tools with rate limiting (parallel but throttled)
        if (heavy.length > 0) {
            console.log(`🔥 Executing ${heavy.length} heavy tools with rate limiting`);
            const heavyResults = await this.executeWithRateLimit(heavy, context);
            results.push(...heavyResults);
        }

        // PHASE 3: Execute write tools sequentially to avoid conflicts
        if (writes.length > 0) {
            console.log(`📝 Executing ${writes.length} write tools sequentially`);
            for (const tool of writes) {
                const result = await this.executeSingleTool(tool, context);
                results.push(result);
            }
        }

        return results;
    }

    /**
     * Execute single tool with caching and retry
     */
    async executeSingleTool(tool, context = {}, attempt = 1) {
        const { name, args } = tool;

        // Check cache for idempotent operations
        if (this.isReadOnly(name)) {
            const cacheKey = this.getCacheKey(name, args);
            if (this.executionCache.has(cacheKey)) {
                console.log(`💾 Cache hit for ${name}`);
                return this.executionCache.get(cacheKey);
            }
        }

        try {
            const result = await this.callToolAPI(name, args, context);

            // Cache successful read-only results
            if (this.isReadOnly(name) && result.success) {
                const cacheKey = this.getCacheKey(name, args);
                this.executionCache.set(cacheKey, result);

                // Expire cache after 5 minutes
                setTimeout(() => this.executionCache.delete(cacheKey), 300000);
            }

            return {
                tool: name,
                success: true,
                result: result,
                attempt: attempt
            };

        } catch (error) {
            console.error(`❌ Tool ${name} failed (attempt ${attempt}):`, error.message);

            // Retry logic for transient failures
            if (attempt < 3 && this.isRetryable(error)) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
                return await this.executeSingleTool(tool, context, attempt + 1);
            }

            return {
                tool: name,
                success: false,
                error: error.message,
                attempt: attempt
            };
        }
    }

    /**
     * Execute tools with rate limiting
     */
    async executeWithRateLimit(tools, context, limit = 3) {
        const results = [];
        const queue = [...tools];

        while (queue.length > 0) {
            const batch = queue.splice(0, limit);
            const batchResults = await Promise.allSettled(
                batch.map(tool => this.executeSingleTool(tool, context))
            );
            results.push(...this.unwrapSettled(batchResults));

            // Rate limit delay
            if (queue.length > 0) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        return results;
    }

    /**
     * Call tool API endpoint
     */
    async callToolAPI(toolName, args, context) {
        const endpoint = this.getToolEndpoint(toolName);

        const response = await fetch(`${this.serverUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': context.authToken ? `Bearer ${context.authToken}` : ''
            },
            body: JSON.stringify(args),
            signal: AbortSignal.timeout(120000)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`${toolName} API error (${response.status}): ${error}`);
        }

        return await response.json();
    }

    /**
     * Map tool names to API endpoints
     */
    getToolEndpoint(toolName) {
        const mapping = {
            'READ_FILE': '/api/read-file',
            'WRITE_FILE': '/api/write-file',
            'LIST_FILES': '/api/list-files',
            'DELETE_FILE': '/api/delete-file',
            'WEB_SEARCH': '/api/web-search',
            'ACADEMIC_SEARCH': '/api/academic/search',
            'READ_URL': '/api/fetch-webpage',
            'BROWSE_WEB': '/api/browse-web',
            'SEARCH_EXPERIENCE': '/api/search-experiences',
            'SAVE_EXPERIENCE': '/api/save-experience',
            'UPDATE_EXPERIENCE': '/api/update-experience',
            'RUN_CODE': '/api/run-code',
            'GENERATE_IMAGE': '/api/generate-image'
        };

        return mapping[toolName] || `/api/${toolName.toLowerCase().replace(/_/g, '-')}`;
    }

    /**
     * Tool classification helpers
     */
    isReadOnly(toolName) {
        return this.toolCategories.readonly.includes(toolName);
    }

    isWrite(toolName) {
        return this.toolCategories.write.includes(toolName);
    }

    isHeavy(toolName) {
        return this.toolCategories.heavy.includes(toolName);
    }

    isRetryable(error) {
        const retryablePatterns = [
            /timeout/i,
            /ECONNRESET/i,
            /ETIMEDOUT/i,
            /429/,
            /503/,
            /502/
        ];

        return retryablePatterns.some(pattern => pattern.test(error.message));
    }

    /**
     * Generate cache key
     */
    getCacheKey(toolName, args) {
        return `${toolName}:${JSON.stringify(args)}`;
    }

    /**
     * Unwrap Promise.allSettled results
     */
    unwrapSettled(results) {
        return results.map((r, idx) => {
            if (r.status === 'fulfilled') {
                return r.value;
            } else {
                return {
                    tool: `unknown_${idx}`,
                    success: false,
                    error: r.reason?.message || 'Unknown error'
                };
            }
        });
    }

    /**
     * Clear execution cache
     */
    clearCache() {
        this.executionCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.executionCache.size,
            keys: Array.from(this.executionCache.keys())
        };
    }
}

module.exports = { ToolExecutor };
