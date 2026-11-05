const http = require('http');

const postData = JSON.stringify({
  url: 'https://www.facebook.com/people/Pedro-Sanchez/61561662704825/?sk=reels_tab',
  extractReels: true,
  cookieFile: 'C:\\Users\\Nam\\Desktop\\AI agent\\memory\\cookies\\facebook.com.txt'
});

const req = http.request('http://localhost:3000/api/browse-web', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('Success:', data.success);
      console.log('Media links count:', data.deepMediaLinks ? data.deepMediaLinks.length : 0);
      if (data.deepMediaLinks && data.deepMediaLinks.length > 0) {
        console.log('Sample reels:', data.deepMediaLinks.slice(0, 5));
      } else {
        console.log('Error/Content preview:', data.error || data.content?.slice(0, 200));
      }
    } catch (e) {
      console.error('Parse error:', e.message, body.slice(0, 200));
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.write(postData);
req.end();

