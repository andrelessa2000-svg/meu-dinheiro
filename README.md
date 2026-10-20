# Meu Dinheiro

Aplicativo de finanças pessoais (PWA) **multiusuário**: cada pessoa cria sua
conta (usuário e senha) e vê apenas os próprios dados. Os dados ficam em um
banco Postgres (Neon). Roda **localmente no seu PC** para testes e depois pode
ser publicado no **Vercel** (via GitHub).

## Estrutura

```
index.html              Aplicativo (PWA) — interface completa + tela de login
manifest.webmanifest    Metadados do app instalável
sw.js                   Service worker (cache do app / modo offline da interface)
icons/                  Ícones do PWA
api/auth.js             Function do Vercel: /api/auth (registrar/entrar/sair)
api/data.js             Function do Vercel: /api/data (GET/PUT por usuário)
lib/auth.js             Hash de senha (scrypt) e geração de tokens de sessão
lib/db.js               Acesso ao banco (Neon ou arquivo local de teste)
server.js               Servidor local (estático + /api/*), sem dependências extras
iniciar-local.bat       Atalho para rodar o servidor local no Windows
schema.sql              SQL das tabelas (criação é automática; este é opcional)
.env.example            Modelo das variáveis de ambiente (copie para .env)
vercel.json             Configuração de deploy do Vercel
meu_dinheiro.html       Versão anterior (single-file). Mantida como referência.
```

## Como rodar no PC

1. Tenha o **Node.js LTS** instalado (https://nodejs.org).
2. Dê duplo clique em **`iniciar-local.bat`**.
   - Na primeira vez ele instala as dependências e abre o navegador em
     `http://localhost:8080`.
3. Crie uma conta em "Criar conta" e use o app.
4. Para parar, feche a janela ou pressione `Ctrl+C`.

Se você ainda **não** tem um `.env`, ele roda com um banco de teste em arquivo
(`.local-data.json`). Basta criar o `.env` para passar a usar o Neon.

## Banco de dados (Neon)

Cada usuário tem uma conta e seus dados ficam isolados. O app usa três tabelas
(criadas automaticamente no primeiro uso):

```sql
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
```

- `users` — contas (senha guardada com hash **scrypt**, nunca em texto puro).
- `sessions` — tokens de login (validade de 60 dias).
- `user_data` — o JSON de finanças de cada usuário.

### Configuração

1. Copie `.env.example` para `.env`.
2. Preencha a `DATABASE_URL` com a connection string do Neon
   (painel do Neon → Connect → copie a string com `sslmode=require`).

Exemplo de `.env`:

```
DATABASE_URL=postgresql://usuario:senha@ep-xxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require
```

> Dica: no dia a dia não é preciso mexer em SQL — as tabelas e o schema são
> criados sozinhos na primeira leitura/gravação.

### Migração de dados antigos

Cada conta começa com os dados de demonstração. Se você tinha dados da versão
single-file (`file://` ou a antiga de usuário único), abra-a, use
**Dados e privacidade → Exportar** e depois faça **Importar** já logado na sua
conta nova.

## Publicar no Vercel (GitHub → Vercel)

1. Crie um repositório no GitHub e envie este projeto
   (o `.env` **não** é versionado — confira o `.gitignore`).
2. No Vercel, importe o repositório.
3. Em **Settings → Environment Variables**, adicione:
   - `DATABASE_URL` — a mesma connection string do Neon.
4. Deploy. O app ficará em `https://seu-projeto.vercel.app`.
5. Abra no PC e no celular. No celular, use "Adicionar à tela inicial" para
   instalar como app. Crie sua conta e pronto.

> Conexão automática GitHub → Vercel: no painel do Vercel em
> **Settings → Git**, conecte o repositório. Se ele for **privado**, autorize o
> app do Vercel a acessá-lo (GitHub → Settings → Applications → Vercel →
> conceder acesso ao repositório).

## Observações

- O celular precisa de internet para ler/gravar no banco. A interface fica em
  cache (abre offline), mas os dados atuais vêm do Neon.
- A sincronização é "o último que grava vence", **por usuário**.
- Faça backups periódicos pelo menu **Dados e privacidade → Exportar**.
