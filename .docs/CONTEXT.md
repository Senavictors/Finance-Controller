# Finance Controller — Current Context

> This file is the living state of the project. Read it before starting any task. Update it after completing any task.

## Current Phase

**Phase 8: Foundation for Analytics and Credit Card Billing** — Em andamento. Phases 8.1 (shared analytics core) e 8.2 (test foundation) implementadas.

## Next Planned Step

**Phase 8.3: Credit Card Billing Domain** — Proxima etapa planejada em `.docs/tasks/phase-8-analytics-foundation-and-credit-card-billing.md`

## What Exists

- Next.js 16 App Router + TypeScript + Inter font
- Tailwind CSS v4 com tema Apex Holdings
- shadcn/ui (Base UI)
- Prisma 7 + PostgreSQL
- **Auth**: bcrypt, sessions, cookies, rate limiting
- **Financeiro**: Account, Category, Transaction, Transfer
- **Dashboard customizavel**: react-grid-layout, 6 widgets, layout persistido
- **Recorrencias**: RecurringRule + RecurringLog + apply idempotente
- **Analytics core compartilhado**: `resolveMonthPeriod` + `getMonthlyAnalyticsSummary` reutilizados por dashboard, analytics API e transactions page
- **Test foundation**: Vitest configurado com primeiros testes do analytics core
- **Seed demo**: script com dados ficticios (demo@finance.com / demo1234)
- **Reset demo**: botao em /settings que recria dados
- **Landing page**: hero + features + tech stack + footer
- **CI**: GitHub Actions (lint + format:check + build)
- **README**: completo com setup, tech stack, roadmap
- **Future feature specs**: `.docs/future-features/` com Goal Engine, Forecast Engine, Score Financeiro e Insights Automaticos
- **Technical plan**: task documentada para a fundacao analitica e ciclo de fatura de cartao
- **25 API routes**, 9 models, 8 ADRs

## Database Models

User, Session, Account, Category, Transaction, Dashboard, DashboardWidget, RecurringRule, RecurringLog

## Current Architectural Reality

- A arquitetura alvo em camadas continua sendo a direcao do projeto
- Na implementacao atual, boa parte das regras e agregacoes ainda vive em `app/api/**/route.ts` e em server pages com Prisma direto
- As specs em `.docs/future-features/` assumem uma extracao gradual de uma camada analitica/use case antes de expandir metas, forecast, score e insights
- O produto passou a assumir explicitamente suporte futuro a cartao de credito com limite, fechamento, vencimento e faturas
- A fundacao da camada analitica server-side comecou a sair de `route.ts` e foi centralizada em `src/server/modules/finance/application/analytics/`

## Key Decisions

- [ADR-001](decisions/ADR-001-tech-stack.md): Tech stack
- [ADR-002](decisions/ADR-002-amount-in-cents.md): Amounts in cents
- [ADR-003](decisions/ADR-003-auth-approach.md): Custom auth
- [ADR-004](decisions/ADR-004-transfer-strategy.md): Transfers as linked pairs
- [ADR-005](decisions/ADR-005-customizable-dashboard.md): Customizable dashboard
- [ADR-006](decisions/ADR-006-recurring-rules.md): Recurring rules
- [ADR-007](decisions/ADR-007-demo-seed.md): Demo seed data
- [ADR-008](decisions/ADR-008-credit-card-billing-cycle.md): Credit card billing cycle
