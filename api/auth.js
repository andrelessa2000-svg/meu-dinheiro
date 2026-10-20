'use strict';

// Function serverless do Vercel: /api/auth
// POST { action: "register" | "login" | "logout", username, password }
// Registra/loga um usuario e devolve um token de sessao.

const { hashPassword, verifyPassword } = require('../lib/auth');
const { createUser, getUserByUsername, createSession, deleteSession } = require('../lib/db');

function normUser(v) {
  return String(v || '').trim().toLowerCase();
}

function bearer(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }
  const body = req.body || {};
  const action = String(body.action || '').toLowerCase();

  try {
    if (action === 'register' || action === 'login') {
      const username = normUser(body.username);
      const password = String(body.password || '');
      if (username.length < 3) return res.status(400).json({ error: 'O usuário deve ter ao menos 3 caracteres.' });
      if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });

      if (action === 'register') {
        let user;
        try {
          user = await createUser(username, hashPassword(password));
        } catch (e) {
          if (e && e.code === 'USER_EXISTS') return res.status(409).json({ error: 'Este usuário já existe. Faça login.' });
          throw e;
        }
        const token = await createSession(user.id);
        return res.status(200).json({ token, username: user.username });
      }

      const user = await getUserByUsername(username);
      if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
      }
      const token = await createSession(user.id);
      return res.status(200).json({ token, username: user.username });
    }

    if (action === 'logout') {
      const t = bearer(req);
      if (t) await deleteSession(t);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida.' });
  } catch (e) {
    console.error('Erro em /api/auth:', e);
    return res.status(500).json({ error: 'server error', detail: String((e && e.message) || e) });
  }
};
