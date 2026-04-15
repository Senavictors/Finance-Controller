# Finance Controller — Current Context

> This file is the living state of the project. Read it before starting any task. Update it after completing any task.

## Current Phase

**Phase 3: Nucleo Financeiro** — Completa. CRUD de contas, categorias, transacoes e transferencias implementado.

## What Exists

- Next.js 16 App Router with TypeScript
- Tailwind CSS v4 with blue/teal theme tokens (no purple), dark mode via `.dark` class
- shadcn/ui (Base UI) with components: button, card, input, label, dialog, select, badge, table, dropdown-menu, separator, sheet, scroll-area
- Prisma 7 configured for PostgreSQL
- **Authentication**: bcrypt, server-side sessions, HttpOnly cookies, rate limiting
- **Financial Models**: Account (6 types), Category (hierarchical), Transaction, Transfer (par linkado)
- **API Routes**: auth (4), accounts (5), categories (4), transactions (5 + transfer)
- **App Layout**: Sidebar + Topbar with period selector (month)
- **UI Pages**: Dashboard (summary cards), Accounts (grid + create/edit dialog), Categories (hierarchical list + create/edit), Transactions (table + filters + pagination + create/transfer dialog)
- Utility: `formatCurrency()`, `formatDate()`, `parseCents()`

## What's Next

**Phase 4: Dashboard MVP**

- Dashboard com cards de saldo por conta
- Graficos: gasto por categoria, receitas x despesas (linha temporal)
- Endpoint agregador `/api/analytics/summary`
- Chart.js ou Recharts

## Database State

- Models: User, Session, Account, Category, Transaction
- **Migrations not applied yet** — need running PostgreSQL
- Enums: AccountType, CategoryType, TransactionType
- Indexes on userId, token, accountId, categoryId, date, transferId

## API Routes

| Route                        | Method | Auth | Description                                  |
| ---------------------------- | ------ | ---- | -------------------------------------------- |
| `/api/auth/register`         | POST   | No   | Create user + session                        |
| `/api/auth/login`            | POST   | No   | Verify credentials + create session          |
| `/api/auth/logout`           | POST   | No   | Destroy session + clear cookie               |
| `/api/auth/me`               | GET    | Yes  | Return current user                          |
| `/api/accounts`              | GET    | Yes  | List accounts                                |
| `/api/accounts`              | POST   | Yes  | Create account                               |
| `/api/accounts/:id`          | GET    | Yes  | Get account                                  |
| `/api/accounts/:id`          | PATCH  | Yes  | Update account                               |
| `/api/accounts/:id`          | DELETE | Yes  | Delete account (cascades transactions)       |
| `/api/categories`            | GET    | Yes  | List categories (filter ?type=)              |
| `/api/categories`            | POST   | Yes  | Create category                              |
| `/api/categories/:id`        | PATCH  | Yes  | Update category                              |
| `/api/categories/:id`        | DELETE | Yes  | Delete category (blocks if has transactions) |
| `/api/transactions`          | GET    | Yes  | List transactions (filters + pagination)     |
| `/api/transactions`          | POST   | Yes  | Create transaction                           |
| `/api/transactions/:id`      | PATCH  | Yes  | Update transaction (blocks transfers)        |
| `/api/transactions/:id`      | DELETE | Yes  | Delete transaction (transfers delete pair)   |
| `/api/transactions/transfer` | POST   | Yes  | Create transfer (2 atomic transactions)      |

## Key Decisions

- [ADR-001](decisions/ADR-001-tech-stack.md): Tech stack
- [ADR-002](decisions/ADR-002-amount-in-cents.md): Amounts in cents
- [ADR-003](decisions/ADR-003-auth-approach.md): Custom auth with server-side sessions
- [ADR-004](decisions/ADR-004-transfer-strategy.md): Transfers as linked transaction pairs
