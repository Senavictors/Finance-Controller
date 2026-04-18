# Task: Phase 15 - Domain Docs: Forecast

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

Executa a spec [Docs - Domain Forecast](../future-features/07-docs-domain-forecast.md) e continua a fase de documentacao de dominio sobre a camada analitica.

Depende da foundation da fase 13 e deve usar como fonte principal o [Forecast Engine](../future-features/02-forecast-engine.md) e o [ADR-011](../decisions/ADR-011-forecast-engine.md).

## Objective

Criar `.docs/domain/forecast.md` explicando o dominio de previsao mensal do sistema, seus estados, snapshots, premissas e interpretacao de negocio.

## Scope

- Definir o que o produto entende por forecast
- Documentar `ForecastSnapshot` e seu papel
- Explicar risco `LOW`, `MEDIUM` e `HIGH`
- Registrar entradas e saidas de negocio em alto nivel
- Cobrir edge cases relevantes

## Out of Scope

- Formula detalhada da projecao
- Contrato HTTP da API de forecast
- Alteracoes de implementacao

## Decisions

- A documentacao deve separar claramente dominio de forecast e logica de calculo
- Mudancas de algoritmo so podem entrar depois via ADR, se necessario

## Contracts

- Output: `.docs/domain/forecast.md`
- Template: `.docs/domain/_TEMPLATE.md`
- Referencias minimas: `ADR-011`, `prisma/schema.prisma`, `src/server/modules/finance/application/forecast/`, `src/app/api/analytics/forecast/`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual contra snapshot, API e implementacao server-side
- Validacao terminologica com enums e nomenclaturas do produto

## Checklist

- [x] Documento criado em `.docs/domain/forecast.md`
- [x] Conteudo validado contra codigo real
- [x] `.docs/CONTEXT.md` updated
- [x] `.docs/CHANGELOG.md` updated
- [x] ADR created/updated (not applicable; ADR existente referenciado)
- [x] Manual validation done

## Notes for AI (next step)

Nao entrar ainda no calculo detalhado; isso pertence a `phase-18-logic-forecast-calculation.md`.
