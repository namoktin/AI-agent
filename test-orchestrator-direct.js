/**
 * Test AgentOrchestrator directly without HTTP server
 */

const fs = require('fs');
const path = require('path');
const AgentOrchestrator = require('./agents/AgentOrchestrator');

// Load .env manually
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const match = line.match(/^([^=:#]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
    }
}

async function testDirect() {
    console.log('🧪 Testing AgentOrchestrator directly...\n');

    loadEnv(); // Load environment variables

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY not found in .env');
        process.exit(1);
    }

    console.log('✅ API Key found');
    console.log('🚀 Initializing orchestrator...');

    try {
        const orchestrator = new AgentOrchestrator(apiKey, {
            maxRetries: 3,
            timeout: 180000,
            parallelLimit: 5
        });

        console.log('✅ Orchestrator initialized');
        console.log('🎬 Executing simple task...\n');

        const result = await orchestrator.execute('What is 2+2?', {});

        console.log('\n📊 Result:', JSON.stringify(result, null, 2));
        console.log('\n✅ Test completed');

    } catch (error) {
        console.error('\n💥 Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

testDirect();
