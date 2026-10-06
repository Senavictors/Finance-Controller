---
estado: planejado
fonte: docs/product/especificacao-fc2.md (§2, §3, §7)
ultima-revisao: bootstrap-init 2026-10-05
---

# Contexto do Sistema

## Propósito

O Finance Controller 2.0 é um sistema de finanças pessoais de uso exclusivo do dono (single-user), instalado como PWA no iPhone. Responde "quanto posso gastar" ao abrir, permite capturar um gasto em poucos segundos e automatiza importação, categorização e recorrências com revisão humana mínima. Resolve o abandono do 1.x: lançamento caro, saldo que não bate com o banco e ausência de previsão.

## Atores

| Ator | Papel |
|---|---|
| Dono (usuário único) | Usa o PWA (iPhone principal, desktop secundário), importa extratos, revisa o Inbox, configura renda, cartões e dívidas |
| Bot Telegram | Canal de captura, consulta e alertas; aceita apenas o `chatId` cadastrado (ADR-027) |
| Vercel Cron | Dispara jobs diários idempotentes: materialização de recorrências, agentes, fechamento (ADR-030) |
| Cliente MCP (Claude/ChatGPT) | Consulta dados por tools read-only; escrita opt-in (ADR-025) |
| Agentes de desenvolvimento | Claude Code (orquestrador Opus + subagentes Sonnet) e Codex; não são atores do runtime (ADR-031) |

## Fronteiras do sistema (atores/sistemas externos)

- **Neon Postgres** — banco principal; acessado pelo Prisma 7 via `DATABASE_URL` (pooled em produção).
- **Vercel** — hospedagem do app Next.js, funções serverless e Cron.
- **OpenAI API** — fallback do parser, categorização few-shot, chat e transcrição de áudio; orçamento total de US$ 5, com redaction e registro de custo (ADR-026).
- **Telegram Bot API** — recebe updates por webhook com secret token; envia respostas e alertas.
- **Bancos (Itaú, Nubank, Mercado Pago)** — sem integração direta; dados entram por arquivos PDF/OFX/CSV importados manualmente (ADR-023). Open Finance (Pluggy) fica para a F7.

## Fora do escopo deste contexto

- Multi-tenant SaaS, demo público e landing de portfólio (descartados, ADR-016); `userId` permanece nas tabelas apenas por segurança.
- Movimentação real de dinheiro: o sistema registra e projeta, nunca paga nem transfere por conta própria.
- Dados financeiros reais no repositório: ficam fora do Git (Constituição).

## Estado atual (1.x)

- Sistema web de finanças pessoais com contas, categorias, transações, cartões, metas, wishlist e dashboards drag-and-drop (`prisma/schema.prisma`, `src/app/(app)`).
- Auth própria por sessão em `src/server/auth` (`guard.ts`, `session.ts`, `password.ts`, `rate-limit.ts`).
- Sem integrações externas além do banco: não há OpenAI, Telegram, MCP nem importação de extratos. Não existe cron; recorrências são aplicadas manualmente por `POST /api/recurring-rules/apply`.
- Possui modo demo (`src/server/modules/finance/application/demo/`) e landing em `(public)`, ambos descartados no 2.0.
