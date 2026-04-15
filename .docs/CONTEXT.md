# Finance Controller — Current Context

> This file is the living state of the project. Read it before starting any task. Update it after completing any task.

## Current Phase

**Phase 6: Recorrencias e Automacoes** — Completa.

## What Exists

- Next.js 16 App Router + TypeScript + Inter font
- Tailwind CSS v4 com tema Apex Holdings
- shadcn/ui (Base UI) com componentes completos
- Prisma 7 + PostgreSQL
- **Auth**: bcrypt, sessions, cookies, rate limiting
- **Financeiro**: Account, Category, Transaction, Transfer
- **Dashboard customizavel**: react-grid-layout, 6 widgets, layout persistido
- **Recorrencias**: RecurringRule (4 frequencias) + RecurringLog + apply idempotente
  - CRUD de regras recorrentes
  - Endpoint apply que cria transacoes pendentes automaticamente
  - Idempotencia via logs (nao duplica)
  - UI com lista, form, toggle ativar/pausar, botao aplicar
- **25 API routes** (auth, accounts, categories, transactions, analytics, dashboards, recurring-rules)
- **Recharts** para graficos

## What's Next

**Phase 7: Portfolio e Empacotamento**

- "Modo demo" com seed de dados ficticios + botao reset
- Pagina publica com screenshots e descricao tecnica
- CI no GitHub (lint + build)
- Checklist de deploy (Vercel/Netlify)

## Database Models

User, Session, Account, Category, Transaction, Dashboard, DashboardWidget, RecurringRule, RecurringLog

## Key Decisions

- [ADR-001](decisions/ADR-001-tech-stack.md): Tech stack
- [ADR-002](decisions/ADR-002-amount-in-cents.md): Amounts in cents
- [ADR-003](decisions/ADR-003-auth-approach.md): Custom auth
- [ADR-004](decisions/ADR-004-transfer-strategy.md): Transfers as linked pairs
- [ADR-005](decisions/ADR-005-customizable-dashboard.md): Customizable dashboard
- [ADR-006](decisions/ADR-006-recurring-rules.md): Recurring rules with manual apply
