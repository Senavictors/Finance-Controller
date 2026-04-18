# Docs - Logic Insights Engine

## Objetivo

Aprofundar a documentacao do motor de insights em nivel de logica, explicando metricas de entrada, heuristicas, dedupe e persistencia.

## Dependencia

- [Docs - Domain Insights](09-docs-domain-insights.md)
- [Automatic Insights](04-automatic-insights.md)
- [ADR-013 Automatic Insights](../decisions/ADR-013-automatic-insights.md)

## Fontes relevantes

- `src/server/modules/finance/application/insights/`
- `src/app/api/analytics/insights/`

## Output esperado

- Enriquecer `.docs/domain/insights.md`

## Conteudo minimo

- Pipeline de metricas
- Heuristicas MVP atuais
- Regras de fingerprint, dedupe e cap
- Preservacao de dismiss
- Trade-offs e limites do motor

## Fora de escopo

- Criacao de novas regras
- Mudanca do contrato HTTP
