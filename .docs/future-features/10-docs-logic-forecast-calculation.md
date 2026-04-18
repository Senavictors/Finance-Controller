# Docs - Logic Forecast Calculation

## Objetivo

Aprofundar a documentacao do forecast em nivel de logica de calculo, explicando como o sistema combina realizado, recorrencias, projecao variavel e faturas.

## Dependencia

- [Docs - Domain Forecast](07-docs-domain-forecast.md)
- [Forecast Engine](02-forecast-engine.md)
- [ADR-011 Forecast Engine](../decisions/ADR-011-forecast-engine.md)

## Fontes relevantes

- `src/server/modules/finance/application/forecast/`
- `src/server/modules/finance/application/analytics/`
- `src/app/api/analytics/forecast/`

## Output esperado

- Enriquecer `.docs/domain/forecast.md`

## Conteudo minimo

- Entradas do calculo
- Sequencia de composicao do forecast
- Media movel e suas restricoes
- Classificacao de risco
- Trade-offs e limites do algoritmo atual

## Fora de escopo

- Mudanca no algoritmo
- Nova API
