const fs = require('fs');
const path = require('path');

const server = fs.readFileSync('C:\\Users\\Nam\\Desktop\\AI agent\\server.js', 'utf8');
const fnCode = server.slice(server.indexOf('function parseSafeCommand'), server.indexOf('function runSafeCommand'));
eval(fnCode);

const testCommands = [
  'yt-dlp --cookies "C:\\Users\\Nam\\Desktop\\AI agent\\memory\\cookies\\facebook.com.txt" --dump-json https://www.facebook.com/reel/1339248944820021',
  'python test_env.py',
  'python download_reels.py',
  'python C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\download_reels.py',
  'yt-dlp --cookies "C:\\Users\\Nam\\Desktop\\AI agent\\memory\\cookies\\facebook.com.txt" -o "C:\\Users\\Nam\\Desktop\\gemini\\2026-10-23\\reel_test_run2\\reel_1.mp4" https://www.facebook.com/reel/1339248944820021'
];

testCommands.forEach(cmd => {
  console.log('CMD:', cmd);
  const res = parseSafeCommand(cmd);
  console.log('Parsed:', res ? 'OK' : 'REJECTED (NULL)');
  console.log('---');
});

