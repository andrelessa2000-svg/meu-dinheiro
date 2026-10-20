-- Esquema do banco (Neon Postgres) do Meu Dinheiro.
-- Cada usuario tem sua propria conta (login/senha) e seus proprios dados.
-- As tabelas sao criadas automaticamente no primeiro uso; este arquivo serve
-- como referencia/manual (rode no SQL editor do Neon se preferir).

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS user_data (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
