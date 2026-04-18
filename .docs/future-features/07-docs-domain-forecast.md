# Docs - Domain Forecast

## Objetivo

Formalizar o dominio da previsao financeira mensal, deixando claro o que o sistema entende por forecast, risco, premissas e snapshot.

## Dependencia

- [Documentation Foundation](05-docs-foundation.md)
- [Forecast Engine](02-forecast-engine.md)
- [ADR-011 Forecast Engine](../decisions/ADR-011-forecast-engine.md)

## Fontes relevantes

- `prisma/schema.prisma`
- `src/server/modules/finance/application/forecast/`
- `src/app/api/analytics/forecast/`

## Output esperado

- `.docs/domain/forecast.md`

## Conteudo minimo

- Conceito de forecast mensal
- Papel de `ForecastSnapshot`
- Significado dos niveis de risco
- Premissas, entradas e saidas de negocio
- Casos de borda e limites conhecidos

## Fora de escopo

- Formula detalhada da projecao
- Contrato HTTP detalhado
