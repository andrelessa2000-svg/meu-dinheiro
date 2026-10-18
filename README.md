# Meu Dinheiro

Aplicativo de finanças pessoais (PWA) com os dados guardados em um banco
Postgres (Neon). Roda **localmente no seu PC** para testes e depois pode ser
publicado no **Vercel** (via GitHub).

## Estrutura

```
index.html              Aplicativo (PWA) — interface completa
manifest.webmanifest    Metadados do app instalável
sw.js                   Service worker (cache do app / modo offline da interface)
icons/                  Ícones do PWA
api/data.js             Function do Vercel: GET/PUT /api/data
lib/db.js               Acesso ao banco (Neon JSONB ou arquivo local de teste)
server.js               Servidor local (estático + /api/data), sem dependências extras
iniciar-local.bat       Atalho para rodar o servidor local no Windows
schema.sql              SQL da tabela (criação é automática, este é opcional)
.env.example            Modelo das variáveis de ambiente (copie para .env)
vercel.json             Configuração de deploy do Vercel
meu_dinheiro.html       Versão anterior (single-file). Mantida como referência.
```

## Como rodar no PC

1. Tenha o **Node.js LTS** instalado (https://nodejs.org).
2. Dê duplo clique em **`iniciar-local.bat`**.
   - Na primeira vez ele instala as dependências e abre o navegador em
     `http://localhost:8080`.
3. Para parar, feche a janela ou pressione `Ctrl+C`.

Se você ainda **não** tem um `.env`, ele roda com um banco de teste em arquivo
(`.local-data.json`). Basta criar o `.env` para passar a usar o Neon.

## Banco de dados (Neon)

O app guarda **todo o conteúdo** em uma única tabela:

```sql
CREATE TABLE IF NOT EXISTS app_data (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

O registro `id = 1` contém todo o JSON do aplicativo. A tabela é criada
automaticamente na primeira leitura/gravação — não precisa rodar SQL à mão.

### Configuração

1. Copie `.env.example` para `.env`.
2. Preencha a `DATABASE_URL` com a connection string do Neon
   (painel do Neon → Connect → copie a string com `sslmode=require`).
3. (Opcional) Defina um `APP_TOKEN`. Se preenchido, o app pede o token
   **uma vez** e o guarda no navegador.

Exemplo de `.env`:

```
DATABASE_URL=postgresql://usuario:senha@ep-xxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require
APP_TOKEN=troque-por-um-valor-secreto
```

### Migração automática

Na primeira abertura, se o banco estiver vazio, o app envia para o Neon os dados
que já estiverem no cache do navegador para **esse endereço** (ou os dados de
demonstração, se não houver nada). Nas próximas vezes, o próprio cache é usado
como ponto de partida enquanto o banco responde.

> Observação: os dados da versão antiga aberta por `file://` ficam em outra
> origem e **não** migram sozinhos. Para trazê-los, abra a versão antiga,
> use **Dados e privacidade → Exportar**, e depois **Importar** no app novo.

## Publicar no Vercel (GitHub → Vercel)

1. Crie um repositório no GitHub e envie este projeto
   (o `.env` **não** é versionado — confira o `.gitignore`).
2. No Vercel, importe o repositório.
3. Em **Settings → Environment Variables**, adicione:
   - `DATABASE_URL` — a mesma connection string do Neon;
   - `APP_TOKEN` — o mesmo token (ou outro; o app guardará o valor novo).
4. Deploy. O app ficará em `https://seu-projeto.vercel.app`.
5. Abra no PC e no celular. No celular, use "Adicionar à tela inicial" para
   instalar como app.

## Observações

- O celular precisa de internet para ler/gravar no banco. A interface fica em
  cache (abre offline), mas os dados atuais vêm do Neon.
- A sincronização é "o último que grava vence" (um único JSON). Para uso
  pessoal em poucos aparelhos é suficiente.
- Faça backups periódicos pelo menu **Dados e privacidade → Exportar**.
