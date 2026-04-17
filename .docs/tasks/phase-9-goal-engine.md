# Task: Phase 9 - Goal Engine

## Status

- [x] Todo
- [x] In Progress
- [x] Done

## Context

O projeto agora possui base analitica compartilhada, billing real de cartao e estrategia inicial de snapshot/invalidation. Isso abre caminho para transformar metas financeiras em um modulo central do produto.

Esta task operacionaliza a spec em [Goal Engine](../future-features/01-goal-engine.md) e depende da [Phase 8](./phase-8-analytics-foundation-and-credit-card-billing.md).

## Objective

Entregar um modulo de metas financeiras com calculo confiavel por periodo, suporte a escopos diferentes e integracao com dashboard e alertas.

## Scope

- Criar dominio de metas e snapshots de progresso
- Suportar metas de:
  - economia mensal
  - limite de despesa
  - meta de receita
  - limite por conta/cartao
- Implementar calculo de progresso por periodo
- Expor APIs de CRUD e leitura de progresso
- Adicionar pagina `/goals`
- Integrar cards ou widget inicial no dashboard

## Out of Scope

- Forecast Engine completo
- Score Financeiro
- Feed completo de Insights
- Automacoes/agendamentos de recalculo fora do request path

## Decisions

- Metas devem usar a camada analitica server-side existente
- `TRANSFER` continua fora dos calculos de metas
- Metas por categoria devem incluir subcategorias por padrao quando a categoria-alvo for pai
- Metas ligadas a cartao devem preferir limite e fatura aberta, nao apenas mes calendario bruto

## Contracts

### Internal contracts

- `createGoal(input)`
- `updateGoal(input)`
- `archiveGoal(goalId, userId)`
- `listGoals(userId)`
- `calculateGoalProgress(goalId, period)`
- `refreshGoalSnapshot(goalId, period)`

### Planned HTTP contracts

- `GET /api/goals`
- `POST /api/goals`
- `PATCH /api/goals/[id]`
- `DELETE /api/goals/[id]`
- `GET /api/goals/progress?month=2026-04`
- `GET /api/goals/[id]/progress?month=2026-04`

### Response expectations

- Toda resposta de progresso deve informar:
  - valor alvo
  - valor atual
  - percentual
  - status
  - alertas ativos

## Migrations

- Criar `Goal`
- Criar `GoalSnapshot`
- Introduzir enums de metrica, escopo, periodo e status

## UI

- Nova pagina `/goals`
- Cards com progresso, status e escopo
- Barra de progresso com mensagens objetivas
- Alertas de limite ou risco na dashboard
- Possivel widget `goal-progress` no registro de widgets

## Tests

- CRUD de metas
- Calculo por tipo de meta
- Inclusao de subcategorias
- Exclusao de `TRANSFER`
- Meta de cartao usando billing real
- Snapshot stale e recalc on-demand

## Checklist

- [x] Modelos Prisma criados
- [x] Use cases de metas implementados
- [x] APIs de CRUD e progresso implementadas
- [x] Pagina `/goals` entregue
- [x] Integracao inicial com dashboard entregue (widget `goal-progress`)
- [x] `.docs/CONTEXT.md` updated
- [x] ADR created/updated (ADR-010)
- [x] Manual validation done (lint + build OK)

## Notes for AI (next step)

Esta feature deve ser a primeira a preencher de verdade a arquitetura em camadas do modulo financeiro. Nao replique regras de periodo nem agregacao dentro de `route.ts`.
