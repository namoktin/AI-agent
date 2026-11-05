/**
 * mcp-test-server.js - Lightweight local test MCP server over stdio
 * Implements Model Context Protocol 2024-11-05 spec for testing
 */

const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

const tools = [
    {
        name: 'echo',
        description: 'Echo back any message provided with timestamp',
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Message to echo' }
            },
            required: ['message']
        }
    },
    {
        name: 'calculate',
        description: 'Add or multiply two numbers safely',
        inputSchema: {
            type: 'object',
            properties: {
                operation: { type: 'string', description: 'add or multiply' },
                a: { type: 'number', description: 'First number' },
                b: { type: 'number', description: 'Second number' }
            },
            required: ['operation', 'a', 'b']
        }
    }
];

function send(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
        const req = JSON.parse(line.trim());
        const id = req.id;

        switch (req.method) {
            case 'initialize':
                send({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'local-test-mcp-server', version: '1.0.0' }
                    }
                });
                break;

            case 'notifications/initialized':
                // Handshake notification, no response required
                break;

            case 'tools/list':
                send({
                    jsonrpc: '2.0',
                    id,
                    result: { tools }
                });
                break;

            case 'tools/call':
                const toolName = req.params?.name;
                const args = req.params?.arguments || {};

                if (toolName === 'echo') {
                    send({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            content: [{ type: 'text', text: `Echo: ${args.message || ''}` }]
                        }
                    });
                } else if (toolName === 'calculate') {
                    let res = 0;
                    if (args.expression && typeof args.expression === 'string') {
                        const clean = args.expression.replace(/[^0-9+\-*/.() ]/g, '');
                        try {
                            res = Function(`'use strict'; return (${clean})`)();
                        } catch (e) {
                            res = 0;
                        }
                    } else {
                        const a = Number(args.a) || 0;
                        const b = Number(args.b) || 0;
                        res = args.operation === 'multiply' ? a * b : a + b;
                    }
                    send({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            content: [{ type: 'text', text: `Result: ${res}` }]
                        }
                    });
                } else {
                    send({
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Tool not found: ${toolName}` }
                    });
                }
                break;

            default:
                if (id !== undefined) {
                    send({
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Method not found: ${req.method}` }
                    });
                }
                break;
        }
    } catch (e) {
        // invalid json
    }
});
