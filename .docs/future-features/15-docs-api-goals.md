# Docs - API Goals

## Objetivo

Formalizar o contrato da API de metas, cobrindo operacoes de listagem, criacao, atualizacao e remocao.

## Dependencia

- [Documentation Foundation](05-docs-foundation.md)
- [Docs - Domain Goals](06-docs-domain-goals.md)
- [ADR-010 Goal Engine](../decisions/ADR-010-goal-engine.md)

## Fontes relevantes

- `src/app/api/goals/route.ts`
- `src/app/api/goals/[id]/route.ts`

## Output esperado

- `.docs/api/goals.md`

## Conteudo minimo

- Endpoints e metodos
- Request e response
- Validacoes de payload
- Regras de ownership e status codes
- Efeitos colaterais relevantes

## Fora de escopo

- Novos endpoints de progresso
- Mudanca do comportamento atual
