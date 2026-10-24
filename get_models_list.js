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

async function listModels() {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    if (data.models) {
      console.log('Available models:');
      data.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .forEach(m => console.log(' - ' + m.name.replace('models/', '')));
    } else {
      console.log('No models returned:', data);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}
listModels();

