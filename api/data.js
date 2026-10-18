'use strict';

// Function serverless do Vercel: /api/data
// GET  -> devolve o objeto salvo (ou null)
// PUT  -> grava o objeto (last-write-wins)
//
// Usa a mesma lib/db.js do servidor local. A DATABASE_URL (Neon) deve estar
// configurada nas Environment Variables do projeto no Vercel.

const { getData, setData } = require('../lib/db');

function authorized(req) {
  const token = process.env.APP_TOKEN || '';
  if (!token) return true;
  const h = req.headers['authorization'] || '';
  return h === 'Bearer ' + token || req.headers['x-app-token'] === token;
}

module.exports = async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    if (req.method === 'GET') {
      const data = await getData();
      return res.status(200).json(data == null ? null : data);
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const payload = req.body;
      if (payload == null || typeof payload !== 'object') {
        return res.status(400).json({ error: 'bad body' });
      }
      await setData(payload);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).end();
  } catch (e) {
    console.error('Erro em /api/data:', e);
    return res.status(500).json({ error: 'server error', detail: String((e && e.message) || e) });
  }
};
