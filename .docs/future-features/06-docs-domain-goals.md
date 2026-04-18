# Docs - Domain Goals

## Objetivo

Formalizar o dominio de metas financeiras ja implementado no produto, documentando conceitos, estados, regras e invariantes sem entrar ainda no nivel completo de algoritmo.

## Dependencia

- [Documentation Foundation](05-docs-foundation.md)
- [Goal Engine](01-goal-engine.md)
- [ADR-010 Goal Engine](../decisions/ADR-010-goal-engine.md)

## Fontes relevantes

- `prisma/schema.prisma`
- `src/server/modules/finance/application/goals/`
- `src/app/api/goals/`

## Output esperado

- `.docs/domain/goals.md`

## Conteudo minimo

- Conceitos centrais: Goal, GoalSnapshot, metric, scopeType, period e status
- Regras de negocio e invariantes
- Relacao entre meta, periodo e escopo
- Casos de borda relevantes
- Exemplos concretos de leitura de negocio

## Fora de escopo

- Deep dive de formulas e heuristicas projetadas
- Contrato HTTP detalhado da API
