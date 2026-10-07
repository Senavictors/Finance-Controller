---
estado: planejado
fonte: AGENTS.md (comandos reais); .env.example do 1.x; ADR-030
ultima-revisao: FC2-F0-06 2026-10-05
---

# Implantação

## Topologia

- **Hospedagem:** Vercel (app Next.js, funções serverless, Cron).
- **Banco:** Neon Postgres, uma conexão pooled para o app. O banco do 1.x pode ser apagado; o schema 2.0 nasce do zero (ADR-016).
- **Cron:** Vercel Cron diário, configurado em `vercel.json` (a criar na F3). Cada rota `src/app/api/cron/**` valida `Authorization: Bearer` com `CRON_SECRET` e é idempotente (ADR-030).
- **Webhook Telegram:** registrado manualmente via Bot API apontando para `NEXT_PUBLIC_APP_URL` + `/api/telegram/webhook`, com secret token.

## Variáveis de ambiente (somente nomes)

Valores vivem em `.env.local` (gitignored) e nas Environment Variables da Vercel; nunca no Git.

| Variável | Uso | Fase |
|---|---|---|
| `DATABASE_URL` | Conexão Neon (pooled em produção) | F0 |
| `SESSION_SECRET` | Reservado (a sessão usa token aleatório com hash no banco; hoje não é lido) | F0 |
| `OWNER_EMAIL`, `OWNER_NAME` | Opcionais; só para `npm run owner:create` (a senha é pedida no terminal, nunca em variável) | F0 |
| `NEXT_PUBLIC_APP_URL` | URL pública do app | F0 |
| `CRON_SECRET` | Autenticação dos jobs Cron (`Authorization: Bearer`); o proxy já exige (F0-06), ausente = negado | F0 (guard) / F3 (jobs) |
| `OPENAI_API_KEY` | Cliente OpenAI | F5 |
| `OPENAI_MONTHLY_BUDGET_USD` | Teto mensal de gasto com IA | F5 |
| `OPENAI_MODEL_SMALL` | Modelo pequeno (parser fallback, categorização, chat) | F5 |
| `OPENAI_MODEL_TRANSCRIBE` | Modelo de transcrição de áudio | F5 |
| `TELEGRAM_BOT_TOKEN` | Token do bot | F5 |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token validado no webhook; o proxy já exige (F0-06), ausente = negado | F0 (guard) / F5 |
| `TELEGRAM_ALLOWED_CHAT_ID` | Único `chatId` aceito | F5 |
| `MCP_TOKEN` | Token do servidor MCP (`Authorization: Bearer`); o proxy já exige (F0-06), ausente = negado | F0 (guard) / F5 |

## Build e migrations

- Atenção: `npm run build` executa `prisma migrate deploy && next build` e **aplica migrations no banco apontado por `DATABASE_URL`**. Em máquina local, com `DATABASE_URL` de produção, isso altera o banco real.
- Para validar a compilação sem tocar o banco, use `npx next build`.
- Migrations novas: `npx prisma migrate dev --name <nome>` em banco de desenvolvimento; `prisma generate` roda no `postinstall`.
- O reset do Neon da F0 é destrutivo e exige aprovação do dono (veto do papel `dados-prisma`).
- CI (`.github/workflows/ci.yml`): `npm ci`, `prisma generate`, `lint`, `format:check`, `build`.

## Observabilidade e falhas

- Logs de função e Cron pela Vercel; custo de IA em `AiUsage` (ADR-026).
- Jobs idempotentes: reexecução do mesmo dia não duplica lançamentos (chaves por série e data, `importHash`).
- Indisponibilidade da OpenAI degrada para parser determinístico e fila de revisão no Inbox.

## Estado atual (1.x)

- `package.json` já define `"build": "prisma migrate deploy && next build"`.
- `.env.example` declara `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `SESSION_SECRET` (reservado) e, comentados, `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `MCP_TOKEN`, `OWNER_EMAIL` e `OWNER_NAME`.
- Não há `vercel.json` nem Cron; recorrências dependem de `POST /api/recurring-rules/apply` acionado à mão.
