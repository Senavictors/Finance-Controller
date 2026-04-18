# Task: Phase 22 - API Docs: Analytics

## Status

- [x] Todo
- [ ] In Progress
- [ ] Done

## Context

Executa a spec [Docs - API Analytics](../future-features/14-docs-api-analytics.md) e cobre a superficie analitica atual do sistema.

As rotas a documentar sao: `summary`, `forecast`, `forecast/recalculate`, `score`, `score/history`, `insights`, `insights/recalculate` e `insights/[id]/dismiss`.

## Objective

Criar `.docs/api/analytics.md` com contratos HTTP, parametros, respostas, erros e efeitos colaterais das rotas analiticas.

## Scope

- Summary mensal
- Forecast e recalculate
- Score e history
- Insights, recalculate e dismiss
- Parametro `month`, ownership, cache e invalidacao em alto nivel

## Out of Scope

- Rotas nao analiticas
- Mudanca de comportamento de cache
- Explicacao profunda de algoritmo

## Decisions

- Quando houver diferenca entre nomes internos e resposta publica, a doc deve deixar claro ambos
- Regras de snapshot e recalculate devem ser descritas sem inventar garantias nao implementadas

## Contracts

- Output: `.docs/api/analytics.md`
- Template: `.docs/api/_TEMPLATE.md`
- Referencias minimas: `src/app/api/analytics/**/route.ts`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual das rotas e DTOs
- Validacao dos status codes e payloads expostos hoje

## Checklist

- [ ] Documento criado em `.docs/api/analytics.md`
- [ ] Endpoints validados contra codigo real
- [ ] `.docs/CONTEXT.md` updated
- [ ] `.docs/CHANGELOG.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Este documento tende a ser o maior da camada API. Priorize tabela-resumo inicial e depois detalhe por endpoint.
