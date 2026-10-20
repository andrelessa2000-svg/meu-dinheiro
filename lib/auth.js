'use strict';

// Hashing de senha e geracao de tokens de sessao (sem dependencias externas).
// Usa scrypt (embutido no Node) para as senhas e randomBytes para as sessoes.

const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
    const salt = parts[4], expected = Buffer.from(parts[5], 'hex');
    const test = crypto.scryptSync(String(password), salt, expected.length, { N, r, p });
    return expected.length === test.length && crypto.timingSafeEqual(expected, test);
  } catch (e) {
    return false;
  }
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, newToken };
