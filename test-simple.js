const https = require('https');
const http = require('http');
const { URL } = require('url');

function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const req = client.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
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
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function test() {
    console.log('Testing /api/v2/execute...\n');
    
    const response = await fetch('http://localhost:3000/api/v2/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            task: 'What is 2+2?',
            useCache: false,
            useGrounding: false
        })
    });

    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
