---
id: FC2-F3-03
title: Orçamento Flex em 3 baldes e watchlists
status: backlog
type: feature
phase: F3
wave: 1
owner: dominio-financeiro
depends_on: [FC2-F1-01]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [budget, ledger]
related_use_cases: []
related_adrs: [ADR-002, ADR-021, ADR-022]
---

# FC2-F3-03 — Orçamento Flex em 3 baldes e watchlists

## Contexto
Planejamento leve (spec §3, princípio 6): sem envelope obrigatório por categoria. O ADR-022 define 3 baldes: FIXED (contas e assinaturas que se repetem), NON_MONTHLY (gastos que não são mensais, como IPVA e seguro anual, provisionados por mês) e FLEX (variáveis do dia a dia). O Flex é o número que alimenta a engine Disponível (FC2-F3-02): `flex`, `gastoFlex` e a distribuição por categoria com marcador do dia. Watchlists são categorias vigiadas com limite próprio e alertas.

## Problema
O 1.x tem `Goal` com `GoalMetric.EXPENSE_LIMIT` e `GoalScopeType.CATEGORY` (`prisma/schema.prisma` e `src/server/modules/finance/application/goals/calculate-progress.ts`): um limite por categoria com status ON_TRACK/WARNING/AT_RISK, que é orçamento por envelope e por mês calendário, não um orçamento total flex por ciclo; não distingue fixo, não mensal e flex, e não tem ritmo contra o dia do ciclo. O resumo `analytics/monthly-summary.ts` soma tudo como despesa, sem separar fixas de variáveis.

## Objetivo
1. Modelar `BudgetCycle` e `BudgetLine` com os 3 baldes.
2. Engine pura `computeFlex` que devolve, para o ciclo: gasto flex total, restante, ritmo, e por categoria (gasto, percentual do flex, ritmo, status).
3. Sugerir o valor de flex a partir de renda prevista, fixas, parcelas, DAS, provisão de não mensais e colchão.
4. Watchlists: categorias vigiadas com limite próprio e alertas em 80% e 100%.
5. Use-cases e rotas finas para ler e editar o orçamento do ciclo.

## Fora de escopo
- Tela Planejar (FC2-F3-05) e Hoje (FC2-F3-04).
- Engine Disponível (FC2-F3-02) apenas consome `flexCents`, `spentFlexCents`, `cushionCents`.
- Orçamento por envelope obrigatório e rollover entre ciclos.
- Metas (FC2-F3-07).

## Comportamento atual
Ver Problema. De `calculate-progress.ts` (1.x) só se aproveita a ideia de percentual com limiares de aviso (`warningPercent` 80 e `dangerPercent` 95); o código não é reaproveitado.

## Comportamento esperado

### Modelo (FC2-F0-02 cria; conferir no schema)
- `BudgetCycle`: `id, userId, cycleStart, cycleEnd, flexCents, cushionCents, mode (CALENDAR_MONTH | INCOME_CYCLE), createdAt`. Único por `(userId, cycleStart)`.
- `BudgetLine`: `id, userId, cycleId, bucket (FIXED | NON_MONTHLY | FLEX), categoryId?, seriesId?, label, plannedCents, watch (bool), watchLimitCents?`. Linhas FIXED nascem das séries (F3-01); NON_MONTHLY guardam o valor anual em `annualCents` e a provisão mensal é `ceil(annual / 12)`; FLEX liga categorias ao balde variável.

### Contrato da engine (`src/server/modules/budget/domain/flex.ts`)
```ts
export type FlexInputTx = {
  id: string
  date: string                     // data da COMPRA (YYYY-MM-DD), nunca a do vencimento da fatura
  amountCents: number              // positivo = gasto; estornos vêm negativos
  categoryId: string | null
  excludeFromBudget: boolean
  kind: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'CARD_PAYMENT' | 'FEE' | 'INTEREST' | 'ADJUSTMENT'
}

export type FlexInput = {
  today: string
  cycle: { start: string; end: string }
  flexCents: number
  flexCategoryIds: string[]        // categorias do balde FLEX (as demais são FIXED ou NON_MONTHLY)
  watchlists: { categoryId: string; limitCents: number }[]
  transactions: FlexInputTx[]
}

export type FlexResult = {
  flexCents: number
  spentCents: number
  remainingCents: number           // flex - gasto (pode ser negativo)
  pace: number | null              // gasto / (flex * dia / dias)
  idealSpentTodayCents: number     // floor(flex * dayIndex / daysInCycle)
  byCategory: { categoryId: string | null; spentCents: number; pctOfFlex: number; pace: number | null; status: 'OK' | 'WARN' | 'OVER' }[]
  watch: { categoryId: string; spentCents: number; limitCents: number; pct: number; status: 'OK' | 'WARN' | 'OVER' }[]
}
```
Função: `computeFlex(input): FlexResult`. Sugestão: `suggestFlex({ incomeCents, fixedCents, installmentsCents, dasCents, nonMonthlyProvisionCents, cushionCents, minReserveCents })` = `max(0, income − fixed − installments − das − provisão − colchão − reserva)`.

### Gasto flex
Entra no gasto: transações `EXPENSE` na categoria FLEX (ou sem categoria, tratadas como FLEX por padrão) com data de compra dentro do ciclo e `excludeFromBudget = false`; estornos (valor negativo) reduzem. Não entram: `TRANSFER`, `CARD_PAYMENT`, `INTEREST` e `FEE` (são custo de dívida, aparecem em Planejar e relatórios), `ADJUSTMENT`, entradas, lançamentos PLANNED, e categorias FIXED e NON_MONTHLY. Compras de cartão contam pela data da compra (consumo), não pelo vencimento da fatura (caixa): é isto que separa "só flex" de "pesa no caixa".

## Regras de negócio
- RN-01: centavos inteiros; datas de calendário em strings `YYYY-MM-DD`.
- RN-02: `pace = spent / (flex * dayIndex / daysInCycle)`; `null` quando `flex = 0`; maior que 1 significa gasto adiantado em relação ao ideal linear.
- RN-03: status da categoria: `OK` até 80% do limite/proporção, `WARN` de 80% a menos de 100%, `OVER` a partir de 100%. Para `byCategory`, o limite proporcional é `flex * pctShare`, com `pctShare` o percentual histórico (padrão: sem limite por categoria, status derivado só de `pctOfFlex` acima de 40% = WARN, acima de 60% = OVER, parametrizável).
- RN-04: watchlist usa o limite próprio da categoria no ciclo; alerta em 80% (WARN) e 100% (OVER).
- RN-05: sem categoria conta como FLEX e aparece como `categoryId: null` ("Sem categoria") na distribuição.
- RN-06: provisão de NON_MONTHLY = `ceil(annualCents / 12)` por ciclo; não é gasto flex e não reduz `remainingCents`, mas entra em `suggestFlex`.
- RN-07: `excludeFromBudget` e `kind` conforme a seção Gasto flex; transferência nunca é gasto.
- RN-08: ciclo muda a janela, não a fórmula (calendário ou renda; `cycle` injetado).
- RN-09: todas as consultas por `userId`.
- RN-10: valores de exemplo fictícios.

## Critérios de aceitação
- [ ] CA-01: `computeFlex` calcula gasto, restante, ritmo e distribuição conforme os casos abaixo.
- [ ] CA-02: compra de cartão entra no gasto flex pela data da compra, mesmo com fatura vencendo no ciclo seguinte.
- [ ] CA-03: transferência, pagamento de fatura, juros, tarifas, ajustes e PLANNED nunca entram no gasto flex.
- [ ] CA-04: `suggestFlex` devolve zero (nunca negativo) quando as obrigações superam a renda.
- [ ] CA-05: watchlist alerta em 80% e 100% do limite.
- [ ] CA-06: use-cases `getBudgetCycle`, `upsertBudgetCycle`, `upsertBudgetLine`, `removeBudgetLine` filtram por `userId`.
- [ ] CA-07: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
- `src/server/modules/budget/domain/flex.ts` (+ `flex.test.ts`), `suggest-flex.ts` (+ teste), `types.ts`.
- `src/server/modules/budget/application/get-flex.ts` (monta `FlexInput` do ledger e chama `computeFlex`), `get-budget-cycle.ts`, `upsert-budget-cycle.ts`, `upsert-budget-line.ts`, `remove-budget-line.ts`.
- `src/server/modules/budget/infra/budget-repository.ts`.
- `src/server/modules/budget/http/schemas.ts` e rotas finas `src/app/api/budget/route.ts` (GET/PUT do ciclo), `src/app/api/budget/lines/route.ts` e `src/app/api/budget/lines/[id]/route.ts`, `src/app/api/budget/flex/route.ts` (GET `FlexResult`).
### Frontend
Nenhum.
### Banco de dados
`BudgetCycle` e `BudgetLine` (FC2-F0-02). Conferir campos `annualCents`, `watch`, `watchLimitCents`; migration aditiva se faltarem. Índices `@@unique([userId, cycleStart])` e `@@index([userId, cycleId])`.
### Integrações
Nenhuma.
### Segurança
`requireAuth`; validação Zod; `userId` em todas as consultas.

## Plano de implementação
- [ ] Etapa 1: tipos e `computeFlex` com testes.
- [ ] Etapa 2: `suggestFlex` com testes.
- [ ] Etapa 3: repositório e use-cases do ciclo e das linhas.
- [ ] Etapa 4: `get-flex` (carrega transações do ciclo por data de compra) com testes de integração.
- [ ] Etapa 5: rotas finas e schemas.
- [ ] Etapa 6: `docs/domain/flex.md` e `.agents/context/CONTEXT.md`.

## Estratégia de testes
Ciclo de 30 dias, `today` no dia 10 do ciclo (`dayIndex = 10`), `flex = 90000` (R$ 900,00).
- [ ] Unitários: gasto 40000 em Delivery (20000), Mercado (15000) e sem categoria (5000): `spent = 40000`, `remaining = 50000`, `idealSpentToday = 30000`, `pace = 1,3333`, `pctOfFlex` 22,2%, 16,7%, 5,6%. Gasto zero: `pace = 0`. `flex = 0`: `pace = null` e `remaining` negativo igual ao gasto.
- [ ] Unitários, exclusões: uma de cada `kind` (TRANSFER, CARD_PAYMENT, INTEREST, FEE, ADJUSTMENT, INCOME), uma PLANNED e uma com `excludeFromBudget` não somam; estorno de R$ 30,00 em uma categoria reduz o gasto.
- [ ] Unitários, data de compra: compra de cartão em 2026-10-02 com fatura vencendo 2026-11-05 e ciclo 2026-10-01 a 2026-10-31 entra no ciclo de outubro; compra em 2026-11-01 não entra.
- [ ] Unitários, `suggestFlex`: renda 600000, fixas 250000, parcelas 80000, DAS 8000, provisão 15000, colchão 20000, reserva 30000: `flex = 197000`; obrigações maiores que a renda: `0`.
- [ ] Unitários, watchlist: limite 20000: gasto 15999 = OK; 16000 = WARN (80%); 20000 = OVER; 25000 = OVER com `pct = 125`.
- [ ] Unitários, provisão: anual 120000 gera 10000 por ciclo; anual 100001 gera `ceil = 8334`.
- [ ] Integração: `get-flex` com dados sintéticos de `tests/fixtures/`; isolamento por `userId`; categorias do balde FLEX versus FIXED.
- [ ] E2E: não aplicável.
- [ ] Manual: conferir `GET /api/budget/flex` com os dados de teste.

Edge cases: categoria apagada (cai em "Sem categoria"); ciclo sem transações; primeiro dia do ciclo (`dayIndex = 1`); ciclo de 28/29/31 dias; troca de modo calendário/renda no meio do ciclo (recalcula a janela, não perde transações).

## Riscos e rollback
- Risco: classificar mal categorias entre baldes distorce o flex. Mitigação: padrão FLEX para o que não é explicitamente FIXED/NON_MONTHLY e tela de ajuste na F3-05.
- Risco: confusão entre gasto por compra (flex) e por vencimento (caixa). Mitigação: regra RN documentada, teste CA-02 e texto na UI (F2-04, F3-04).
- Rollback: tabelas aditivas; reverter o commit remove a engine sem tocar o ledger.

## Registro de execução
### Alterações realizadas
### Arquivos principais
### Decisões
### Divergências
### Pendências

## Validação
Comandos e resultados.

## Handoff
Link para o handoff ativo, quando aplicável.
