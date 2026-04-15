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
- Financial models: Account (6 types), Category (hierarchical), Transaction
- Account CRUD API with create/read/update/delete
- Category CRUD API with hierarchy validation and transaction protection
- Transaction CRUD API with filters, pagination, and search
- Transfer endpoint creating atomic linked transaction pairs
- Zod validation schemas for all financial entities
- App layout with sidebar navigation and period selector (month)
- Accounts page with card grid and create/edit dialog
- Categories page with hierarchical list and INCOME/EXPENSE sections
- Transactions page with table, filters, pagination, and create/transfer dialog
- Dashboard with summary cards (accounts, categories, transactions count)
- Currency formatting utilities (formatCurrency, parseCents)
- ADR-004: Transfer strategy (linked transaction pairs)
