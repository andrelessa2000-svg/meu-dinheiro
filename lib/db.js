'use strict';

// Camada de dados unica usada tanto pelo servidor local (server.js) quanto
// pela function do Vercel (api/data.js).
//
// - Se DATABASE_URL estiver definida, usa o Neon Postgres (tabela app_data com um
//   unico registro id=1 guardando todo o objeto em JSONB).
// - Caso contrario, cai automaticamente em um arquivo local .local-data.json,
//   permitindo testar tudo no PC sem criar o Neon ainda.

const fs = require('fs');
const path = require('path');

const LOCAL_FILE = path.join(__dirname, '..', '.local-data.json');

let sqlClient = null;
let schemaReady = false;

async function getClient() {
  if (sqlClient) return sqlClient;
  const { neon } = await import('@neondatabase/serverless');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente');
  sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS app_data (
    id integer PRIMARY KEY,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  schemaReady = true;
}

function useDb() {
  return !!process.env.DATABASE_URL;
}

async function getData() {
  if (useDb()) {
    const sql = await getClient();
    await ensureSchema(sql);
    const rows = await sql`SELECT payload FROM app_data WHERE id = 1`;
    return rows.length ? rows[0].payload : null;
  }
  try {
    if (fs.existsSync(LOCAL_FILE)) return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  } catch (e) {
    console.warn('Falha ao ler dados locais:', e.message);
  }
  return null;
}

async function setData(payload) {
  if (useDb()) {
    const sql = await getClient();
    await ensureSchema(sql);
    const json = JSON.stringify(payload == null ? null : payload);
    await sql`INSERT INTO app_data (id, payload, updated_at)
      VALUES (1, ${json}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
    return true;
  }
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(payload == null ? null : payload));
  return true;
}

module.exports = { getData, setData, useDb };
