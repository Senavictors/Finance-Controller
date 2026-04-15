# Finance Controller — Current Context

> This file is the living state of the project. Read it before starting any task. Update it after completing any task.

## Current Phase

**Phase 5: Dashboard Customizavel** — Completa.

## What Exists

- Next.js 16 App Router + TypeScript + Inter font
- Tailwind CSS v4 com tema Apex Holdings (cantos 2rem+, sombras, gradientes)
- shadcn/ui (Base UI) com componentes completos
- Prisma 7 + PostgreSQL (com adapter)
- **Auth**: bcrypt, sessions, cookies, rate limiting
- **Financeiro**: Account, Category, Transaction, Transfer
- **Dashboard customizavel**: react-grid-layout com drag/resize
  - 6 tipos de widgets (balance, income-expenses, expenses-by-category, accounts, recent-transactions, transactions-count)
  - Modo edicao toggle com drag handle e botoes remover/adicionar
  - Layout persistido no banco por usuario (Dashboard + DashboardWidget models)
  - Widget registry extensivel
- **22 API routes** (auth, accounts, categories, transactions, analytics, dashboards)
- **Recharts** para graficos (BarChart, PieChart)

## What's Next

**Phase 6: Recorrencias e Automacoes**

- `recurring_rules` (mensal, semanal, etc.)
- Job para aplicar regras vencidas e criar transacoes
- Log de execucao
- UI para gerenciar regras recorrentes

## Database Models

User, Session, Account, Category, Transaction, Dashboard, DashboardWidget

## Key Decisions

- [ADR-001](decisions/ADR-001-tech-stack.md): Tech stack
- [ADR-002](decisions/ADR-002-amount-in-cents.md): Amounts in cents
- [ADR-003](decisions/ADR-003-auth-approach.md): Custom auth
- [ADR-004](decisions/ADR-004-transfer-strategy.md): Transfers as linked pairs
- [ADR-005](decisions/ADR-005-customizable-dashboard.md): Customizable dashboard
