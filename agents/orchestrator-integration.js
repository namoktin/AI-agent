/**
 * 🎯 ULTIMATE MULTI-AGENT API ENDPOINT
 *
 * Integration point for the new orchestrator
 */

const { AgentOrchestrator } = require('./AgentOrchestrator');
const { ToolExecutor } = require('./ToolExecutor');
const { ContextCacheManager } = require('./ContextCacheManager');

// ============================================================================
// MULTI-AGENT ORCHESTRATOR ENDPOINT (Insert this into server.js)
// ============================================================================

// Initialize orchestrator (global instance with caching)
let globalOrchestrator = null;
let globalCacheManager = null;
let globalToolExecutor = null;

function getOrchestrator() {
    if (!globalOrchestrator) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not configured');
        }

        globalOrchestrator = new AgentOrchestrator(apiKey, {
            maxRetries: 3,
            timeout: 180000,
            parallelLimit: 5
        });

        globalCacheManager = new ContextCacheManager(apiKey);
        globalToolExecutor = new ToolExecutor('http://localhost:3000');

        console.log('🚀 Multi-Agent Orchestrator initialized');
    }

    return { globalOrchestrator, globalCacheManager, globalToolExecutor };
}

/**
 * POST /api/multi-agent-execute
 *
 * Execute task with full multi-agent orchestration
 */
app.post('/api/multi-agent-execute', async (req, res) => {
    try {
        const { task, useCache = true, context = {} } = req.body;

        if (!task) {
            return res.json({
                success: false,
                error: 'Task is required'
            });
        }

        console.log('🎬 Multi-Agent Execution Started');
        console.log('📋 Task:', task.slice(0, 100) + (task.length > 100 ? '...' : ''));

        const { globalOrchestrator, globalCacheManager, globalToolExecutor } = getOrchestrator();

        // Load experiences from memory
        let experiences = [];
        try {
            const expFile = path.join(MEMORY_DIR, 'experiences.json');
            if (fs.existsSync(expFile)) {
                const content = fs.readFileSync(expFile, 'utf8');
                experiences = JSON.parse(content);
                console.log(`📚 Loaded ${experiences.length} experiences from memory`);
            }
        } catch (e) {
            console.warn('⚠️ Could not load experiences:', e.message);
        }

        // Cache agent prompts if enabled
        if (useCache) {
            console.log('💾 Caching agent prompts...');
            await globalCacheManager.cacheAgentPrompts(globalOrchestrator.agents);
            const cacheStats = globalCacheManager.getStats();
            console.log(`✅ Cache stats:`, cacheStats);
        }

        // Execute with orchestrator
        const startTime = Date.now();
        const result = await globalOrchestrator.execute(task, {
            experiences: experiences.slice(-20), // Last 20 experiences
            ...context
        });

        const executionTime = Date.now() - startTime;
        const stats = globalOrchestrator.getStats();

        console.log('✅ Execution completed');
        console.log(`⏱️ Total time: ${executionTime}ms`);
        console.log(`📊 Stats:`, stats);

        // Save successful result as experience
        if (result.success && result.qualityScore >= 85) {
            console.log('💾 Saving high-quality result as experience...');

            try {
                const experience = {
                    task: task,
                    solution: JSON.stringify(result.result),
                    takeaway: `Multi-agent orchestration với ${stats.agentCallsCount} agent calls. Quality score: ${result.qualityScore}%`,
                    tags: ['multi-agent', 'orchestrated', 'high-quality'],
                    qualityScore: result.qualityScore
                };

                const saveRes = await fetch('http://localhost:3000/api/save-experience', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(experience)
                });

                if (saveRes.ok) {
                    console.log('✅ Experience saved');
                }
            } catch (e) {
                console.warn('⚠️ Could not save experience:', e.message);
            }
        }

        res.json({
            success: result.success,
            result: result.result,
            qualityScore: result.qualityScore,
            critique: result.critique,
            stats: {
                executionTime: `${executionTime}ms`,
                agentCalls: stats.agentCallsCount,
                averageLatency: `${stats.averageLatency}ms`
            },
            executionLog: result.executionLog.slice(-10), // Last 10 entries
            cacheStats: useCache ? globalCacheManager.getStats() : null
        });

    } catch (error) {
        console.error('💥 Multi-Agent Execution Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * POST /api/multi-agent-execute-with-tools
 *
 * Execute task with tool calls handled by orchestrator
 */
app.post('/api/multi-agent-execute-with-tools', async (req, res) => {
    try {
        const { task, tools = [], context = {} } = req.body;

        if (!task) {
            return res.json({ success: false, error: 'Task is required' });
        }

        const { globalOrchestrator, globalToolExecutor } = getOrchestrator();

        console.log('🎬 Multi-Agent + Tools Execution Started');
        console.log(`🔧 Available tools: ${tools.length}`);

        // Step 1: Orchestrator plans and delegates
        const startTime = Date.now();
        const plan = await globalOrchestrator.execute(task, context);

        if (!plan.success) {
            return res.json(plan);
        }

        // Step 2: Extract tool calls from agent responses
        const toolCalls = extractToolCallsFromResult(plan.result);

        // Step 3: Execute tools in parallel
        let toolResults = [];
        if (toolCalls.length > 0) {
            console.log(`⚡ Executing ${toolCalls.length} tools`);
            toolResults = await globalToolExecutor.executeTools(toolCalls, context);
        }

        // Step 4: Final synthesis by Director
        const finalResult = await globalOrchestrator.callAgent('director', {
            task: 'Synthesize final result from tool outputs',
            originalTask: task,
            planResult: plan.result,
            toolResults: toolResults
        });

        const executionTime = Date.now() - startTime;

        res.json({
            success: true,
            result: finalResult.response,
            toolResults: toolResults,
            executionTime: `${executionTime}ms`,
            stats: globalOrchestrator.getStats()
        });

    } catch (error) {
        console.error('💥 Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/orchestrator-stats
 *
 * Get orchestrator statistics
 */
app.get('/api/orchestrator-stats', (req, res) => {
    try {
        const { globalOrchestrator, globalCacheManager, globalToolExecutor } = getOrchestrator();

        const stats = {
            orchestrator: globalOrchestrator.getStats(),
            cache: globalCacheManager.getStats(),
            tools: globalToolExecutor.getCacheStats(),
            agents: Object.keys(globalOrchestrator.agents),
            status: 'operational'
        };

        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/orchestrator-reset
 *
 * Reset orchestrator and clear caches
 */
app.post('/api/orchestrator-reset', async (req, res) => {
    try {
        globalOrchestrator = null;
        globalCacheManager = null;
        globalToolExecutor = null;

        console.log('🔄 Orchestrator reset');

        res.json({
            success: true,
            message: 'Orchestrator reset successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Helper: Extract tool calls from agent result
 */
function extractToolCallsFromResult(result) {
    const toolCalls = [];

    // Parse result if JSON
    let parsed = result;
    if (typeof result === 'string') {
        try {
            parsed = JSON.parse(result);
        } catch (e) {
            // Not JSON, try to extract from text
            const toolPattern = /(\w+)\((.*?)\)/g;
            let match;
            while ((match = toolPattern.exec(result)) !== null) {
                try {
                    toolCalls.push({
                        name: match[1],
                        args: JSON.parse(match[2])
                    });
                } catch (e) {
                    // Invalid tool call format
                }
            }
            return toolCalls;
        }
    }

    // Extract from structured format
    if (parsed.toolCalls && Array.isArray(parsed.toolCalls)) {
        return parsed.toolCalls;
    }

    if (parsed.tools && Array.isArray(parsed.tools)) {
        return parsed.tools;
    }

    return toolCalls;
}

module.exports = {
    getOrchestrator,
    AgentOrchestrator,
    ToolExecutor,
    ContextCacheManager
};
