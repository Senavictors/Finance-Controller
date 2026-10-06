---
estado: planejado
fonte: docs/product/especificacao-fc2.md (§5); AGENTS.md (mapa do repositório)
ultima-revisao: bootstrap-init 2026-10-05
---

# Componentes

## Backend por módulo

Cada módulo vive em `src/server/modules/<modulo>/` com quatro camadas: `domain/` (regras puras), `application/` (use-cases), `infra/` (repositórios Prisma, adaptadores externos) e `http/` (schemas Zod e DTOs). Regras de dependência em [`dependencies.md`](dependencies.md).

| Módulo | Responsabilidade | Engines/ADRs |
|---|---|---|
| `ledger` | Transações, status (PLANNED a RECONCILED), saldo derivado, `AccountBalance`, reconciliação | ADR-019, ADR-002, ADR-004 |
| `accounts` | Contas, cheque especial, uso do limite | ADR-019 |
| `cards` | Cartões, ciclo de fatura, compras e parcelas, pagamento, estorno | ADR-008 |
| `recurring` | Séries RRULE, ocorrências PLANNED, matching, outstanding | ADR-020 |
| `budget` | Ciclo de orçamento, Flex em 3 baldes, engine Disponível | ADR-021, ADR-022 |
| `debts` | Empréstimos (Price), juros, ordem por taxa, quitação | ADR-028 |
| `income` | Regra MEI (base + dia presencial), DAS, teto anual | ADR-029 |
| `capture` | Parser quick-add pt-BR e `createFromDraft` | ADR-024 |
| `merchants` | Normalização de descrição, aliases, defaults por merchant | ADR-024 |
| `rules` | Motor de regras (condições e ações), origem USER/LEARNED | ADR-024 |
| `imports` | `ImportBatch`, `importHash`, parsers OFX/CSV/PDF, Inbox | ADR-023 |
| `ai` | Cliente OpenAI, orçamento, redaction, `AiUsage`, memória | ADR-026 |
| `telegram` | Webhook, vínculo de `chatId`, respostas e alertas | ADR-027 |
| `tools` | Registro único de tools (Zod) sobre os use-cases | ADR-025 |
| `goals` | Metas Reserva, Prioridade, Desejo, Quitação | — |
| `reports` | Fluxo, categorias, Must/Need/Want, juros pagos | — |
| `auth` | Sessão single-user (mantém `src/server/auth`) | — |

Jobs agendados (`src/app/api/cron/**`) chamam use-cases dos módulos acima; não contêm regra de negócio (ADR-030).

## Frontend

- `src/app/(app)/{hoje,lancamentos,planejar,cartoes,mais}` — páginas das 4 abas mais "Mais" (ADR-017).
- `src/components/fc/` — primitivos dark glass (ADR-018); consomem apenas tokens `--fc-*` de `src/styles/tokens.css`.
- `src/components/ui/` — base shadcn/Base UI.
- `src/lib/` — utilitários compartilhados puros (`money.ts`, `format.ts`, `brands/`).

## Estado atual (1.x)

- Backend concentrado em um único módulo: `src/server/modules/finance/` com `application/` (`analytics`, `credit-card`, `credit-card-purchases`, `demo`, `forecast`, `goals`, `insights`, `score`, `wishlist`), `http/` (`schemas.ts`, `index.ts`) e `infra/` e `domain/` vazios.
- Ciclo de fatura em `application/credit-card/statement-cycle.ts` (com testes) e parcelas em `application/credit-card-purchases/use-cases.ts`: candidatos a reaproveitamento.
- `application/analytics/monthly-summary.ts` soma só o mês e ignora transferências: origem do "saldo errado"; será substituído pelo ledger.
- Auth em `src/server/auth` (`guard.ts`, `session.ts`, `password.ts`, `rate-limit.ts`, `schemas.ts`), mantida no 2.0.
- UI em `src/components/` sem camada `fc/` e sem tokens únicos.
