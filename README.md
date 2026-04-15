# Finance Controller

![CI](https://github.com/Senavictors/Finance-Controller/actions/workflows/ci.yml/badge.svg)

Sistema de gestao financeira pessoal fullstack, construido como projeto de portfolio com arquitetura de producao.

## Demo

**Login**: `demo@finance.com` / `demo1234`

Execute `npx prisma db seed` para popular o banco com dados ficticios.

## Tech Stack

| Camada         | Tecnologia                             |
| -------------- | -------------------------------------- |
| Framework      | Next.js 16 (App Router)                |
| Linguagem      | TypeScript                             |
| Estilizacao    | Tailwind CSS v4 + shadcn/ui            |
| Banco de Dados | PostgreSQL                             |
| ORM            | Prisma 7                               |
| Validacao      | Zod                                    |
| Graficos       | Recharts                               |
| Auth           | Custom (bcrypt + server-side sessions) |

## Funcionalidades

- **Dashboard customizavel** com drag-and-drop (react-grid-layout)
- **Multi-contas**: corrente, carteira, cartao, investimento
- **Categorias hierarquicas** com subcategorias
- **Transacoes** com filtros, paginacao e busca
- **Transferencias atomicas** entre contas
- **Recorrencias** automatizaveis (salario, aluguel, assinaturas)
- **Autenticacao segura** com bcrypt, cookies HttpOnly, rate limiting
- **Tema refinado** inspirado em Apex Holdings (Inter font, cantos arredondados, sombras suaves)

## Como Rodar

```bash
# Clonar
git clone git@github.com:Senavictors/Finance-Controller.git
cd Finance-Controller

# Instalar dependencias
npm install

# Configurar ambiente
cp .env.example .env
# Editar .env com sua DATABASE_URL do PostgreSQL

# Criar tabelas
npx prisma migrate dev

# Popular com dados demo
npx prisma db seed

# Gerar client Prisma
npx prisma generate

# Rodar em desenvolvimento
npm run dev
```

Acesse `http://localhost:3000`

## Comandos

```bash
npm run dev          # Dev server
npm run build        # Build producao
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run format:check # Prettier (check)
npx prisma studio    # GUI do banco
npx prisma db seed   # Popular dados demo
```

## Estrutura

```
src/
  app/
    (auth)/          Login, Register
    (app)/           Dashboard, Transactions, Categories, Accounts, Recurring, Settings
    api/             Route Handlers (25 rotas)
  server/
    auth/            Sessions, password, guard, rate-limit
    modules/finance/ Schemas Zod, DTOs
  components/
    ui/              shadcn/ui (Base UI)
    layout/          Sidebar, Topbar, AppShell
  lib/               Utilities (formatCurrency, cn)
  hooks/             Custom hooks (usePeriod)
prisma/              Schema + migrations + seed
.docs/               Documentacao viva (ADRs, tasks, changelog)
```

## Arquitetura

```
UI (Next.js App Router)
  |
API (Route Handlers) - validacao Zod, auth guard
  |
Application (Use Cases) - logica de negocio
  |
Infrastructure (Prisma) - repositorios
  |
PostgreSQL
```

## Roadmap

- [x] Phase 1: Fundacao (Next.js, Tailwind, Prisma, ESLint)
- [x] Phase 2: Autenticacao (bcrypt, sessions, guards)
- [x] Phase 3: Nucleo Financeiro (contas, categorias, transacoes, transferencias)
- [x] Phase 4: Dashboard MVP (graficos, analytics, redesign visual)
- [x] Phase 5: Dashboard Customizavel (react-grid-layout, widgets)
- [x] Phase 6: Recorrencias (regras, apply idempotente, logs)
- [x] Phase 7: Portfolio (seed demo, CI, README)

## Licenca

Projeto pessoal de portfolio.
