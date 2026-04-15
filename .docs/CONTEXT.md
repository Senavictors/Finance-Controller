# Finance Controller — Current Context

> This file is the living state of the project. Read it before starting any task. Update it after completing any task.

## Current Phase

**Phase 1: Foundation** — Project setup complete. No features implemented yet.

## What Exists

- Next.js 16 App Router with TypeScript
- Tailwind CSS v4 with blue/teal theme tokens (no purple), dark mode via `.dark` class
- shadcn/ui (Radix) with base components: button, card, input, label
- Prisma 7 configured for PostgreSQL with initial User model
- ESLint + Prettier
- Project folder structure ready for layered architecture
- Documentation structure in `.docs/`

## What's Next

**Phase 2: Authentication**

- Implement `users` + `sessions` tables (Prisma migration)
- Password hashing with bcrypt/argon2 (OWASP guidelines)
- Login/logout pages and API endpoints
- Session cookies (HttpOnly, Secure, SameSite)
- Auth guards for protected routes (UI + API)
- Rate limiting on login endpoint

## Database State

- Schema defined but **no migrations run yet**
- Models: `User` (id, email, name, password, timestamps)
- Need a running PostgreSQL instance to migrate

## API Routes

None implemented yet. Planned:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Key Decisions

- [ADR-001](decisions/ADR-001-tech-stack.md): Tech stack (Next.js + Prisma + PostgreSQL)
- [ADR-002](decisions/ADR-002-amount-in-cents.md): Amounts stored as cents (integer)
