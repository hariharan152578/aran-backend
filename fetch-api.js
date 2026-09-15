import http from 'http';

const id = '6a1ea9510eb86e3fb7a03cd0';
const endpoints = [
  `/api/configuration/templates/${id}`,
  `/api/configuration/templates/${id}/measurements`,
  `/api/configuration/templates/${id}/formulas`,
  `/api/configuration/templates/${id}/bom`,
  `/api/configuration/templates/${id}/hardware`
];

async function fetchEndpoint(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:5000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: "Failed to parse JSON" });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const result = {};
  for (const ep of endpoints) {
    const key = ep.split('/').pop();
    result[key === id ? 'template' : key] = await fetchEndpoint(ep);
  }
  console.log(JSON.stringify(result, null, 2));
}

run().catch(console.error);
