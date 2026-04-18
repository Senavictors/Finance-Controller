# Forecast

## Status

- [ ] Draft
- [ ] In Review
- [x] Approved

## Purpose

Formalizar o dominio de previsao financeira mensal do Finance Controller, explicando o que o produto considera forecast, como o risco e interpretado, qual o papel de `ForecastSnapshot` e como as premissas aparecem para o usuario.

## Scope

Este documento cobre:

- o agregado `ForecastSnapshot`
- o resultado derivado `ForecastResult`
- o conceito de `referenceDate`
- os niveis de risco `LOW`, `MEDIUM` e `HIGH`
- as premissas que sustentam a leitura do forecast
- limites e edge cases conhecidos da implementacao atual

Este documento nao cobre o contrato HTTP detalhado nem o deep dive completo do algoritmo de projecao; isso pertence a fases posteriores do backlog documental.

## Sources of Truth

- Spec: [Docs - Domain Forecast](../future-features/07-docs-domain-forecast.md)
- Task: [Phase 15 - Domain Docs: Forecast](../tasks/phase-15-domain-forecast.md)
- ADRs: [ADR-011 Forecast Engine](../decisions/ADR-011-forecast-engine.md)
- Code:
  - `prisma/schema.prisma`
  - `src/server/modules/finance/application/forecast/calculate-forecast.ts`
  - `src/server/modules/finance/application/forecast/project-recurrences.ts`
  - `src/server/modules/finance/application/forecast/types.ts`
- APIs:
  - `src/app/api/analytics/forecast/route.ts`
  - `src/app/api/analytics/forecast/recalculate/route.ts`

## Business Context

O forecast existe para responder uma pergunta operacional central do produto:

> se o usuario continuar no ritmo atual, como tende a terminar o mes?

O modulo nao tenta adivinhar o futuro com modelos opacos. Em vez disso, ele monta uma previsao explicavel a partir de:

- realizado no periodo
- compromissos recorrentes ainda nao materializados
- projecao variavel simples
- compromissos de fatura visiveis no periodo

O objetivo do dominio nao e prometer certeza, mas oferecer leitura de tendencia com trilha auditavel. Isso torna o forecast util para dashboard, score, insights e futuras comparacoes historicas.

## Core Concepts

| Concept | Description | Notes |
| ------- | ----------- | ----- |
| Forecast | Leitura prevista do fechamento financeiro do mes | Sempre orientado a um periodo mensal |
| Reference date | Data a partir da qual o sistema considera o que ja aconteceu e o que ainda falta acontecer | E truncada ao periodo observado |
| Actual values | Valores ja realizados no periodo ate a `referenceDate` | Consideram apenas `INCOME` e `EXPENSE` |
| Recurring projection | Projecao de recorrencias futuras ainda nao ocorridas no periodo | Evita dupla contagem do mesmo dia ja realizado |
| Variable projection | Heuristica para despesas variaveis futuras | Hoje existe apenas para despesas; renda variavel permanece zero |
| Forecast assumption | Item explicativo usado para justificar o numero final | Cada item tem `label`, `amount` e `kind` |
| Predicted balance | Saldo previsto no fechamento do periodo | E a principal saida do dominio |
| Risk level | Classificacao qualitativa do forecast | `LOW`, `MEDIUM` ou `HIGH` |

## Types and Entities

| Item | Kind | Description | Notes |
| ---- | ---- | ----------- | ----- |
| `ForecastSnapshot` | Prisma model | Snapshot persistido da previsao por usuario e periodo | `@@unique([userId, periodStart])` |
| `ForecastRiskLevel` | Enum | Nivel de risco do fechamento previsto | `LOW`, `MEDIUM`, `HIGH` |
| `ForecastResult` | Application DTO | Resultado calculado do forecast | E o shape consumido pela UI e pela API |
| `ForecastAssumption` | Application type | Premissa individual mostrada ao usuario | `kind = actual | recurring | variable | statement` |

## States

| State | Meaning | Entry Condition | Exit Condition |
| ----- | ------- | --------------- | -------------- |
| `LOW` | Fechamento previsto com folga financeira razoavel | `predictedBalance >= 50_000` | Pode cair para `MEDIUM` ou `HIGH` se o saldo previsto diminuir |
| `MEDIUM` | Fechamento previsto positivo, mas com folga pequena | `predictedBalance >= 0` e `< 50_000` | Pode subir para `LOW` ou cair para `HIGH` |
| `HIGH` | Fechamento previsto negativo | `predictedBalance < 0` | Sai desse estado quando a previsao volta a zero ou positiva |

## Business Rules

1. O forecast e sempre calculado no contexto de um unico `userId`.
2. O periodo observado hoje e mensal; o modulo usa `resolveMonthPeriod` como definicao de janela.
3. A `referenceDate` nunca fica fora do periodo da previsao; se `now` estiver fora da janela, ela e truncada para o inicio ou fim do periodo.
4. O realizado considera apenas transacoes `INCOME` e `EXPENSE`; `TRANSFER` fica fora do dominio do forecast.
5. Recorrencias projetadas so contam datas estritamente posteriores a `referenceDate`.
6. Regras recorrentes respeitam `startDate`, `endDate`, frequencia e parametros como `dayOfMonth` e `dayOfWeek`.
7. O forecast atual projeta despesa variavel, mas nao projeta receita variavel; `projectedVariableIncome` permanece zero.
8. Faturas em aberto aparecem como premissas explicativas do forecast quando vencem no periodo, mas nao sao somadas separadamente no `predictedBalance`.
9. O risco e derivado apenas do `predictedBalance`, nao de outros fatores qualitativos.
10. O limiar de risco medio atual e fixo em `50_000` centavos (R$ 500), tratado como default de produto do MVP.
11. `GET /api/analytics/forecast` calcula on-demand; a persistencia em `ForecastSnapshot` acontece quando o fluxo chama `refreshForecastSnapshot`.

## Formulas and Calculations

| Name | Formula or Logic | Inputs | Output | Notes |
| ---- | ---------------- | ------ | ------ | ----- |
| Actual income | Soma das receitas realizadas ate a `referenceDate` | Transacoes `INCOME` do periodo | `actualIncome` | Observa apenas o que ja aconteceu |
| Actual expenses | Soma das despesas realizadas ate a `referenceDate` | Transacoes `EXPENSE` do periodo | `actualExpenses` | Observa apenas o que ja aconteceu |
| Recurring income projection | Soma das recorrencias futuras de receita ainda nao realizadas | Regras ativas e datas projetadas restantes | `projectedRecurringIncome` | Nao inclui datas <= `referenceDate` |
| Recurring expense projection | Soma das recorrencias futuras de despesa ainda nao realizadas | Regras ativas e datas projetadas restantes | `projectedRecurringExpenses` | Nao inclui datas <= `referenceDate` |
| Variable expense projection | Heuristica de despesas variaveis futuras | Historico recente e dias restantes do periodo | `projectedVariableExpenses` | Detalhamento fino fica para a phase 18 |
| Variable income projection | Valor fixo atual | Nenhum | `projectedVariableIncome = 0` | Limitacao conhecida do MVP |
| Predicted balance | `actualIncome + recurringIncome + variableIncome - actualExpenses - recurringExpenses - variableExpenses` | Componentes do forecast | `predictedBalance` | Faturas aparecem em `assumptions`, nao como parcela extra do saldo |
| Risk classification | Comparacao de `predictedBalance` contra `0` e `50_000` | Saldo previsto | `riskLevel` | `HIGH < 0`, `MEDIUM < 50_000`, senao `LOW` |

## Invariants

- Todo snapshot de forecast pertence a um unico usuario.
- So pode existir um `ForecastSnapshot` por `userId` e `periodStart`.
- O forecast sempre devolve `periodStart`, `periodEnd` e `referenceDate`.
- `riskLevel` sempre pertence ao enum `LOW`, `MEDIUM` ou `HIGH`.
- `assumptions` sempre e uma colecao ordenada de premissas explicativas do resultado.
- `predictedBalance` e derivado dos componentes do forecast, nao de uma fonte separada.
- `staleAt` existe no snapshot como hint de invalidação futura, sem ser obrigatorio no fluxo atual de leitura.

## Edge Cases

- Se `now` for anterior ao inicio do periodo consultado, a `referenceDate` vira `periodStart`.
- Se `now` for posterior ao fim do periodo, a `referenceDate` vira `periodEnd`.
- Se nao houver historico recente de despesa, a projecao variavel tende a zero.
- Se uma recorrencia ja passou no periodo, ela nao entra na projecao futura.
- Se uma fatura em aberto estiver totalmente paga, ela nao entra nas premissas.
- O saldo previsto pode ser positivo mesmo com varias premissas de fatura, porque elas sao exibidas para transparencia e nao como nova deducao no saldo.
- Como a renda variavel projetada hoje e zero, usuarios com renda altamente irregular podem ter forecast conservador.

## Examples

### Example 1 - Forecast com folga confortavel

- Input:
  - `actualIncome = 300000`
  - `actualExpenses = 180000`
  - `projectedRecurringIncome = 50000`
  - `projectedRecurringExpenses = 40000`
  - `projectedVariableExpenses = 20000`
- Expected result:
  - `predictedBalance = 110000`
  - `riskLevel = LOW`
- Notes:
  - o usuario tende a fechar o mes com folga acima da reserva minima implicita

### Example 2 - Forecast positivo, mas apertado

- Input:
  - `predictedBalance = 25000`
- Expected result:
  - `riskLevel = MEDIUM`
- Notes:
  - o modulo entende que o usuario ainda fecha no azul, mas com baixa margem de seguranca

### Example 3 - Forecast negativo

- Input:
  - realizado e projecoes combinados resultam em `predictedBalance = -60000`
- Expected result:
  - `riskLevel = HIGH`
- Notes:
  - esse estado pode alimentar insights como `forecast_negative`

## Operational Notes

- Multi-tenant considerations:
  - toda leitura e persistencia filtra por `userId`
  - snapshots e premissas pertencem ao contexto de um unico usuario
- Snapshot or cache implications:
  - `calculateForecast` calcula on-demand sem persistir
  - `refreshForecastSnapshot` persiste via upsert e limpa `staleAt`
  - invalidacoes do modulo `forecast` ja existem na camada analitica compartilhada
- Failure or fallback behavior:
  - ausencia de transacoes, recorrencias ou faturas nao gera erro; apenas reduz as componentes do forecast
  - ausencia de historico recente derruba a projecao variavel para zero
  - falhas de autenticacao na camada HTTP impedem acesso ao forecast

## Related Decisions

- ADR: [ADR-011 Forecast Engine](../decisions/ADR-011-forecast-engine.md)

## Open Questions

- O limiar fixo de R$ 500 para `MEDIUM` deve virar configuracao por usuario no futuro?
- O dominio deve passar a projetar receita variavel, ou manter o viés conservador do MVP?
- `ForecastSnapshot` deve se tornar base de leitura historica comparativa dentro da UI, alem da funcao atual de persistencia auditavel?
