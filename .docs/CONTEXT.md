# Finance Controller — Current Context

> This file is the living state of the project. Read it before starting any task. Update it after completing any task.

## Current Phase

**Phase 13: Documentation Foundation** — Concluido. Fundacao da nova camada documental criada com as pastas `.docs/domain/`, `.docs/api/`, `.docs/data/` e `.docs/architecture/`, templates obrigatorios por camada, spec em `future-features/05-docs-foundation.md`, task em `tasks/phase-13-docs-foundation.md` e migracao do overview arquitetural para `.docs/architecture/README.md`.

## Next Planned Step

Iniciar a fase de Domain Documentation com prioridade para `goals`, `forecast`, `financial-score` e `insights`, seguindo estritamente o fluxo `future-features -> tasks -> execucao -> CONTEXT -> CHANGELOG`.

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
- **Credit card billing**: configuracao de limite/fechamento/vencimento, faturas, pagina de leitura e pagamento de fatura
- **Snapshot and invalidation base**: tags por usuario/modulo/mes e invalidação central de analytics em mutacoes financeiras
- **Demo hardening**: seed/reset demo agora montam um cartao com fatura paga e outra em aberto, e a UI de faturas/transacoes ficou mais demonstravel
- **Goal Engine**: modulo de metas com SAVING, EXPENSE_LIMIT, INCOME_TARGET e ACCOUNT_LIMIT; calculo de progresso com projecao; snapshots; pagina `/goals`; widget `goal-progress` no dashboard; 3 metas demo no seed
- **Forecast Engine**: previsao mensal com saldo previsto, nivel de risco (LOW/MEDIUM/HIGH), projecao de recorrencias futuras, media movel de despesa variavel e snapshot persistido; widget `forecast` no dashboard; APIs `GET /api/analytics/forecast` e `POST /api/analytics/forecast/recalculate`
- **Financial Score**: pontuacao 0-100 com 5 fatores explicaveis e redistribuicao por ausencia de dados; status CRITICAL/ATTENTION/GOOD/EXCELLENT; snapshot persistido com delta vs mes anterior; widget `score` no dashboard; APIs `GET /api/analytics/score` e `GET /api/analytics/score/history`
- **Automatic Insights**: motor deterministico com 6 heuristicas (variacao por categoria, concentracao, metas em risco, forecast negativo, fatura vencendo/vencida, utilizacao alta de cartao), dedupe por fingerprint, cap de 8 por periodo, dismiss persistente; widget `insights` no dashboard; APIs `GET /api/analytics/insights`, `POST /recalculate`, `PATCH /[id]/dismiss`
- **Documentation foundation**: nova estrutura de documentacao em `.docs/domain/`, `.docs/api/`, `.docs/data/` e `.docs/architecture/`, com templates obrigatorios por camada e base pronta para expansao faseada
- **Documentation backlog**: roadmap formalizado com specs `06` a `18` e tasks `14` a `26` para dominio, logica, API, dados e arquitetura
- **Repo hygiene**: `.gitignore` ajustado para ignorar configs locais de tooling em `.claude/`, logs genericos e artefatos comuns de chave/certificado (`*.key`, `*.crt`, `*.p12`, `*.pfx`)
- **Seed demo**: script com dados ficticios (demo@finance.com / demo1234)
- **Reset demo**: botao em /settings que recria dados
- **Landing page**: hero + features + tech stack + footer
- **CI**: GitHub Actions (lint + format:check + build)
- **README**: completo com setup, tech stack, roadmap
- **Future feature specs**: `.docs/future-features/` com Goal Engine, Forecast Engine, Score Financeiro, Insights Automaticos, Documentation Foundation e o roadmap documental das fases 14 a 26
- **Execution backlog**: tasks formais criadas para as phases 8.5, 9, 10, 11, 12, 13 e o backlog documental das phases 14 a 26 em `.docs/tasks/`
- **Technical plan**: task documentada para a fundacao analitica e ciclo de fatura de cartao
- **31 API routes**, 15 models, 13 ADRs

## Database Models

User, Session, Account, Category, Transaction, CreditCardStatement, Dashboard, DashboardWidget, RecurringRule, RecurringLog, Goal, GoalSnapshot, ForecastSnapshot, FinancialScoreSnapshot, InsightSnapshot

## Current Architectural Reality

- A arquitetura alvo em camadas continua sendo a direcao do projeto
- Na implementacao atual, boa parte das regras e agregacoes ainda vive em `app/api/**/route.ts` e em server pages com Prisma direto
- As specs em `.docs/future-features/` assumem uma extracao gradual de uma camada analitica/use case antes de expandir metas, forecast, score e insights
- O produto passou a assumir explicitamente suporte futuro a cartao de credito com limite, fechamento, vencimento e faturas
- A fundacao da camada analitica server-side comecou a sair de `route.ts` e foi centralizada em `src/server/modules/finance/application/analytics/`
- A mesma camada agora possui convencoes de snapshot e invalidação para summary, goals, forecast, score, insights e billing de cartao
- O dominio de cartao agora possui ciclo de fatura em `src/server/modules/finance/application/credit-card/` e superfice inicial em `/credit-cards`
- A Phase 8.5 esta refinando demonstrabilidade: demo mais forte, faturas mais legiveis e navegação mais clara entre compra e fatura

## Documentation Layers

- Domain Docs
- API Docs
- Data Docs
- Architecture Deep Dive

## Documentation Roadmap

- Phase 14: Domain Docs - Goals
- Phase 15: Domain Docs - Forecast
- Phase 16: Domain Docs - Financial Score
- Phase 17: Domain Docs - Insights
- Phase 18: Logic Docs - Forecast Calculation
- Phase 19: Logic Docs - Financial Score Calculation
- Phase 20: Logic Docs - Insights Engine
- Phase 21: API Docs - Transactions
- Phase 22: API Docs - Analytics
- Phase 23: API Docs - Goals
- Phase 24: Data Docs - Data Dictionary
- Phase 25: Architecture Docs - Flows
- Phase 26: Architecture Docs - Sequence

## Key Decisions

- [ADR-001](decisions/ADR-001-tech-stack.md): Tech stack
- [ADR-002](decisions/ADR-002-amount-in-cents.md): Amounts in cents
- [ADR-003](decisions/ADR-003-auth-approach.md): Custom auth
- [ADR-004](decisions/ADR-004-transfer-strategy.md): Transfers as linked pairs
- [ADR-005](decisions/ADR-005-customizable-dashboard.md): Customizable dashboard
- [ADR-006](decisions/ADR-006-recurring-rules.md): Recurring rules
- [ADR-007](decisions/ADR-007-demo-seed.md): Demo seed data
- [ADR-008](decisions/ADR-008-credit-card-billing-cycle.md): Credit card billing cycle
- [ADR-009](decisions/ADR-009-analytics-snapshot-invalidation.md): Analytics snapshot and invalidation strategy
- [ADR-010](decisions/ADR-010-goal-engine.md): Goal Engine
- [ADR-011](decisions/ADR-011-forecast-engine.md): Forecast Engine
- [ADR-012](decisions/ADR-012-financial-score.md): Financial Score
- [ADR-013](decisions/ADR-013-automatic-insights.md): Automatic Insights
