'use strict';

// Function serverless do Vercel: /api/data
// GET  -> devolve o objeto salvo do usuario logado (ou null)
// PUT  -> grava o objeto do usuario logado (last-write-wins)
//
// Autenticacao: header "Authorization: Bearer <token de sessao>" (vindo de /api/auth).

const { getUserByToken, getData, setData } = require('../lib/db');

function bearer(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

module.exports = async (req, res) => {
  let user;
  try {
    user = await getUserByToken(bearer(req));
  } catch (e) {
    console.error('Erro ao validar sessao:', e);
    return res.status(500).json({ error: 'server error' });
  }
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  try {
    if (req.method === 'GET') {
      const data = await getData(user.id);
      return res.status(200).json(data == null ? null : data);
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const payload = req.body;
      if (payload == null || typeof payload !== 'object') {
        return res.status(400).json({ error: 'bad body' });
      }
      await setData(user.id, payload);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).end();
  } catch (e) {
    console.error('Erro em /api/data:', e);
    return res.status(500).json({ error: 'server error', detail: String((e && e.message) || e) });
  }
};
