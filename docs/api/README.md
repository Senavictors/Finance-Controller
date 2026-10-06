# API

Contratos das interfaces públicas do 2.0: Route Handlers finos em `src/app/api/**`, jobs em `src/app/api/cron/**`, webhook em `src/app/api/telegram/webhook` e MCP em `src/app/api/mcp`.

## Convenções planejadas

- Route Handlers só validam (Zod em `http/`), autenticam e chamam use-cases (ADR-025).
- Autenticação: sessão por cookie HttpOnly (`src/server/auth`); cron por `CRON_SECRET`; webhook por secret token e `chatId`; MCP por `MCP_TOKEN`.
- Valores monetários em centavos inteiros; datas de calendário como dia ISO (`2026-10-05`) normalizado ao meio-dia UTC.
- Erros em JSON com código estável e mensagem; mutações de importação e cron são idempotentes (`importHash`, chave por série e data).
- Toda query filtra por `userId`.

## Legado 1.x (referência)

Contratos do 1.x movidos para cá; as rotas serão reescritas conforme a fase de cada módulo:

- [`transactions.md`](transactions.md)
- [`analytics.md`](analytics.md)
- [`goals.md`](goals.md)

## Planejados do 2.0 (nascem sob demanda)

- `captura.md` — `POST` de captura/draft (F2-03)
- `lancamentos.md` — CRUD, transferência, inbox (F2-05, F4-05)
- `contas-cartoes.md` — contas, saldo, faturas (F1-02, F1-03)
- `cron.md` — jobs diários, autenticação e idempotência (F3-01, F5-05)
- `telegram-webhook.md` — contrato do webhook (F5-04)
- `mcp.md` — tools expostas e escopo read-only (F5-06)

## Template por endpoint

```markdown
---
estado: planejado | real | divergente
fonte: handler real que implementa o endpoint
ultima-revisao: task ou data
---

# METODO /rota

## Propósito
## Autenticação e autorização
## Idempotência
## Request
## Response
## Erros
## Efeitos colaterais
## Limites
## Exemplos
```
