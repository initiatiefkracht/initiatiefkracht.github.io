import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const csvApiPlugin = () => ({
  name: 'csv-api-plugin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/api/add-initiative' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const csvPath = path.resolve(__dirname, 'public/initiatieven.csv');
            
            const escapeCSV = (val) => {
              if (val === null || val === undefined) return '';
              let str = String(val);
              if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                str = '"' + str.replace(/"/g, '""') + '"';
              }
              return str;
            };

            const row = [
              data.fid,
              escapeCSV(data.name),
              data.latitude,
              data.longitude,
              escapeCSV(data.gebied),
              escapeCSV(data.domeinen),
              escapeCSV(data.website),
              escapeCSV(data.koepels),
              escapeCSV(data.initiatief_type),
              escapeCSV(data.location_type)
            ].join(';');

            // Append to file
            fs.appendFileSync(csvPath, '\n' + row, 'utf-8');

            res.writeHead(200, { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: true, message: 'Initiative added successfully' }));
          } catch (error) {
            console.error('Error adding initiative:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: error.message }));
          }
        });
      } else {
        next();
      }
    });
  }
});

export default defineConfig({
  plugins: [svelte(), csvApiPlugin()],
  base: './'
})
