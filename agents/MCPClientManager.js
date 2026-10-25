/**
 * MCPClientManager.js - Model Context Protocol (MCP) Client Ecosystem Manager
 * Supports: stdio transport, JSON-RPC 2.0 handshake (initialize, tools/list, tools/call),
 * schema translation to Gemini function declarations, namespacing (mcp__<server>__<tool>),
 * request timeouts, cancellation, and graceful disconnects.
 * 
 * Cyber Agent Pro v5.0 Enterprise
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class MCPClient extends EventEmitter {
    constructor(serverName, config = {}) {
        super();
        this.serverName = serverName;
        this.config = config; // { command, args, env, disabled }
        this.process = null;
        this.requestId = 0;
        this.pendingRequests = new Map(); // id -> { resolve, reject, timeoutTimer }
        this.tools = []; // Array of raw MCP tool definitions
        this.status = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
        this.stdoutBuffer = '';
    }

    async connect() {
        if (this.config.disabled) {
            this.status = 'DISABLED';
            return false;
        }

        if (this.status === 'CONNECTED' && this.process) {
            return true;
        }

        this.status = 'CONNECTING';

        return new Promise((resolve, reject) => {
            try {
                const env = { ...process.env, ...(this.config.env || {}) };
                this.process = spawn(this.config.command, this.config.args || [], {
                    env,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                this.process.stdout.on('data', (data) => {
                    this._handleData(data.toString('utf8'));
                });

                this.process.stderr.on('data', (data) => {
                    this.emit('stderr', data.toString('utf8'));
                });

                this.process.on('error', (err) => {
                    this.status = 'ERROR';
                    this.emit('error', err);
                    this._rejectAllPending(new Error(`MCP server process error: ${err.message}`));
                    reject(err);
                });

                this.process.on('close', (code) => {
                    this.status = 'DISCONNECTED';
                    this.emit('close', code);
                    this._rejectAllPending(new Error(`MCP server closed with exit code ${code}`));
                });

                // Send initialize handshake
                this._sendRequest('initialize', {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    clientInfo: { name: 'cyber-agent-mcp-client', version: '5.0.0' }
                }, 10000).then(async (initResult) => {
                    // Send initialized notification
                    this._sendNotification('notifications/initialized');
                    this.status = 'CONNECTED';

                    // Fetch tool definitions
                    await this.refreshTools();
                    resolve(true);
                }).catch((err) => {
                    this.status = 'ERROR';
                    this.disconnect();
                    reject(err);
                });

            } catch (err) {
                this.status = 'ERROR';
                reject(err);
            }
        });
    }

    _handleData(chunk) {
        this.stdoutBuffer += chunk;
        const lines = this.stdoutBuffer.split('\n');
        this.stdoutBuffer = lines.pop(); // Keep incomplete trailing fragment

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const message = JSON.parse(trimmed);
                this._handleMessage(message);
            } catch (e) {
                // Ignore non-json logs
            }
        }
    }

    _handleMessage(msg) {
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
            const { resolve, reject, timeoutTimer } = this.pendingRequests.get(msg.id);
            clearTimeout(timeoutTimer);
            this.pendingRequests.delete(msg.id);

            if (msg.error) {
                reject(new Error(msg.error.message || `MCP Error ${msg.error.code}`));
            } else {
                resolve(msg.result);
            }
        }
    }

    _sendRequest(method, params = {}, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            if (!this.process || !this.process.stdin.writable) {
                return reject(new Error(`MCP server [${this.serverName}] is not connected`));
            }

            const id = ++this.requestId;
            const payload = JSON.stringify({
                jsonrpc: '2.0',
                id,
                method,
                params
            }) + '\n';

            const timeoutTimer = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`MCP request [${method}] id:${id} timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);

            this.pendingRequests.set(id, { resolve, reject, timeoutTimer });
            this.process.stdin.write(payload);
        });
    }

    _sendNotification(method, params = {}) {
        if (!this.process || !this.process.stdin.writable) return;
        const payload = JSON.stringify({
            jsonrpc: '2.0',
            method,
            params
        }) + '\n';
        this.process.stdin.write(payload);
    }

    _rejectAllPending(error) {
        for (const [id, req] of this.pendingRequests.entries()) {
            clearTimeout(req.timeoutTimer);
            req.reject(error);
        }
        this.pendingRequests.clear();
    }

    async refreshTools() {
        const res = await this._sendRequest('tools/list', {});
        this.tools = Array.isArray(res?.tools) ? res.tools : [];
        return this.tools;
    }

    async callTool(toolName, args = {}, timeoutMs = 30000) {
        if (this.status !== 'CONNECTED') {
            await this.connect();
        }

        const res = await this._sendRequest('tools/call', {
            name: toolName,
            arguments: args
        }, timeoutMs);

        // Normalize MCP content array
        if (Array.isArray(res?.content)) {
            const textParts = res.content
                .filter(c => c.type === 'text')
                .map(c => c.text);
            return {
                success: !res.isError,
                result: textParts.join('\n') || res.content,
                raw: res
            };
        }

        return {
            success: !res?.isError,
            result: res,
            raw: res
        };
    }

    disconnect() {
        this.status = 'DISCONNECTED';
        this._rejectAllPending(new Error(`Disconnected from MCP server [${this.serverName}]`));
        if (this.process) {
            try {
                this.process.kill();
            } catch (e) {}
            this.process = null;
        }
    }
}

class MCPClientManager {
    constructor(configPath = null) {
        if (configPath && typeof configPath === 'string') {
            try {
                if (fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()) {
                    this.configPath = path.resolve(configPath, 'config', 'mcp_servers.json');
                } else {
                    this.configPath = configPath;
                }
            } catch (e) {
                this.configPath = path.resolve(process.cwd(), 'config', 'mcp_servers.json');
            }
        } else {
            this.configPath = path.resolve(process.cwd(), 'config', 'mcp_servers.json');
        }

        this.clients = new Map(); // serverName -> MCPClient
        this.toolsCache = []; // Unified Gemini-compatible function declarations
        this.loadConfiguration();
    }

    async discoverTools() {
        await this.initAllServers();
        return this.getToolDefinitions();
    }

    async callTool(namespacedName, params, timeoutMs) {
        return this.executeTool(namespacedName, params, timeoutMs);
    }

    async shutdown() {
        return this.disconnectAll();
    }

    loadConfiguration() {
        if (fs.existsSync(this.configPath)) {
            try {
                const raw = fs.readFileSync(this.configPath, 'utf8');
                const parsed = JSON.parse(raw);
                const servers = parsed.mcpServers || parsed;

                for (const [name, srvConfig] of Object.entries(servers)) {
                    this.registerServer(name, srvConfig);
                }
                this.syncToolDefinitions();
            } catch (err) {
                console.warn(`⚠️ [MCPClientManager] Error loading config: ${err.message}`);
            }
        }
    }

    registerServer(name, srvConfig) {
        if (this.clients.has(name)) {
            this.clients.get(name).disconnect();
        }
        const client = new MCPClient(name, srvConfig);
        if (Array.isArray(srvConfig.tools)) {
            client.tools = [...srvConfig.tools];
        }
        this.clients.set(name, client);
        return client;
    }

    async initAllServers() {
        for (const [name, client] of this.clients.entries()) {
            if (client.config.disabled) continue;
            try {
                await client.connect();
            } catch (err) {
                console.warn(`⚠️ [MCPClientManager] Could not connect to [${name}]: ${err.message}`);
            }
        }
        await this.syncToolDefinitions();
        return this.toolsCache;
    }

    /**
     * Converts raw MCP tools into Gemini-compatible function declarations with namespacing
     */
    async syncToolDefinitions() {
        const unified = [];

        for (const [serverName, client] of this.clients.entries()) {
            if (client.config.disabled) continue;

            for (const tool of client.tools) {
                const namespacedName = `mcp__${serverName}__${tool.name}`;
                
                // Format parameter schema for Gemini Function Calling
                const schema = tool.inputSchema || { type: 'object', properties: {} };
                const properties = {};
                for (const [k, v] of Object.entries(schema.properties || {})) {
                    properties[k] = {
                        type: (v.type || 'string').toUpperCase(),
                        description: v.description || k
                    };
                }

                unified.push({
                    name: namespacedName,
                    description: `[MCP Server: ${serverName}] ${tool.description || tool.name}`,
                    parameters: {
                        type: 'OBJECT',
                        properties,
                        required: Array.isArray(schema.required) ? schema.required : []
                    }
                });
            }
        }

        this.toolsCache = unified;
        return unified;
    }

    getToolDefinitions() {
        return this.toolsCache;
    }

    isMCPTool(toolName) {
        return typeof toolName === 'string' && toolName.startsWith('mcp__');
    }

    parseToolName(namespacedName) {
        const parts = namespacedName.split('__');
        if (parts.length >= 3 && parts[0] === 'mcp') {
            return {
                serverName: parts[1],
                toolName: parts.slice(2).join('__')
            };
        }
        return null;
    }

    async executeTool(namespacedName, args = {}) {
        const parsed = this.parseToolName(namespacedName);
        if (!parsed) {
            throw new Error(`Invalid MCP tool name: ${namespacedName}`);
        }

        const client = this.clients.get(parsed.serverName);
        if (!client) {
            throw new Error(`MCP server [${parsed.serverName}] not found or not registered.`);
        }

        if (client.status !== 'CONNECTED') {
            await client.connect();
        }

        return await client.callTool(parsed.toolName, args);
    }

    disconnectAll() {
        for (const client of this.clients.values()) {
            client.disconnect();
        }
    }
}

module.exports = { MCPClientManager, MCPClient };
