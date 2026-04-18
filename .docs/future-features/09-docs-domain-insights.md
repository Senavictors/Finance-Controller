# Docs - Domain Insights

## Objetivo

Formalizar o dominio de insights automaticos, descrevendo tipos de insight, severidade, dedupe, dismiss e regras de permanencia.

## Dependencia

- [Documentation Foundation](05-docs-foundation.md)
- [Automatic Insights](04-automatic-insights.md)
- [ADR-013 Automatic Insights](../decisions/ADR-013-automatic-insights.md)

## Fontes relevantes

- `prisma/schema.prisma`
- `src/server/modules/finance/application/insights/`
- `src/app/api/analytics/insights/`

## Output esperado

- `.docs/domain/insights.md`

## Conteudo minimo

- Conceito de insight automatico
- Tipos e severidade
- Regras de dedupe e dismiss
- Relacao com periodo e fingerprint
- Casos de borda e limites operacionais

## Fora de escopo

- Heuristicas detalhadas de calculo
- Contrato HTTP detalhado
