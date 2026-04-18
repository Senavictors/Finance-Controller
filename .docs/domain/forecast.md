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
- a sequencia de composicao usada pelo algoritmo atual
- as entradas de realizado, recorrencias, historico variavel e faturas
- a heuristica de media movel para despesas variaveis
- os trade-offs operacionais do modelo atual
- limites e edge cases conhecidos da implementacao atual

Este documento nao cobre o contrato HTTP detalhado do modulo nem propostas de evolucao do algoritmo alem do que ja esta implementado.

## Sources of Truth

- Spec:
  - [Docs - Domain Forecast](../future-features/07-docs-domain-forecast.md)
  - [Docs - Logic Forecast Calculation](../future-features/10-docs-logic-forecast-calculation.md)
- Task:
  - [Phase 15 - Domain Docs: Forecast](../tasks/phase-15-domain-forecast.md)
  - [Phase 18 - Logic Docs: Forecast Calculation](../tasks/phase-18-logic-forecast-calculation.md)
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
| Variable expense projection | Heuristica de despesas variaveis futuras | Historico recente e dias restantes do periodo | `projectedVariableExpenses` | Formula detalhada nas secoes abaixo |
| Variable income projection | Valor fixo atual | Nenhum | `projectedVariableIncome = 0` | Limitacao conhecida do MVP |
| Predicted balance | `actualIncome + recurringIncome + variableIncome - actualExpenses - recurringExpenses - variableExpenses` | Componentes do forecast | `predictedBalance` | Faturas aparecem em `assumptions`, nao como parcela extra do saldo |
| Risk classification | Comparacao de `predictedBalance` contra `0` e `50_000` | Saldo previsto | `riskLevel` | `HIGH < 0`, `MEDIUM < 50_000`, senao `LOW` |

## Calculation Inputs

| Input | Source | Filter | Used For | Notes |
| ----- | ------ | ------ | -------- | ----- |
| Period anchors | `resolveMonthPeriod(monthParam, now)` | `monthParam` valido ou fallback para o mes de `now` | `periodStart`, `periodEnd` | A janela e sempre mensal |
| Reference date | `clampReferenceToPeriod(periodStart, periodEnd, now)` | Nunca sai do periodo | Corte entre realizado e futuro | Se `now` estiver fora da janela, o valor e truncado |
| Actual transactions | `prisma.transaction.findMany` | `userId`, `type in (INCOME, EXPENSE)`, `date >= periodStart`, `date <= referenceDate` | `actualIncome`, `actualExpenses` | O corte e por timestamp, nao apenas por dia |
| Historical expenses | `prisma.transaction.findMany` | `userId`, `type = EXPENSE`, janela de 2 meses completos antes do periodo | `projectedVariableExpenses` | Usa todo gasto historico, sem separar fixo vs variavel |
| Active recurring rules | `prisma.recurringRule.findMany` | `userId`, `isActive = true` | `projectedRecurringIncome`, `projectedRecurringExpenses` | Regras `TRANSFER` sao carregadas, mas nao entram na soma final |
| Open statements | `prisma.creditCardStatement.findMany` | `userId`, `status != PAID`, `dueDate` dentro do periodo | `assumptions` do tipo `statement` | Nao alteram `predictedBalance` |

## Calculation Sequence

1. O sistema resolve o periodo mensal e define `referenceDate` como `now` truncado entre `periodStart` e `periodEnd`.
2. Quatro leituras sao feitas em paralelo: transacoes realizadas do periodo, historico de despesas dos 2 meses anteriores, recorrencias ativas e faturas em aberto com vencimento no periodo.
3. O realizado e agregado primeiro: receitas e despesas viram `actualIncome` e `actualExpenses`, e duas premissas base sempre sao adicionadas em `assumptions`.
4. Cada recorrencia ativa passa por `listProjectedRecurringDates`, que enumera somente datas estritamente posteriores a `referenceDate`; o total projetado e `rule.amount * dates.length`.
5. A projecao variavel e calculada a partir da media diaria de despesa do historico recente e multiplicada pelos dias restantes do periodo.
6. Faturas em aberto sao anexadas como premissas explicativas, uma por statement, usando o valor pendente `max(totalAmount - paidAmount, 0)`.
7. O saldo previsto e composto apenas pelas componentes numericas do forecast; depois disso o risco e classificado e o DTO final e devolvido.

### Assumption Ordering

A ordem atual de `assumptions` e deterministica e segue a composicao do calculo:

1. `Receitas realizadas`
2. `Despesas realizadas`
3. `Receitas recorrentes futuras` se maior que zero
4. `Despesas recorrentes futuras` se maior que zero
5. `Despesas variaveis projetadas (media de 2 meses)` se maior que zero
6. Uma entrada `statement` por fatura em aberto dentro do periodo

O array nao e reordenado por valor nem por severidade. Isso significa que a UI decide quanto mostrar, mas a trilha de montagem continua previsivel para debug e auditoria.

## Moving Average and Variable Projection

O forecast atual usa uma heuristica unica para despesas variaveis:

- `historicalStart` = primeiro dia do mes que fica 2 meses antes de `periodStart`
- `historicalEnd` = ultimo instante do mes imediatamente anterior ao periodo consultado
- `historicalDays` = numero de dias corridos entre `historicalStart` e `historicalEnd`, de forma inclusiva
- `dailyVariableAvg` = `historicalTotalExpense / historicalDays`
- `remainingDays` = `max(0, ceil((periodEnd - referenceDate) / MS_PER_DAY))`
- `projectedVariableExpenses` = `round(dailyVariableAvg * remainingDays)`

Implicacoes praticas da implementacao:

- a janela historica ignora o mes corrente e usa exatamente 2 meses calendario completos
- toda transacao `EXPENSE` historica entra na media, inclusive gastos recorrentes ou despesas pontuais atipicas
- `remainingDays` usa `ceil`, entao um dia parcialmente transcorrido ainda conta como 1 dia restante para a projecao variavel
- se nao houver historico de despesas, a media cai para zero e a projecao variavel desaparece
- `projectedVariableIncome` permanece sempre `0`, entao o modelo tem vies conservador para usuarios com renda irregular

## Risk Classification Logic

O risco do forecast e totalmente derivado de `predictedBalance`:

| Condition | Risk | Interpretation |
| --------- | ---- | -------------- |
| `< 0` | `HIGH` | O mes tende a fechar negativo |
| `>= 0` e `< 50_000` | `MEDIUM` | O mes fecha positivo, mas com folga menor que R$ 500 |
| `>= 50_000` | `LOW` | O mes fecha com folga igual ou superior a R$ 500 |

Nao existe ajuste por perfil do usuario, categoria, limite de conta ou volatilidade. Qualquer mudanca nesses thresholds exige alinhamento de produto e ADR.

## Invariants

- Todo snapshot de forecast pertence a um unico usuario.
- So pode existir um `ForecastSnapshot` por `userId` e `periodStart`.
- O forecast sempre devolve `periodStart`, `periodEnd` e `referenceDate`.
- `riskLevel` sempre pertence ao enum `LOW`, `MEDIUM` ou `HIGH`.
- `assumptions` sempre e uma colecao ordenada de premissas explicativas do resultado, montada na mesma ordem do calculo.
- `predictedBalance` e derivado dos componentes do forecast, nao de uma fonte separada.
- `staleAt` existe no snapshot como hint de invalidação futura, sem ser obrigatorio no fluxo atual de leitura.

## Edge Cases

- Se `now` for anterior ao inicio do periodo consultado, a `referenceDate` vira `periodStart`.
- Se `now` for posterior ao fim do periodo, a `referenceDate` vira `periodEnd`.
- Se `monthParam` vier invalido, `resolveMonthPeriod` faz fallback silencioso para o mes atual em vez de falhar.
- Se nao houver historico recente de despesa, a projecao variavel tende a zero.
- Se uma recorrencia ja passou no periodo, ela nao entra na projecao futura.
- Se a recorrencia cair no mesmo dia calendario da `referenceDate`, ela tambem nao entra; a projecao so olha para o proximo dia em diante.
- Regras mensais em dias inexistentes no mes, como dia 31 em abril, simplesmente nao geram datas projetadas naquele periodo.
- Se uma fatura em aberto estiver totalmente paga, ela nao entra nas premissas.
- O saldo previsto pode ser positivo mesmo com varias premissas de fatura, porque elas sao exibidas para transparencia e nao como nova deducao no saldo.
- Como a renda variavel projetada hoje e zero, usuarios com renda altamente irregular podem ter forecast conservador.
- Como o historico de despesa nao exclui outliers, um gasto muito alto nos 2 meses anteriores pode inflar a projecao variavel do mes atual.

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
  - `GET /api/analytics/forecast` nao le de `ForecastSnapshot`; ele recalcula sempre
  - as invalidacoes do modulo `forecast` ja existem na camada analitica compartilhada para mutacoes de `transaction`, `transfer`, `recurringRule`, `account`, `category`, `creditCardPayment` e `fullRebuild`
  - invalidacao de cache nao recalcula snapshot automaticamente; o refresh persistido depende de fluxos que chamam `refreshForecastSnapshot`
- Failure or fallback behavior:
  - ausencia de transacoes, recorrencias ou faturas nao gera erro; apenas reduz as componentes do forecast
  - ausencia de historico recente derruba a projecao variavel para zero
  - falhas de autenticacao na camada HTTP impedem acesso ao forecast

## Trade-offs and Known Limits

- O modelo privilegia explicabilidade sobre sofisticacao estatistica; por isso usa media diaria simples em vez de sazonalidade, categorias ou pesos por tipo de gasto.
- Faturas sao visiveis como compromisso futuro, mas nao alteram o saldo previsto diretamente para evitar dupla contagem com transacoes ja refletidas no realizado ou nas recorrencias.
- A projecao recorrente opera por enumeracao diaria, o que simplifica o raciocinio e preserva clareza, mas depende dos parametros de frequencia estarem bem preenchidos.
- Como o corte de realizado usa timestamp e a projecao variavel usa dias restantes arredondados para cima, o forecast mistura precisao temporal no passado com granularidade diaria no futuro.
- O snapshot persistido hoje serve mais como trilha auditavel e base para evolucoes futuras do que como cache efetivo da rota de leitura.

## Related Decisions

- ADR: [ADR-011 Forecast Engine](../decisions/ADR-011-forecast-engine.md)

## Open Questions

- O limiar fixo de R$ 500 para `MEDIUM` deve virar configuracao por usuario no futuro?
- O dominio deve passar a projetar receita variavel, ou manter o viés conservador do MVP?
- `ForecastSnapshot` deve se tornar base de leitura historica comparativa dentro da UI, alem da funcao atual de persistencia auditavel?
