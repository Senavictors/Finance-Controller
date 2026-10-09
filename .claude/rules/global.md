---
name: global
description: Regras globais do Finance Controller 2.0, válidas para qualquer subagente, ferramenta ou alteração no repositório.
---

## Propósito
Manter a reescrita do FC 2.0 coerente enquanto vários agentes (orquestrador Opus e subagentes Sonnet, no Claude Code e no Codex) trabalham em paralelo: mesma arquitetura em camadas, mesmos tokens visuais, mesmas regras de dinheiro e a mesma proteção de dados pessoais.

## Escopo
Todo o repositório: `src/`, `prisma/`, `tests/`, `docs/`, `.agents/`, `.claude/`, `.codex/`, configuração de build e CI.

## Práticas exigidas
- Constituição (`.agents/test-onboarding.md`) acima de qualquer task.
- Camadas: `domain/` puro → `application/` (use-cases, portas) → `infra/` (Prisma) → `http/`/Route Handlers/Server Actions finos. UI e bot só chamam use-cases ou tools (ADR-025).
- Dinheiro em centavos `Int`; datas de calendário ao meio-dia UTC; fuso de negócio `America/Sao_Paulo` explícito.
- Schema só muda via migration em `prisma/migrations/`, pelo papel `dados-prisma`.
- Estilo só com tokens `--fc-*` (`src/styles/tokens.css`) e primitivos de `src/components/fc/` (ADR-018).
- Engines com testes Vitest; integrações externas mockadas em teste.
- Contratos públicos (tools, rotas, webhook, MCP) não mudam silenciosamente; mudanças relevantes viram ADR em `.agents/decisions/`.
- Toda task: registrar execução e validação no próprio arquivo; documentação em `docs/` atualizada (frontmatter `estado`/`fonte`/`ultima-revisao`).
- Commits em Conventional Commits, um por task, identidade `Senavictors <victorsena760@gmail.com>` (hook em `.githooks/pre-commit`).

## Práticas proibidas
- Dados financeiros reais (extratos, faturas, saldos, salário, contratos, CPF, contas, nomes de terceiros) em qualquer arquivo versionado. Arquivos reais vivem em `private/` (gitignored).
- Prisma ou regra de negócio dentro de `route.ts`, componentes ou `domain/`.
- Cores, raios, sombras e durações literais em componentes.
- Segredos em código, docs, tasks, handoffs ou logs; só nomes de variáveis em `.env.example`.
- Chamadas reais à OpenAI/Telegram em testes automatizados.
- `prisma migrate reset`, `DROP`/`TRUNCATE` ou `npm run build` contra o banco de produção sem confirmação humana na hora.

## Documentos necessários antes de alterar código
- `.agents/context/CONTEXT.md`
- Subagente relevante: `.claude/agents/<papel>.md`
- Task ativa em `.agents/tasks/active/`
- `docs/product/especificacao-fc2.md` e os ADRs da task

## Comandos de validação
```bash
npm run lint
npm test
npm run format:check
npm run build    # só next build; migração é npm run db:deploy, manual
```

## Condições de atualização
Revisar quando um ADR novo mudar uma regra listada aqui, quando a Constituição ganhar um item, ou ao final de cada fase pelo orquestrador.
