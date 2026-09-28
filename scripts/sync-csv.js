import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_SHEETS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS74LFhv-sdPSljDvKum_MKtBo73jUw9QD-d8vIGbGYCEXOTRgSWGKVOUwYE_1veYwDXLfCUv3lScbi/pub?output=csv';

const outputPath = path.resolve(__dirname, '../public/initiatieven.csv');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent: false }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch: status code ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

export async function syncCsv() {
  try {
    console.log('Fetching latest initiatives data from Google Sheets...');
    const data = await fetchUrl(GOOGLE_SHEETS_CSV_URL);
    if (data && data.includes('name') && data.includes('latitude')) {
      fs.writeFileSync(outputPath, data, 'utf-8');
      console.log(`Successfully updated ${outputPath} (${data.length} bytes)`);
      return data;
    } else {
      console.warn('Fetched data seems invalid, keeping current file.');
    }
  } catch (err) {
    console.warn('Could not sync with Google Sheets (offline or network error). Using existing public/initiatieven.csv:', err.message);
  }
  return null;
}

if (process.argv[1] === __filename) {
  syncCsv().finally(() => {
    process.exit(0);
  });
}
