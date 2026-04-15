# ADR-001: Tech Stack Selection

## Status

Accepted

## Context

We need a fullstack framework for a personal finance app that doubles as a portfolio piece and potential SaaS base. The developer works solo, so simplicity and cohesion matter.

## Decision

- **Next.js (App Router)** + **TypeScript**: single repo, single framework for frontend + API. Route Handlers replace the need for a separate backend.
- **Tailwind CSS v4** + **shadcn/ui (Radix)**: utility-first CSS with copy-paste components. Full control, no black-box library.
- **PostgreSQL** + **Prisma**: robust relational DB with type-safe ORM. Free tiers available (Neon, Supabase).
- **Zod**: runtime validation that infers TypeScript types. Shared between frontend forms and API DTOs.

## Consequences

- Monorepo simplicity (1 deploy, 1 stack to learn)
- Route Handlers keep API logic colocated but separated via use cases
- Prisma migrations provide DB version control
- shadcn/ui components are owned code, not a dependency to track
