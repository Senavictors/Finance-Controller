# Guia de Agentes — Finance Controller 2.0

Este arquivo é **versionado** (decisão de 05/10/2026: `.agents/`, `docs/` e decisões vão para o Git). Por isso nada aqui, em `.agents/` ou em `docs/` pode conter dados financeiros reais (ver Constituição).

## Projeto

Sistema de finanças pessoais de uso exclusivo do dono (single-user), em reescrita completa para a versão 2.0: PWA mobile-first (iPhone 13 Pro), design "dark glass", captura por texto, importação de extratos com Inbox de revisão, engine "quanto posso gastar" com modo Aperto, dívidas/juros, renda MEI, bot Telegram e IA (OpenAI) com orçamento de US$ 5.

Stack real: Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS v4 + shadcn/Base UI, PostgreSQL (Neon) + Prisma 7, Zod 4, Vitest 4, deploy na Vercel. Tudo na raiz do repositório (não é monorepo).

## Fontes de verdade

- Contexto vivo: `.agents/context/CONTEXT.md`
- Estado de trabalho: `.agents/tasks/` (backlog → active → completed) e `.agents/handoffs/`
- Decisões arquiteturais: `.agents/decisions/` (índice em `.agents/decisions/README.md`)
- Constituição e teste de sanidade: `.agents/test-onboarding.md`
- Memória persistente entre sessões: `.agents/memory/`
- Especificação mestre do produto: `docs/product/especificacao-fc2.md`
- Documentação do produto: `docs/` (mapa em `docs/README.md`)
- Índice de fases/tasks: `PLANS.md`

## Leitura obrigatória antes de alterar código

1. Leia `.agents/context/CONTEXT.md`.
2. Identifique a task ativa em `.agents/tasks/active/` (ou a fase em execução em `PLANS.md`).
3. Leia o papel especializado relevante em `.claude/agents/` (lista abaixo).
4. Releia a **Constituição** em `.agents/test-onboarding.md`.
5. Para qualquer task do FC 2.0, consulte `docs/product/especificacao-fc2.md` e os ADRs citados em `related_adrs` da task.

## Execução das fases (orquestrador + subagentes)

O desenvolvimento das fases é conduzido por um **orquestrador em Opus** (sessão principal, `.claude/agents/orquestrador.md`, ativado por `.claude/settings.json`) que delega cada task a **subagentes em Sonnet**, em ondas paralelas, e revisa/integra o resultado. Procedimento completo: skill `.claude/skills/executar-fase/SKILL.md` (ADR-031).

```text
/executar-fase F1
  orquestrador (opus) ── lê PLANS.md + tasks da fase + depends_on
     ├── onda 1 (paralelo, worktrees): dados-prisma, ui-design-system ...
     ├── qa-revisor valida cada entrega (lint, test, build, critérios)
     ├── merge sequencial + bootstrap-complete por task
     └── onda 2 ... até a fase fechar → atualiza CONTEXT, PLANS, README
```

## Auditoria local

Antes de um commit ou handoff, rode a skill `bootstrap-audit` (teste de sanidade, compliance de formato entre Claude Code e Codex, guardrail anti-vazamento, índice de ADRs). Para o guardrail valer também em commits manuais, rode `bootstrap-install-hook` uma vez por máquina (opcional).

## Ciclo de vida de uma task

`bootstrap-plan` (ingestão → 3 opções → ADR → task em `backlog/`) → mover para `active/` ao começar → `bootstrap-handoff` se pausar → `bootstrap-complete` verifica o DoD (código → docs → testes) e move para `completed/`.

## Mapa do repositório

- `src/app/` — App Router: páginas (`(app)/`, `(auth)/`, `(public)/`) e Route Handlers (`api/`). No 2.0, os destinos são `hoje`, `lancamentos`, `planejar`, `cartoes` e `mais`.
- `src/server/modules/` — backend por módulo (`domain/` puro, `application/` use-cases, `infra/` Prisma, `http/` Zod/DTOs). O 1.x tem tudo em `finance/`; o 2.0 separa por módulo (ver `docs/architecture/components.md`).
- `src/server/auth/` — sessão própria (cookie HttpOnly, bcrypt).
- `src/components/` — UI; `src/components/ui/` (shadcn) e, no 2.0, `src/components/fc/` (primitivos dark glass).
- `src/styles/tokens.css` — tokens do design system (ADR-018).
- `src/lib/` — utilitários (`money.ts`, `brands/`, `format.ts`).
- `prisma/` — `schema.prisma`, migrations, seed. Banco Neon **pode ser zerado** (autorizado pelo dono).
- `public/brands/` — logos de bancos/serviços.
- `.agents/` — estado de trabalho dos agentes · `docs/` — documentação · `.claude/`, `.codex/` — adaptadores.
- Legado a remover na F0: `backend/`, `database/`, arquivos CRA em `src/` (`App.js`, `index.js`, `pages/`, `contexts/`…), coleções Postman, `start-api.*`, `MELHORIAS_FUTURAS.md`, `README_*.md`.

## Papéis especializados (agentes)

- `.claude/agents/orquestrador.md` — **Opus**. Conduz uma fase: planeja ondas, delega, revisa, integra, fecha tasks. Não implementa features grandes sozinho.
- `.claude/agents/dados-prisma.md` — Sonnet. Schema Prisma, migrations, seed, índices. **Veto** sobre operações destrutivas de banco.
- `.claude/agents/dominio-financeiro.md` — Sonnet. Engines puras: ledger, faturas, recorrência/matching, Disponível, Flex, dívidas, renda MEI, parser.
- `.claude/agents/api-servidor.md` — Sonnet. Use-cases, Route Handlers/Server Actions, registro de tools, jobs (Vercel Cron), auth.
- `.claude/agents/ui-design-system.md` — Sonnet. Tokens, primitivos dark glass, motion, PWA shell, acessibilidade.
- `.claude/agents/telas-produto.md` — Sonnet. Telas Hoje, Lançamentos/Inbox, Captura, Planejar, Cartões, Mais.
- `.claude/agents/ia-integracoes.md` — Sonnet. Importadores (PDF/OFX/CSV), OpenAI com orçamento, bot Telegram, agentes agendados, MCP.
- `.claude/agents/qa-revisor.md` — Sonnet. Testes, revisão de diff contra critérios de aceitação e Constituição. **Veto** sobre concluir task sem evidência.

## Regras globais

- Constituição em `.agents/test-onboarding.md` vale acima de qualquer task.
- Valores monetários sempre em centavos (`Int`); datas de calendário ao meio-dia UTC (ADR-002).
- Engines de domínio são funções puras com testes Vitest; nada de Prisma dentro de `domain/`.
- Toda mutação financeira passa por um use-case em `application/` (a mesma função serve UI, bot e MCP — ADR-025).
- Nenhuma cor/raio/sombra literal em componentes: só tokens `--fc-*` (ADR-018).
- Não amplie o escopo de uma task sem registrar em `.agents/tasks/`; decisões arquiteturais viram ADR.
- Commits em Conventional Commits, um por task (`feat(f1-ledger): ...`), identidade `Senavictors <victorsena760@gmail.com>`.

Detalhe em `.claude/rules/global.md`.

## Comandos reais

```bash
npm run dev            # next dev (localhost:3000)
npm run build          # só "next build"; NÃO migra o banco (desde 09/10/2026)
npm run db:deploy      # prisma migrate deploy via DIRECT_URL (ou DATABASE_URL) — manual, nunca no build; contra produção só com confirmação
npx next build         # build SEM migrate: use este para validar localmente e no CI
npm run lint           # eslint
npm test               # vitest run (inclui os guards; TZ=America/Sao_Paulo)
npm run test:coverage  # cobertura v8; mínimo 80% só para src/server/modules/**/domain/**
npm run typecheck      # tsc --noEmit
npm run guard:data     # guard de dados reais (CPF/CNPJ/conta/cartão/e-mail/telefone, nomes de fixtures)
npm run format         # prettier --write .
npm run format:check   # prettier --check . (espera working tree em LF; ver .gitattributes e tests/README.md)
npx prisma migrate dev --name <nome>
npx prisma generate    # também roda no postinstall
npx prisma studio
```

Ressalva: para validar build sem tocar o banco, use `npx next build` (sem migrate). O CI (`.github/workflows/ci.yml`) roda `npm ci`, `prisma generate`, `lint`, `format:check`, `typecheck`, `test`, `npx next build` (com `DATABASE_URL` fictício, sem migrate) e `guard:data`. O hook `.githooks/pre-commit` valida a identidade e roda o guard sobre os arquivos staged.

## Critérios de conclusão

- Critérios de aceitação da task verificados, com evidência.
- `npm run lint`, `npm test` e `npx next build` executados conforme o escopo alterado.
- Docs em `docs/` atualizados (frontmatter `estado`/`ultima-revisao`).
- Riscos e pendências declarados; handoff em `.agents/handoffs/` quando houver continuação.
