const fs = require('fs');
const http = require('http');

http.get('http://localhost:5000/api/configuration/import/excel/review/6a1f177cde0cf2fe5062bad7', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.stringify(JSON.parse(data), null, 2);
    fs.writeFileSync('C:/Users/harih/.gemini/antigravity-ide/brain/1665e733-4d50-409a-afac-500cc1388ef7/review_output.json', json);
    console.log('JSON saved');
  });
});
