'use strict';

// Camada de dados unica usada tanto pelo servidor local (server.js) quanto
// pela function do Vercel (api/auth.js e api/data.js).
//
// - Se DATABASE_URL estiver definida, usa o Neon Postgres.
// - Caso contrario, cai automaticamente em um arquivo local .local-data.json,
//   permitindo testar tudo no PC sem criar o Neon.
//
// Modelo:
//   users     -> contas (usuario + senha com hash)
//   sessions  -> tokens de sessao (login)
//   user_data -> o objeto de financas de cada usuario (JSONB)

const fs = require('fs');
const path = require('path');
const { newToken } = require('./auth');

const LOCAL_FILE = path.join(__dirname, '..', '.local-data.json');
const SESSION_DAYS = 60;

let sqlClient = null;
let schemaReady = false;

function useDb() {
  return !!process.env.DATABASE_URL;
}

async function getClient() {
  if (sqlClient) return sqlClient;
  const { neon } = await import('@neondatabase/serverless');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente');
  sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    username text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS sessions (
    token text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS user_data (
    user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  schemaReady = true;
}

function expiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

// ------------------------- armazenamento local (arquivo) -------------------------
function readLocal() {
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      const j = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
      return {
        users: Array.isArray(j.users) ? j.users : [],
        sessions: Array.isArray(j.sessions) ? j.sessions : [],
        data: j.data && typeof j.data === 'object' ? j.data : {}
      };
    }
  } catch (e) {
    console.warn('Falha ao ler dados locais:', e.message);
  }
  return { users: [], sessions: [], data: {} };
}

function writeLocal(db) {
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(db, null, 2));
}

// ----------------------------------- usuarios -----------------------------------
async function createUser(username, passwordHash) {
  if (useDb()) {
    const sql = await getClient();
    await ensureSchema(sql);
    try {
      const rows = await sql`INSERT INTO users (username, password_hash)
        VALUES (${username}, ${passwordHash}) RETURNING id, username`;
      return rows[0];
    } catch (e) {
      if (e && (e.code === '23505' || /duplicate|unique/i.test(String(e.message || '')))) {
        const err = new Error('USER_EXISTS');
        err.code = 'USER_EXISTS';
        throw err;
      }
      throw e;
    }
  }
  const db = readLocal();
  if (db.users.some((u) => u.username === username)) {
    const err = new Error('USER_EXISTS');
    err.code = 'USER_EXISTS';
    throw err;
  }
  const user = {
    id: (db.users.reduce((m, u) => Math.max(m, u.id), 0) || 0) + 1,
    username,
    password_hash: passwordHash,
    created_at: new Date().toISOString()
  };
  db.users.push(user);
  writeLocal(db);
  return { id: user.id, username: user.username };
}

async function getUserByUsername(username) {
  if (useDb()) {
    const sql = await getClient();
    await ensureSchema(sql);
    const rows = await sql`SELECT id, username, password_hash FROM users WHERE username = ${username}`;
    return rows[0] || null;
  }
  const db = readLocal();
  const u = db.users.find((x) => x.username === username);
  return u ? { id: u.id, username: u.username, password_hash: u.password_hash } : null;
}

// ----------------------------------- sessoes -----------------------------------
async function createSession(userId) {
  const token = newToken();
  const exp = expiresAt();
  if (useDb()) {
    const sql = await getClient();
    await ensureSchema(sql);
    await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${exp})`;
    return token;
  }
  const db = readLocal();
  db.sessions = db.sessions.filter((s) => new Date(s.expires_at).getTime() > Date.now());
  db.sessions.push({ token, user_id: userId, expires_at: exp.toISOString() });
  writeLocal(db);
  return token;
}

async function getUserByToken(token) {
  if (!token) return null;
  if (useDb()) {
    const sql = await getClient();
    await ensureSchema(sql);
    const rows = await sql`SELECT u.id, u.username
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ${token} AND s.expires_at > now()`;
    return rows[0] || null;
  }
  const db = readLocal();
  const s = db.sessions.find((x) => x.token === token && new Date(x.expires_at).getTime() > Date.now());
  if (!s) return null;
  const u = db.users.find((x) => x.id === s.user_id);
  return u ? { id: u.id, username: u.username } : null;
}

async function deleteSession(token) {
  if (!token) return;
  if (useDb()) {
    const sql = await getClient();
    await ensureSchema(sql);
    await sql`DELETE FROM sessions WHERE token = ${token}`;
    return;
  }
  const db = readLocal();
  db.sessions = db.sessions.filter((s) => s.token !== token);
  writeLocal(db);
}

// ------------------------------ dados por usuario ------------------------------
async function getData(userId) {
  if (useDb()) {
    const sql = await getClient();
    await ensureSchema(sql);
    const rows = await sql`SELECT payload FROM user_data WHERE user_id = ${userId}`;
    return rows.length ? rows[0].payload : null;
  }
  const db = readLocal();
  const p = db.data[String(userId)];
  return p == null ? null : p;
}

async function setData(userId, payload) {
  if (useDb()) {
    const sql = await getClient();
    await ensureSchema(sql);
    const json = JSON.stringify(payload == null ? null : payload);
    await sql`INSERT INTO user_data (user_id, payload, updated_at)
      VALUES (${userId}, ${json}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
    return true;
  }
  const db = readLocal();
  db.data[String(userId)] = payload == null ? null : payload;
  writeLocal(db);
  return true;
}

module.exports = {
  useDb,
  createUser,
  getUserByUsername,
  createSession,
  getUserByToken,
  deleteSession,
  getData,
  setData
};
