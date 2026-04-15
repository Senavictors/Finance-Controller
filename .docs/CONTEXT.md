# Finance Controller — Current Context

> This file is the living state of the project. Read it before starting any task. Update it after completing any task.

## Current Phase

**Phase 2: Authentication** — Complete. Custom server-side session auth implemented.

## What Exists

- Next.js 16 App Router with TypeScript
- Tailwind CSS v4 with blue/teal theme tokens (no purple), dark mode via `.dark` class
- shadcn/ui (Radix) with base components: button, card, input, label
- Prisma 7 configured for PostgreSQL with User + Session models
- ESLint + Prettier
- **Authentication system**:
  - bcrypt password hashing (cost 12)
  - Server-side sessions with HttpOnly cookies (7-day expiry)
  - Auth guard (`requireAuth()`) for Route Handlers
  - In-memory rate limiting on login (5 attempts / 15 min)
  - Zod validation schemas for register/login
- **API Routes**: `/api/auth/{register,login,logout,me}`
- **Middleware**: Route protection (redirects unauthenticated users to /login, authenticated to /dashboard)
- **UI Pages**: Login, Register (with forms), Dashboard placeholder
- Project folder structure and documentation

## What's Next

**Phase 3: Financial Core**

- CRUD de contas (accounts)
- CRUD de categorias (com hierarquia parentId)
- CRUD de transacoes (lista + filtros por periodo)
- Transferencias (2 transacoes + link via transferId)

## Database State

- Models: `User`, `Session`
- **Migrations not applied yet** — need a running PostgreSQL instance
- Session model has indexes on `token` and `userId`

## API Routes

| Route                | Method | Auth | Description                         |
| -------------------- | ------ | ---- | ----------------------------------- |
| `/api/auth/register` | POST   | No   | Create user + session               |
| `/api/auth/login`    | POST   | No   | Verify credentials + create session |
| `/api/auth/logout`   | POST   | No   | Destroy session + clear cookie      |
| `/api/auth/me`       | GET    | Yes  | Return current user                 |

## Key Decisions

- [ADR-001](decisions/ADR-001-tech-stack.md): Tech stack (Next.js + Prisma + PostgreSQL)
- [ADR-002](decisions/ADR-002-amount-in-cents.md): Amounts stored as cents (integer)
- [ADR-003](decisions/ADR-003-auth-approach.md): Custom auth with server-side sessions
