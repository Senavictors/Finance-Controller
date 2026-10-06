---
id: ADR-001
title: "Tech Stack Selection"
status: accepted
date: 2026-04-14
deciders: [Victor]
related_tasks: []
legacy: fc-1.x
---

# ADR-001: Tech Stack Selection

> **Revisão 2026-10-05 (FC 2.0):** status `accepted`. Stack mantida com Next.js 16, Prisma 7, Zod 4, Vitest 4, Neon e Vercel (emenda pelo ADR-016).

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
