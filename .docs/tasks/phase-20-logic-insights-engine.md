# Task: Phase 20 - Logic Docs: Insights Engine

## Status

- [x] Todo
- [ ] In Progress
- [ ] Done

## Context

Executa a spec [Docs - Logic Insights Engine](../future-features/12-docs-logic-insights-engine.md) e depende de `phase-17-domain-insights.md`.

O objetivo e aprofundar a documentacao existente em `.docs/domain/insights.md`.

## Objective

Documentar o pipeline tecnico do motor de insights: metricas, heuristicas, dedupe, cap, dismiss e persistencia.

## Scope

- Explicar a construcao das metricas base
- Registrar as heuristicas MVP atuais
- Documentar dedupe por fingerprint e cap por periodo
- Explicar preservacao de dismiss entre recalculos
- Cobrir limites e trade-offs do engine

## Out of Scope

- Criacao de novas heuristicas
- Mudanca de severidade ou cap sem ADR
- Alteracoes de API

## Decisions

- O documento deve separar metricas de entrada, regras de engine e efeitos de persistencia
- Ajustes de heuristica ou dedupe podem demandar ADR

## Contracts

- Output: atualizar `.docs/domain/insights.md`
- Referencias minimas: `ADR-013`, `src/server/modules/finance/application/insights/`, `src/app/api/analytics/insights/`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual do engine e dos testes da feature
- Validacao de que a doc cobre todas as heuristicas implementadas hoje

## Checklist

- [ ] `.docs/domain/insights.md` enriquecido com logica detalhada
- [ ] Conteudo validado contra codigo real
- [ ] `.docs/CONTEXT.md` updated
- [ ] `.docs/CHANGELOG.md` updated
- [ ] ADR created/updated (if applicable)
- [ ] Manual validation done

## Notes for AI (next step)

Depois da fase 20, a proxima etapa recomendada e a formalizacao de contratos HTTP nas fases 21, 22 e 23.
