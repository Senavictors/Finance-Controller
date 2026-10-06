# Docs - API Analytics

## Objetivo

Formalizar o contrato da API de analytics, cobrindo summary, forecast, score e insights.

## Dependencia

- [Documentation Foundation](05-docs-foundation.md)
- Domain docs e logic docs das capacidades analiticas

## Fontes relevantes

- `src/app/api/analytics/summary/route.ts`
- `src/app/api/analytics/forecast/route.ts`
- `src/app/api/analytics/forecast/recalculate/route.ts`
- `src/app/api/analytics/score/route.ts`
- `src/app/api/analytics/score/history/route.ts`
- `src/app/api/analytics/insights/route.ts`
- `src/app/api/analytics/insights/recalculate/route.ts`
- `src/app/api/analytics/insights/[id]/dismiss/route.ts`

## Output esperado

- `.docs/api/analytics.md`

## Conteudo minimo

- Endpoints e finalidades
- Parametros, responses e erros
- Regras de cache, snapshot e recalculo
- Dismiss e efeitos colaterais

## Fora de escopo

- Mudancas de comportamento da API
- Cobertura de outros modulos nao analiticos
