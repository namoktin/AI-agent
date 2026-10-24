const fs = require('fs');
const path = require('path');

function getApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const l of lines) {
      const match = l.match(/^\s*GEMINI_API_KEY\s*=\s*(.*)$/);
      if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return '';
}
const apiKey = getApiKey();
const testCandidates = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-lite-latest',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemma-4-31b-it'
];

async function check() {
  for (const m of testCandidates) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({contents: [{parts: [{text: 'ping'}]}]})
      });
      console.log(m, 'Status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('   SUCCESS! Response:', data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.slice(0, 40));
      } else {
        const text = await res.text();
        console.log('   Error:', text.slice(0, 120));
      }
    } catch (e) {
      console.log(m, 'Error:', e.message);
    }
  }
}
check();

