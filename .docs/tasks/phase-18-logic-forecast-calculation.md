# Task: Phase 18 - Logic Docs: Forecast Calculation

## Status

- [ ] Todo
- [ ] In Progress
- [x] Done

## Context

Executa a spec [Docs - Logic Forecast Calculation](../future-features/10-docs-logic-forecast-calculation.md) e depende que `phase-15-domain-forecast.md` esteja concluida.

Esta task aprofunda a documentacao existente em `.docs/domain/forecast.md` sem criar um novo modulo documental isolado.

## Objective

Enriquecer `.docs/domain/forecast.md` com a logica de calculo do forecast: entradas, ordem de composicao, projecao variavel, risco e trade-offs.

## Scope

- Explicar a sequencia do calculo
- Registrar entradas: realizado, recorrencias, faturas, projecao variavel
- Documentar media movel e limites do modelo
- Explicar classificacao de risco
- Descrever assumptions, snapshot e invalidacao relacionados

## Out of Scope

- Criar algoritmo novo
- Alterar endpoints
- Mudar thresholds sem ADR

## Decisions

- A documentacao deve refletir o algoritmo implementado, nao a intencao anterior
- Mudanca de formula ou limiar exige ADR antes de atualizar a documentacao como “verdade”

## Contracts

- Output: atualizar `.docs/domain/forecast.md`
- Referencias minimas: `ADR-011`, `src/server/modules/finance/application/forecast/`, `src/app/api/analytics/forecast/`

## Migrations

- Nenhuma

## UI

- Nenhuma

## Tests

- Revisao manual do fluxo de calculo no codigo
- Conferencia entre documentacao de dominio e implementacao atual

## Checklist

- [x] `.docs/domain/forecast.md` enriquecido com logica de calculo
- [x] Conteudo validado contra codigo real
- [x] `.docs/CONTEXT.md` updated
- [x] `.docs/CHANGELOG.md` updated
- [x] ADR created/updated (not applicable; ADR existente referenciado)
- [x] Manual validation done

## Notes for AI (next step)

Evitar repetir o documento inteiro. O objetivo aqui e aprofundar secoes de formulas, assumptions, edge cases e trade-offs.
