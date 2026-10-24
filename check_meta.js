const { execSync } = require('child_process');
try {
  const out = execSync('yt-dlp --cookies "C:\\Users\\Nam\\Desktop\\AI agent\\memory\\cookies\\facebook.com.txt" --dump-json "https://www.facebook.com/reel/1339248944820021"', { maxBuffer: 10 * 1024 * 1024 }).toString();
  const meta = JSON.parse(out);
  console.log('UPLOADER METADATA:');
  console.log('uploader:', meta.uploader);
  console.log('uploader_id:', meta.uploader_id);
  console.log('uploader_url:', meta.uploader_url);
  console.log('channel:', meta.channel);
  console.log('channel_id:', meta.channel_id);
  console.log('channel_url:', meta.channel_url);
} catch (e) {
  console.error('Error:', e.message);
}

