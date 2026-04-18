# Finance Controller — Architecture

## Layered Architecture

```text
UI (Next.js App Router)
  ↓
API (Route Handlers) — thin HTTP layer: validate, auth guard, call use case
  ↓
Application (Use Cases) — business orchestration
  ↓
Domain — entities, rules, value objects
  ↓
Infrastructure — Prisma repositories, external services
```

## Key Principles

- **Route Handlers are adapters**: validate input (Zod), check session, call use case, return Response
- **Business logic lives in use cases and domain**, never in route.ts
- **Repository pattern**: `TransactionRepository`, `CategoryRepository`, etc.
- **Multi-tenant by default**: every financial table has `userId`, every query filters by `userId`
- **Amounts in cents**: all monetary values stored as integers to avoid floating-point errors

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
