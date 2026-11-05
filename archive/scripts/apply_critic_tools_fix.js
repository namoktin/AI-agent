const fs = require('fs');
const path = require('path');

const orchFile = path.join(__dirname, 'agents', 'AgentOrchestrator.js');
let orchContent = fs.readFileSync(orchFile, 'utf8');

// Change critic enableTools to false
const oldCriticConfig = `temperature: 0.4,
                thinking: true,
                priority: 4,
                enableTools: true`;
const oldCriticConfigCRLF = `temperature: 0.4,\r\n                thinking: true,\r\n                priority: 4,\r\n                enableTools: true`;

const newCriticConfig = `temperature: 0.4,
                thinking: true,
                priority: 4,
                enableTools: false // Critic là hội đồng phản biện thuần túy, thẩm định trực tiếp kết quả chuyên viên`;

if (orchContent.includes(oldCriticConfig)) {
    orchContent = orchContent.replace(oldCriticConfig, newCriticConfig);
    console.log('✅ Set critic enableTools: false (LF)');
} else if (orchContent.includes(oldCriticConfigCRLF)) {
    orchContent = orchContent.replace(oldCriticConfigCRLF, newCriticConfig);
    console.log('✅ Set critic enableTools: false (CRLF)');
} else {
    orchContent = orchContent.replace(/priority:\s*4,\s*enableTools:\s*true/g, 'priority: 4, enableTools: false');
    console.log('✅ Set critic enableTools: false (Regex)');
}

fs.writeFileSync(orchFile, orchContent, 'utf8');
console.log('🎉 Done updating critic configuration!');

