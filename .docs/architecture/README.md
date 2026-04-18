# Finance Controller — Architecture

## Layered Architecture

```text
UI (Next.js App Router)
  ↓
API (Route Handlers) — HTTP layer: validate, auth guard, call use case or Prisma during migration
  ↓
Application (Use Cases) — business orchestration
  ↓
Domain — entities, rules, value objects
  ↓
Infrastructure — Prisma repositories, external services
```

## Key Principles

- **Route Handlers should be adapters**: validate input (Zod), check session, orchestrate the operation, return Response
- **Business logic should move into use cases and domain progressively**, reducing Prisma access in route.ts and Server Components
- **Repository pattern**: `TransactionRepository`, `CategoryRepository`, etc.
- **Multi-tenant by default**: every financial table has `userId`, every query filters by `userId`
- **Amounts in cents**: all monetary values stored as integers to avoid floating-point errors

## Current Reality

- The layered architecture remains the target direction for the codebase.
- `src/server/modules/finance/application/` already concentrates analytics, credit-card billing, goals, forecast, score and insights.
- Many CRUD routes and some Server Components still read/write with Prisma directly while the extraction work continues.

## Directory Structure

```text
src/
  app/
    (public)/          — landing/marketing pages
    (auth)/            — login, register
    (app)/             — authenticated app pages
    api/               — Route Handlers
  server/
    auth/              — session, hashing, guards
    modules/finance/
      domain/          — entities, rules
      application/     — use cases
      infra/           — Prisma repositories
      http/            — DTOs, Zod validators
  components/
    ui/                — shadcn/ui components
    layout/            — sidebar, topbar, page shells
  lib/                 — shared utilities
  hooks/               — React hooks
  types/               — shared TypeScript types
prisma/                — schema + migrations
.docs/                 — documentation, ADRs, tasks
```

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Framework  | Next.js 16 (App Router)             |
| Language   | TypeScript                          |
| Styling    | Tailwind CSS v4 + shadcn/ui (Radix) |
| Database   | PostgreSQL                          |
| ORM        | Prisma 7                            |
| Validation | Zod                                 |
| Auth       | Custom (server-side sessions)       |

## Documentation Layers

- `README.md` — overview arquitetural desta pasta
- `_TEMPLATE.md` — template obrigatorio para deep dives arquiteturais
- arquivos futuros como `flows.md` e `sequence.md` — detalhamento de fluxos criticos
