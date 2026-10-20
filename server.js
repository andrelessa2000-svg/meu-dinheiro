'use strict';

// Servidor local do Meu Dinheiro.
// - Serve os arquivos estaticos (index.html, manifest, sw.js, icons...).
// - Expoe a API: /api/auth (register/login/logout) e /api/data (por sessao).
// - Le as variaveis de .env (DATABASE_URL, PORT) sem depender de dotenv.
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

const { hashPassword, verifyPassword } = require('./lib/auth');
const db = require('./lib/db');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;

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
  'server.js', 'package.json', 'package-lock.json', '.env', '.env.local', '.env.example', '.env.production', '.env.development', '.env.test',
  '.local-data.json', 'schema.sql', 'README.md', 'iniciar-local.bat',
  'vercel.json', '.gitignore', '.vercelignore', 'meu_dinheiro.html',
  '_cleanup_testusers.mjs'
]);
const BLOCKED_DIRS = new Set(['.git', 'node_modules', 'lib', 'api', 'legacy']);

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function bearer(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (!body) return null;
  return JSON.parse(body);
}

function normUser(v) {
  return String(v || '').trim().toLowerCase();
}

async function handleAuth(req, res) {
  if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); return res.end(); }
  let body;
  try { body = await readJson(req); }
  catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
  body = body || {};
  const action = String(body.action || '').toLowerCase();
  try {
    if (action === 'register' || action === 'login') {
      const username = normUser(body.username);
      const password = String(body.password || '');
      if (username.length < 3) return sendJson(res, 400, { error: 'O usuário deve ter ao menos 3 caracteres.' });
      if (password.length < 6) return sendJson(res, 400, { error: 'A senha deve ter ao menos 6 caracteres.' });

      if (action === 'register') {
        let user;
        try { user = await db.createUser(username, hashPassword(password)); }
        catch (e) {
          if (e && e.code === 'USER_EXISTS') return sendJson(res, 409, { error: 'Este usuário já existe. Faça login.' });
          throw e;
        }
        const token = await db.createSession(user.id);
        return sendJson(res, 200, { token, username: user.username });
      }

      const user = await db.getUserByUsername(username);
      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJson(res, 401, { error: 'Usuário ou senha inválidos.' });
      }
      const token = await db.createSession(user.id);
      return sendJson(res, 200, { token, username: user.username });
    }
    if (action === 'logout') {
      const t = bearer(req);
      if (t) await db.deleteSession(t);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 400, { error: 'Ação inválida.' });
  } catch (e) {
    console.error('Erro em /api/auth:', e);
    sendJson(res, 500, { error: 'server error' });
  }
}

async function handleData(req, res) {
  let user;
  try { user = await db.getUserByToken(bearer(req)); }
  catch (e) { console.error('Erro ao validar sessao:', e); return sendJson(res, 500, { error: 'server error' }); }
  if (!user) return sendJson(res, 401, { error: 'unauthorized' });

  try {
    if (req.method === 'GET') {
      const data = await db.getData(user.id);
      return sendJson(res, 200, data == null ? null : data);
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      let payload;
      try { payload = await readJson(req); }
      catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
      if (payload == null || typeof payload !== 'object') {
        return sendJson(res, 400, { error: 'bad body' });
      }
      await db.setData(user.id, payload);
      return sendJson(res, 200, { ok: true });
    }
    res.writeHead(405, { allow: 'GET, PUT' });
    res.end();
  } catch (e) {
    console.error('Erro em /api/data:', e);
    sendJson(res, 500, { error: 'server error' });
  }
}

function serveStatic(req, res) {
  let rel;
  try { rel = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end('bad request'); }
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
  if (pathname === '/api/auth') return handleAuth(req, res);
  if (pathname === '/api/data') return handleData(req, res);
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Meu Dinheiro  ->  http://localhost:' + PORT);
  if (db.useDb()) {
    console.log('  Banco: Neon Postgres (DATABASE_URL definida)');
  } else {
    console.log('  Banco: arquivo local .local-data.json (modo de teste)');
    console.log('  Para usar o Neon, crie o arquivo .env com DATABASE_URL=...');
  }
  console.log('  Login multiusuario ativo (/api/auth).');
  console.log('  Pressione Ctrl+C para parar.');
  console.log('');
});
