'use strict';

// Servidor local do Meu Dinheiro.
// - Serve os arquivos estaticos (index.html, manifest, sw.js, icons...).
// - Expoe a API em /api/data (GET/PUT) usando lib/db.js.
// - Le as variaveis de .env (DATABASE_URL, APP_TOKEN, PORT) sem depender de dotenv.
//
// Uso:  node server.js   (ou use o iniciar-local.bat)

const http = require('http');
const fs = require('fs');
const path = require('path');

// --- carregamento simples de .env (antes de qualquer leitura de process.env) ---
(function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const i = t.indexOf('=');
      if (i === -1) return;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) process.env[key] = val;
    });
  } catch (e) { /* sem .env: tudo bem */ }
})();

const { getData, setData, useDb } = require('./lib/db');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const TOKEN = process.env.APP_TOKEN || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

// Arquivos/servidor que NAO devem ser servidos como estaticos.
const BLOCKED = new Set([
  'server.js', 'package.json', 'package-lock.json', '.env', '.env.example',
  '.local-data.json', 'schema.sql', 'README.md', 'iniciar-local.bat',
  'vercel.json', '.gitignore', 'meu_dinheiro.html'
]);
const BLOCKED_DIRS = new Set(['.git', 'node_modules', 'lib', 'api', 'legacy']);

function authorized(req) {
  if (!TOKEN) return true;
  const h = req.headers['authorization'] || '';
  return h === 'Bearer ' + TOKEN || req.headers['x-app-token'] === TOKEN;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function handleApi(req, res) {
  if (!authorized(req)) return sendJson(res, 401, { error: 'unauthorized' });
  try {
    if (req.method === 'GET') {
      const data = await getData();
      return sendJson(res, 200, data == null ? null : data);
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload;
      try { payload = JSON.parse(body || 'null'); }
      catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
      if (payload == null || typeof payload !== 'object') {
        return sendJson(res, 400, { error: 'bad body' });
      }
      await setData(payload);
      return sendJson(res, 200, { ok: true });
    }
    res.writeHead(405, { allow: 'GET, PUT' });
    res.end();
  } catch (e) {
    console.error('Erro em /api/data:', e);
    sendJson(res, 500, { error: 'server error', detail: String(e && e.message || e) });
  }
}

function serveStatic(req, res) {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const relPath = rel.replace(/^\/+/, '');
  const parts = relPath.split('/');
  const base = parts[0];
  if (BLOCKED.has(base) || BLOCKED_DIRS.has(base) || parts.some((p) => p === '..')) {
    res.writeHead(404); return res.end('not found');
  }
  const filePath = path.join(ROOT, relPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' || base === 'sw.js' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/api/data') return handleApi(req, res);
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Meu Dinheiro  ->  http://localhost:' + PORT);
  if (useDb()) {
    console.log('  Banco: Neon Postgres (DATABASE_URL definida)');
  } else {
    console.log('  Banco: arquivo local .local-data.json (modo de teste)');
    console.log('  Para usar o Neon, crie o arquivo .env com DATABASE_URL=...');
  }
  if (TOKEN) console.log('  Protegido por token (APP_TOKEN).');
  console.log('  Pressione Ctrl+C para parar.');
  console.log('');
});
