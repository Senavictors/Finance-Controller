# Finance Controller

Personal finance management system — fullstack Next.js app.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui (Radix)
- **Database**: PostgreSQL + Prisma 7
- **Validation**: Zod
- **Auth**: Custom server-side sessions (Phase 2)

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run format:check # Prettier (check only)
npx prisma studio    # DB GUI
npx prisma migrate dev --name <name>  # Create migration
npx prisma generate  # Regenerate client
```

## Architecture

```
UI → Route Handlers (API) → Use Cases → Domain → Repositories → DB
```

- Route Handlers (`app/api/**/route.ts`) are thin HTTP adapters
- Business logic lives in `src/server/modules/**/application/`
- Domain rules in `src/server/modules/**/domain/`
- Prisma repos in `src/server/modules/**/infra/`
- DTOs/validators in `src/server/modules/**/http/`

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- **Amounts**: Always in cents (integer). R$ 150.75 = `15075`
- **Multi-tenant**: Every financial table has `userId`. Every query filters by `userId`
- **Theme**: Blue/teal/green palette. **NO purple**. Dark mode supported via `.dark` class
- **Validation**: Zod schemas for all API inputs and form data
- **Documentation**: Update `.docs/CONTEXT.md` after every task, and update `README.md` whenever a task is created or concluded so roadmap/backlog/phases stay in sync. Create ADRs for architectural decisions

## Git Identity

This repo uses local git config:

- **user.name**: Senavictors
- **user.email**: victorsena760@gmail.com

A pre-commit hook enforces this. If collaborating, run:

```bash
git config core.hooksPath .githooks
```

## Documentation

- `README.md` — Public roadmap, next step and concluded phases
- `.docs/CONTEXT.md` — Living project state (read before any task)
- `.docs/vision.md` — Project vision and goals
- `.docs/architecture/README.md` — Architecture overview
- `.docs/domain/` — Domain documentation
- `.docs/api/` — API documentation
- `.docs/data/` — Data documentation
- `.docs/architecture/` — Architecture deep dives
- `.docs/decisions/` — Architecture Decision Records (ADRs)
- `.docs/tasks/` — Task tracking files
- `.docs/CHANGELOG.md` — Curated changelog
