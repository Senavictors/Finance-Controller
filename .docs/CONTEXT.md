# Finance Controller — Current Context

> This file is the living state of the project. Read it before starting any task. Update it after completing any task.

## Current Phase

**Phase 4: Dashboard MVP + Redesign Visual** — Completa.

## What Exists

- Next.js 16 App Router with TypeScript
- Tailwind CSS v4 com tema refinado inspirado em Apex Holdings (cantos arredondados 1rem+, sombras suaves, gradientes sutis)
- shadcn/ui (Base UI) com componentes completos
- Prisma 7 configurado para PostgreSQL
- **Autenticacao**: bcrypt, sessoes server-side, HttpOnly cookies, rate limiting
- **Nucleo Financeiro**: Account, Category (hierarquica), Transaction, Transfer
- **Dashboard completo**: Hero card com saldo, stat cards com variacao, BarChart receitas x despesas (Recharts), DonutChart gastos por categoria, saldo por conta, ultimas transacoes
- **Analytics API**: `/api/analytics/summary?month=YYYY-MM`
- **Layout refinado**: Sidebar com active state primary, topbar com period pill, mobile sheet
- **Paginas polidas**: Empty states com icones, cards com sombras, tipografia tracking-tight
- **Landing page**: Hero com CTA e branding
- **Auth pages**: Logo no topo, design mais sofisticado

## What's Next

**Phase 5: Dashboard Customizavel**

- Modelo `dashboards` + `dashboard_widgets`
- Grid drag/resizable com react-grid-layout
- Persistir layout e configuracoes por usuario
- UI para adicionar/remover/salvar widgets

## Database State

- Models: User, Session, Account, Category, Transaction
- **Migrations not applied yet** — need running PostgreSQL
- Enums: AccountType, CategoryType, TransactionType

## API Routes

19 rotas no total (auth 4, accounts 5, categories 4, transactions 5+transfer, analytics 1)

## Key Decisions

- [ADR-001](decisions/ADR-001-tech-stack.md): Tech stack
- [ADR-002](decisions/ADR-002-amount-in-cents.md): Amounts in cents
- [ADR-003](decisions/ADR-003-auth-approach.md): Custom auth with server-side sessions
- [ADR-004](decisions/ADR-004-transfer-strategy.md): Transfers as linked transaction pairs
