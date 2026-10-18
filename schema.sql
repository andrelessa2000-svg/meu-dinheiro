CREATE TABLE IF NOT EXISTS app_data (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
