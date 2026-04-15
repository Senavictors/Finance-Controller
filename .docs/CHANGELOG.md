# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

- Initial project setup with Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 with blue/teal custom theme (dark mode support)
- shadcn/ui with base components (button, card, input, label)
- Prisma 7 with PostgreSQL datasource and User model
- ESLint + Prettier configuration
- Project folder structure (route groups, server modules)
- Documentation structure (.docs/ with ADRs, tasks, vision, architecture)
- Pre-commit hook for git identity enforcement
- Custom server-side authentication (bcrypt + database sessions)
- Auth API routes: register, login, logout, me
- Zod validation schemas for auth inputs
- In-memory rate limiting on login endpoint
- Next.js middleware for route protection (auth redirects)
- Login and register pages with form validation
- Dashboard placeholder page (authenticated)
- Session model in Prisma schema
- ADR-003: Auth approach decision
