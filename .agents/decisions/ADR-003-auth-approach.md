---
id: ADR-003
title: "Custom Server-Side Session Authentication"
status: accepted
date: 2026-04-14
deciders: [Victor]
related_tasks: []
legacy: fc-1.x
---

# ADR-003: Custom Server-Side Session Authentication

> **Revisão 2026-10-05 (FC 2.0):** status `accepted`. Mantido com emenda: single-user com sessão longa renovável (FC2-F0-06).

## Status

Accepted

## Context

The app needs user authentication. Two main approaches: use a library (NextAuth/Auth.js) or build custom auth with server-side sessions.

## Decision

Custom authentication with server-side sessions stored in PostgreSQL.

- **Password hashing**: bcrypt with cost factor 12 (OWASP recommendation)
- **Sessions**: Database-backed with cryptographically random tokens (256-bit)
- **Cookie**: HttpOnly, Secure (production), SameSite=Lax, 7-day expiry
- **Middleware**: Checks cookie presence only (no DB call) for route redirects
- **Auth guard**: `requireAuth()` validates session against DB in Route Handlers (defense in depth)
- **Rate limiting**: In-memory, 5 attempts per 15-minute window per IP on login

## Rationale

- Shows domain mastery for portfolio (vs black-box library)
- Full control over session lifecycle and security properties
- No external dependency complexity (NextAuth config, provider quirks)
- Simple to understand and extend

## Consequences

- Must handle session cleanup (expired sessions accumulate; lazy deletion for now)
- Rate limiting resets on server restart (acceptable for single-instance)
- No OAuth/social login out of the box (can add later)
