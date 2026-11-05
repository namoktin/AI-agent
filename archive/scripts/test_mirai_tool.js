const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
});

const apiKey = env.CUSTOM_AI_KEY;
const baseUrl = env.CUSTOM_AI_BASE_URL || 'https://api.miraiapi.com/v1';
const model = env.CUSTOM_AI_MODEL || 'deepseek-v4-pro';

async function runTests() {
  console.log('--- Test 1: Assistant with text content AND tool_calls ---');
  const asst1 = {
    role: 'assistant',
    content: 'I will start by searching for information.',
    reasoning_content: 'Let me search.',
    tool_calls: [
      {
        id: 'call_12345',
        type: 'function',
        function: { name: 'WEB_SEARCH', arguments: JSON.stringify({ query: 'test' }) }
      }
    ]
  };

  const body1 = {
    model,
    messages: [
      { role: 'user', content: 'test question' },
      asst1,
      { role: 'tool', tool_call_id: 'call_12345', content: 'results' }
    ],
    max_tokens: 1024
  };

  const res1 = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(body1)
  });
  console.log('Test 1 Status:', res1.status);
  console.log('Test 1 Body:', (await res1.text()).slice(0, 300));

  console.log('\n--- Test 2: Multiple tool calls (3 tools) ---');
  const asst2 = {
    role: 'assistant',
    content: '',
    reasoning_content: 'Let me search 3 things.',
    tool_calls: [
      { id: 'call_1', type: 'function', function: { name: 'WEB_SEARCH', arguments: '{"query":"q1"}' } },
      { id: 'call_2', type: 'function', function: { name: 'WEB_SEARCH', arguments: '{"query":"q2"}' } },
      { id: 'call_3', type: 'function', function: { name: 'WEB_SEARCH', arguments: '{"query":"q3"}' } }
    ]
  };

  const body2 = {
    model,
    messages: [
      { role: 'user', content: 'test 3 searches' },
      asst2,
      { role: 'tool', tool_call_id: 'call_1', content: 'res1' },
      { role: 'tool', tool_call_id: 'call_2', content: 'res2' },
      { role: 'tool', tool_call_id: 'call_3', content: 'res3' }
    ],
    max_tokens: 1024
  };

  const res2 = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(body2)
  });
  console.log('Test 2 Status:', res2.status);
  console.log('Test 2 Body:', (await res2.text()).slice(0, 300));

  console.log('\n--- Test 3: Multiple tool calls with custom ids like call_1793... ---');
  const asst3 = {
    role: 'assistant',
    content: '',
    reasoning_content: 'Let me search.',
    tool_calls: [
      { id: 'call_1793110926089_0', type: 'function', function: { name: 'WEB_SEARCH', arguments: '{"query":"q1"}' } },
      { id: 'call_1793110926090_1', type: 'function', function: { name: 'WEB_SEARCH', arguments: '{"query":"q2"}' } }
    ]
  };

  const body3 = {
    model,
    messages: [
      { role: 'user', content: 'test custom ids' },
      asst3,
      { role: 'tool', tool_call_id: 'call_1793110926089_0', content: 'res1' },
      { role: 'tool', tool_call_id: 'call_1793110926090_1', content: 'res2' }
    ],
    max_tokens: 1024
  };

  const res3 = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(body3)
  });
  console.log('Test 3 Status:', res3.status);
  console.log('Test 3 Body:', (await res3.text()).slice(0, 300));
}

runTests().catch(console.error);

