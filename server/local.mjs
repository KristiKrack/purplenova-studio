import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mediaRequest } from './media-api.mjs';

const base = fileURLToPath(new URL('../dist/', import.meta.url));
const port = 4173;
const host = '127.0.0.1:' + port;
const files = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', jpg: 'image/jpeg' };

createServer(async (req, res) => {
  if (req.headers.host !== host) {
    res.writeHead(403).end();
    return;
  }
  try {
    const url = new URL(req.url, 'http://' + host);
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([, value]) => typeof value === 'string'));
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {};
    const result = await mediaRequest(new Request(url, { headers, method: req.method, ...body }), process.env, true);
    if (result) {
      res.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body) Readable.fromWeb(result.body).on('error', () => res.destroy()).pipe(res);
      else res.end();
      return;
    }
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!/^\/(?:index\.html|style\.css|studio\.js|assets\/[a-zA-Z0-9_.-]+\.jpg)$/.test(requested)) {
      res.writeHead(404).end();
      return;
    }
    const file = join(base, requested.slice(1));
    const details = await stat(file);
    res.writeHead(200, { 'Content-Type': files[requested.split('.').pop()], 'Content-Length': details.size });
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}).listen(port, '127.0.0.1', () => console.log('PurpleNova Studio · http://' + host));
