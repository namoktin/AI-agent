const fs = require('fs');

const env = fs.readFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\.env', 'utf8');
const key = env.match(/GEMINI_API_KEY=(.*)/)[1].trim();

async function testModel(m) {
  const start = Date.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello in 1 word' }] }] }),
      signal: AbortSignal.timeout(15000)
    });
    const d = await res.json();
    console.log(`${m}: Status ${res.status} (${Date.now() - start}ms) - ${d.candidates ? 'SUCCESS' : JSON.stringify(d).slice(0, 90)}`);
  } catch (e) {
    console.error(`${m}: FAILED (${Date.now() - start}ms) - ${e.message}`);
  }
}

(async () => {
  await testModel('gemini-3.5-flash');
  await testModel('gemini-3.5-flash-lite');
  await testModel('gemini-3-flash-preview');
  await testModel('gemini-2.5-pro');
})();
