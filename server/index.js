import { createServer } from 'node:http';
import { existsSync, createReadStream } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExampleHandler } from './examples.js';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['.env.local', '.env'])
  if (existsSync(resolve(root, name))) process.loadEnvFile(resolve(root, name));
const api = createExampleHandler();
const directory = resolve(root, 'dist');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/examples')) return api(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  let file = resolve(directory, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(directory + '/')) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!existsSync(file) || !extname(file)) file = resolve(directory, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('請先執行 npm run build。');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime[extname(file)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') res.end();
  else
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT) || 8787, '127.0.0.1', () =>
  console.log(`VocaBuddy：http://127.0.0.1:${server.address().port}`),
);
