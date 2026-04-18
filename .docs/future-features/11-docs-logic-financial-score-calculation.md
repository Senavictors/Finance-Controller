# Docs - Logic Financial Score Calculation

## Objetivo

Aprofundar a documentacao do score financeiro em nivel de logica, detalhando fatores, pesos, redistribuicao e interpretacao do resultado.

## Dependencia

- [Docs - Domain Financial Score](08-docs-domain-financial-score.md)
- [Financial Score](03-financial-score.md)
- [ADR-012 Financial Score](../decisions/ADR-012-financial-score.md)

## Fontes relevantes

- `src/server/modules/finance/application/score/`
- `src/app/api/analytics/score/`

## Output esperado

- Enriquecer `.docs/domain/financial-score.md`

## Conteudo minimo

- Fatores e pesos
- Regra de redistribuicao por ausencia de dados
- Faixas de status
- Delta vs periodo anterior
- Trade-offs do modelo atual

## Fora de escopo

- Mudanca de formula
- Alteracao de API
