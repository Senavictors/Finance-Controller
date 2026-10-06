---
id: FC2-F3-02
title: Engine Disponível (ciclo de renda, caixa, flex, ritmo, modo Aperto, série de caixa)
status: backlog
type: feature
phase: F3
wave: 2
owner: dominio-financeiro
depends_on: [FC2-F3-01, FC2-F1-05, FC2-F1-06]
created_at: 2026-10-05
updated_at: 2026-10-05
affected_modules: [budget, ledger, cards, debts, income, recurring]
related_use_cases: []
related_adrs: [ADR-002, ADR-019, ADR-021, ADR-022, ADR-028, ADR-029]
---

# FC2-F3-02 — Engine Disponível (ciclo de renda, caixa, flex, ritmo, modo Aperto, série de caixa)

## Contexto
A pergunta central do produto é "quanto posso gastar?" respondida em 2 segundos (spec §3). A engine Disponível (ADR-021) transforma saldos, limites, previstos, faturas e o orçamento flex em: modo (Normal ou Aperto), livre para gastar, R$ por dia, ritmo, quanto falta até a renda e a série diária de caixa para o gráfico. É uma função pura, sem Prisma, alimentada por um use-case que monta a entrada.

## Problema
No 1.x a visão mais próxima é a previsão de `src/server/modules/finance/application/forecast/calculate-forecast.ts` (`calculateForecast`): projeta receita menos despesa do mês, com risco por faixa (`classifyRisk`: negativo = HIGH, menor que R$ 500,00 = MEDIUM), e o resumo `src/server/modules/finance/application/analytics/monthly-summary.ts` soma só `INCOME` e `EXPENSE` do mês e ignora transferências e saldo real. Resultado (spec §1): não responde "quanto posso gastar", tem dupla contagem, trata saldo negativo como erro e não conhece cheque especial, faturas por vencimento nem ciclo de renda. A previsão do 1.x também depende de `listProjectedRecurringDates` (bug de dia 29/30/31, ver FC2-F3-01). Nada disso é reaproveitado.

## Objetivo
Implementar exatamente as fórmulas da spec §5.1:

```text
caixaFimCiclo = Σ saldo(contas)
              + Σ entradas previstas (renda, reembolsos)
              − Σ faturas que vencem no ciclo
              − Σ fixas/DAS/parcelas pendentes (inclui atrasadas)

livre  = min(flex − gastoFlex, caixaFimCiclo − colchão)
porDia = livre ÷ dias restantes
ritmo  = gastoFlex ÷ (flex × diaAtual ÷ diasNoCiclo)

devidoAntes     = Σ itens com vencimento < dataRenda
disponivelAgora = Σ saldo(contas) + Σ limite(cheque especial)
falta  = max(0, devidoAntes − max(0, disponivelAgora)) + max(0, −disponivelAgora)
aperto = rendaPendente ∧ falta > 0
```
mais ciclo de renda configurável, modo Aperto, série diária de caixa com faixa do limite e classificação de estado (calm, tense, hot) para a aura da tela Hoje.

## Fora de escopo
- Telas (FC2-F3-04 Hoje, FC2-F3-05 Planejar).
- Cálculo do orçamento flex e watchlists (FC2-F3-03; aqui ele entra como número `flexCents`/`spentFlexCents`).
- Sugestões em linguagem natural (F5).
- Persistência de snapshots (o resultado é calculado sob demanda; cache só se medido necessário).

## Comportamento atual
Ver Problema. Arquivos do 1.x citados são referência de comportamento a abandonar, não de código a copiar.

## Comportamento esperado

### Tipos (arquivo `src/server/modules/budget/domain/available.types.ts`)
```ts
export type DateStr = string  // 'YYYY-MM-DD'

export type CashAccount = {
  id: string
  balanceCents: number            // saldo CLEARED (+ PENDING) do ledger; pode ser negativo
  overdraftLimitCents: number     // limite total do cheque especial (0 se não tem)
}

export type DueItem = {
  id: string
  source: 'PLANNED_TX' | 'STATEMENT' | 'LOAN_INSTALLMENT' | 'TAX'
  kind: 'INFLOW' | 'OUTFLOW'
  date: DateStr                   // vencimento
  amountCents: number             // positivo
  label: string
  isOverdue: boolean              // date < today
}

export type AvailableInput = {
  today: DateStr
  cycle: { start: DateStr; end: DateStr }          // de resolveCycle()
  nextIncomeDate: DateStr | null                   // próxima renda pendente (PLANNED INCOME), pode estar vencida
  accounts: CashAccount[]
  items: DueItem[]                                 // tudo que está previsto/pendente (já deduplicado)
  flexCents: number                                // orçamento flex do ciclo (F3-03)
  spentFlexCents: number                           // gasto flex por data de compra
  cushionCents: number                             // colchão
}

export type AvailableResult = {
  mode: 'NORMAL' | 'APERTO'
  state: 'calm' | 'tense' | 'hot'
  cycle: { start: DateStr; end: DateStr; dayIndex: number; daysInCycle: number; daysRemaining: number }
  cashEndOfCycleCents: number
  cashBreakdown: {                                 // composição que soma exatamente cashEndOfCycleCents
    balanceCents: number                           // Σ saldo(contas)
    inflowsCents: number                           // entradas previstas até o fim do ciclo
    statementsCents: number                        // faturas que vencem no ciclo
    fixedCents: number                             // PLANNED_TX de saída (fixas, assinaturas)
    installmentsCents: number                      // parcelas de empréstimo
    taxCents: number                               // DAS e impostos
  }
  freeCents: number                                // livre (pode ser negativo)
  perDayCents: number                              // trunc(livre / daysRemaining)
  limitedBy: 'flex' | 'caixa'
  pace: number | null                              // ritmo; null se flex == 0
  squeeze: null | {
    incomeDate: DateStr
    dueBeforeCents: number                         // devidoAntes
    availableNowCents: number                      // disponivelAgora
    shortfallCents: number                         // falta
    dueBefore: DueItem[]                           // lista "o que vence antes", ordenada por data
  }
  cashSeries: { date: DateStr; balanceCents: number; events: DueItem[] }[]
  floorCents: number                               // - Σ overdraft (faixa do limite no gráfico)
  minBalanceCents: number
  firstBelowFloorDate: DateStr | null
  overdraftUse: { accountId: string; usedCents: number; limitCents: number }[]
}
```
Função: `computeAvailable(input: AvailableInput): AvailableResult`.

### Ciclo de renda configurável
`src/server/modules/budget/domain/cycle.ts` (criado na FC2-F2-03; estender, não reescrever): `resolveCycle(today, { mode: 'CALENDAR_MONTH' | 'INCOME_CYCLE', payDay })`:
- `CALENDAR_MONTH`: do dia 1 ao último dia do mês de `today`.
- `INCOME_CYCLE`: começa no pagamento mais recente menor ou igual a `today` e termina na véspera do próximo pagamento. `payDay` fora do mês curto é ajustado para o último dia (31 em fevereiro vira 28 ou 29).
- Derivados: `dayIndex` (1 no primeiro dia, contando `today`), `daysInCycle`, `daysRemaining` (de `today` até `end`, inclusive; mínimo 1).
Default do dono: `INCOME_CYCLE` com `payDay` vindo da `IncomeRule` (F1-06).

### Conjunto de itens e deduplicação (use-case `getAvailable`)
`src/server/modules/budget/application/get-available.ts` monta `AvailableInput`:
- `accounts`: contas CHECKING, SAVINGS, WALLET e BUSINESS não arquivadas, com saldo de `AccountBalance`; INVESTMENT e CREDIT_CARD ficam fora (decisão registrada em ADR-021; BUSINESS entra porque o dinheiro da conta PJ é do dono; se a decisão mudar, vira flag de conta numa task futura).
- `items`: (a) PLANNED de séries (F3-01), incluindo atrasados, INFLOW para renda/reembolso e OUTFLOW para o resto; (b) faturas de cartão com saldo a pagar (`total − pago`), pelo vencimento, incluindo a fatura aberta com o acumulado conhecido (compras de cartão NÃO entram como saídas avulsas, só via fatura, para não duplicar); (c) parcelas de empréstimo não pagas (F1-05), incluindo atrasadas; (d) DAS/impostos pendentes (F1-06). Dedup por chave `{source, id}` e por vínculo: parcela que já tem PLANNED correspondente conta uma vez só (preferir o PLANNED).
- `nextIncomeDate`: data da primeira ocorrência INFLOW de série `INCOME` ainda PLANNED (a mais antiga, mesmo vencida).
- `flexCents`/`spentFlexCents`: de `computeFlex` (F3-03); enquanto a F3-03 não existir, o use-case aceita zero e a engine retorna `pace: null`.
- `cushionCents`: do `BudgetCycle` (F3-03) ou 0.

### Cálculo
1. `dateOf(item) = item.isOverdue ? today : item.date` apenas para a série de caixa (atrasado "vence hoje"); para os somatórios usar o valor inteiro.
2. `cashBreakdown` agrupa os mesmos termos por `source` (`STATEMENT` em `statementsCents`, `LOAN_INSTALLMENT` em `installmentsCents`, `TAX` em `taxCents`, `PLANNED_TX` de saída em `fixedCents`, INFLOW em `inflowsCents`) e vale `cashEndOfCycleCents = balance + inflows − statements − fixed − installments − tax`.
2b. `cashEndOfCycleCents` = `Σ saldo + Σ INFLOW com date <= cycle.end − Σ OUTFLOW com date <= cycle.end` (atrasados entram; faturas, fixas, DAS e parcelas são OUTFLOW). Itens com data posterior a `cycle.end` não entram (a renda do próximo ciclo fica de fora).
3. `freeCents = min(flexCents − spentFlexCents, cashEndOfCycleCents − cushionCents)`; `limitedBy` = `'flex'` se o primeiro termo é o menor ou igual, senão `'caixa'`.
4. `perDayCents = Math.trunc(freeCents / daysRemaining)`.
5. `pace = flexCents > 0 ? spentFlexCents / (flexCents * dayIndex / daysInCycle) : null`, arredondado a 2 casas apenas na apresentação (a engine devolve o número cheio).
6. Aperto: `incomeDate = nextIncomeDate`; `dataRenda = max(today, incomeDate)`; `devidoAntes = Σ OUTFLOW com date < dataRenda` (atrasados incluídos sempre, pois estão antes); `disponivelAgora = Σ saldo + Σ overdraft`; `falta` pela fórmula; `aperto = nextIncomeDate !== null ∧ falta > 0`; se não há renda pendente, `squeeze: null`, `mode: 'NORMAL'`.
7. Série de caixa: de `today` até `max(cycle.end, incomeDate ?? cycle.end)`; `balance(d) = Σ saldo + Σ INFLOW(dateOf <= d) − Σ OUTFLOW(dateOf <= d)`; um ponto por dia (dias sem evento repetem o saldo anterior), com `events` do dia; `floorCents = −Σ overdraft`; `minBalanceCents`; `firstBelowFloorDate` = primeiro dia com `balance < floor`.
8. `overdraftUse`: por conta, `usedCents = max(0, −balanceCents)` limitado só para exibição (`min(usedCents, limitCents)`) e flag de excedente derivável por `usedCents > limitCents`.
9. Estado da aura (RN-08): `hot` se `aperto` ou `freeCents < 0` ou `cashEndOfCycleCents < 0`; senão `tense` se `pace > 1` ou `limitedBy = 'caixa'`; senão `calm`.

## Regras de negócio
- RN-01: tudo em centavos inteiros; datas `YYYY-MM-DD`; nenhum `new Date()` implícito, `today` é injetado (ADR-002).
- RN-02: saldo negativo é cenário normal, não erro: `disponivelAgora` = saldo + limite pode ser positivo com saldo negativo.
- RN-03: o limite do cheque especial entra apenas em `disponivelAgora` e na faixa do gráfico; ele nunca aumenta `cashEndOfCycleCents` nem `livre` (o limite é crédito caro, não dinheiro livre).
- RN-04: atrasados são incluídos em `devidoAntes`, em `cashEndOfCycleCents` e na série (no dia de hoje).
- RN-05: faturas entram pelo vencimento e pelo saldo a pagar; compras no cartão não duplicam como saída.
- RN-06: renda recebida (ocorrência CLEARED) sai de `items` e já está no saldo; só a próxima renda PLANNED é `nextIncomeDate`.
- RN-07: `perDayCents` pode ser negativo; a UI decide como mostrar (a engine não clampa).
- RN-08: estado da aura na v1, sem outros limiares: `tense` quando `pace > 1` ou `limitedBy = 'caixa'`; `hot` quando `aperto` ou `freeCents < 0` ou `cashEndOfCycleCents < 0`; `calm` no resto. Documentar os limiares para recalibração futura.
- RN-09: `daysRemaining` mínimo 1 (último dia do ciclo divide por 1).
- RN-10: itens INFLOW nunca entram em `devidoAntes`.
- RN-11: a engine não faz I/O; o use-case isola o acesso a dados e filtra tudo por `userId`.
- RN-12: dados de teste e exemplos só com valores fictícios (Constituição).

## Critérios de aceitação
- [ ] CA-01: `computeAvailable` implementa as fórmulas de §5.1 e passa todos os cenários numéricos abaixo.
- [ ] CA-02: cenário "saldo negativo com cheque especial": `availableNow = 70000`, `shortfall = 20000`, `mode = 'APERTO'`, `firstBelowFloorDate = 2026-10-25`.
- [ ] CA-03: cenário "faturas antes da renda" (sem cheque): `shortfall = 30000`, `mode = 'APERTO'`.
- [ ] CA-04: cenário "renda recebida": `mode = 'NORMAL'`, `shortfall = 0`, `freeCents = 150000`, `limitedBy = 'flex'`, `perDayCents = 4838`, `pace = 0`, `state = 'calm'`.
- [ ] CA-05: cenário "parcela atrasada": com a parcela vencida, `shortfall = 10000` e APERTO; sem ela, `shortfall = 0` e NORMAL.
- [ ] CA-06: `resolveCycle` correto para `payDay = 5` em 2026-10-05 (inicia no próprio dia) e 2026-10-04, `payDay = 31` em fevereiro e modo mês calendário.
- [ ] CA-07: a série de caixa começa em hoje, tem um ponto por dia até `max(cycle.end, dataRenda)`, atrasados caem em hoje e `floorCents = −Σ limites`.
- [ ] CA-08: sem renda pendente, `mode = 'NORMAL'` e `squeeze = null`, mesmo com `falta` positiva.
- [ ] CA-09: o módulo `domain/` não importa Prisma, `next` nem `Date.now`; `get-available.ts` filtra por `userId` e deduplica itens (teste de integração).
- [ ] CA-10: rota `GET /api/available` autenticada devolve `AvailableResult` e executa em menos de 300 ms com 500 itens (teste de performance do use-case com repositório simulado).
- [ ] CA-11: `npm run lint`, `npm test`, `npx next build` passam.

## Impacto técnico
### Backend
- `src/server/modules/budget/domain/available.types.ts`, `available.ts` (`computeAvailable`), `cash-series.ts` (série), `squeeze.ts` (Aperto), `cycle.ts` (estender: `resolveCycle`, `dayIndex`, `daysRemaining`), testes ao lado.
- `src/server/modules/budget/application/get-available.ts` (monta a entrada e chama a engine), `src/server/modules/budget/infra/available-repository.ts` (consultas agregadas: saldos, PLANNED, faturas, parcelas, DAS).
- Rota fina `src/app/api/available/route.ts` (GET, query opcional `date` apenas em dev/teste).
- Registro como tool na F5-01 (`get_available`), sem trabalho aqui.
### Frontend
Nenhum (FC2-F3-04 consome `AvailableResult`).
### Banco de dados
Nenhuma tabela nova. Possível índice `@@index([userId, status, date])` em `Transaction` e `@@index([userId, dueDate])` em fatura/parcela para as consultas do repositório; migration aditiva se faltarem.
### Integrações
Nenhuma externa.
### Segurança
Rota com `requireAuth`; sem dados de outro `userId`; resposta sem dados de conta além de ids e valores.

## Plano de implementação
- [ ] Etapa 1: estender `cycle.ts` e testes de ciclo.
- [ ] Etapa 2: tipos e `computeAvailable` (caixa, livre, porDia, ritmo, estado) com testes dos cenários.
- [ ] Etapa 3: `squeeze.ts` (devidoAntes, disponivelAgora, falta) e testes.
- [ ] Etapa 4: `cash-series.ts` (série, piso, primeiro dia abaixo do piso) e testes.
- [ ] Etapa 5: repositório e `get-available.ts` (montagem e deduplicação) com testes de integração.
- [ ] Etapa 6: rota `GET /api/available`.
- [ ] Etapa 7: `docs/domain/disponivel.md` com as fórmulas e cenários (valores fictícios) e atualização do `.agents/context/CONTEXT.md`.

## Estratégia de testes
Todos os valores são fictícios; centavos entre parênteses.

- [ ] Unitários, cenário A, saldo negativo com cheque especial: `today = 2026-10-20`, ciclo 2026-10-05 a 2026-11-04 (`payDay = 5`), renda PLANNED de R$ 5.000,00 em 2026-11-05. Conta: saldo −R$ 300,00 (−30000), limite R$ 1.000,00 (100000). Itens: fatura R$ 800,00 em 2026-10-25 (80000) e fixa R$ 100,00 em 2026-10-28 (10000). Flex R$ 1.000,00 (100000), gasto R$ 300,00 (30000), colchão 0. Esperado: `disponivelAgora = 70000`, `devidoAntes = 90000`, `falta = 20000`, `mode = 'APERTO'`, `cashEndOfCycleCents = −120000`, `freeCents = −120000` (limitado por caixa), `daysRemaining = 16`, `perDayCents = −7500`, `state = 'hot'`; série: 10-20 em −30000, 10-25 em −110000, 10-28 em −120000, mantém até 11-04 e 11-05 em 380000; `floorCents = −100000`, `firstBelowFloorDate = 2026-10-25`, `minBalanceCents = −120000`. Variação com limite de apenas R$ 200,00 (20000): `disponivelAgora = −10000`, `falta = 90000 + 10000 = 100000`.
- [ ] Unitários, cenário B, faturas antes da renda: saldo R$ 500,00 (50000), limite 0, fatura R$ 600,00 (60000) em 10-25 e boleto R$ 200,00 (20000) em 10-30, renda em 11-05: `devidoAntes = 80000`, `disponivelAgora = 50000`, `falta = 30000`, APERTO, lista `dueBefore` ordenada por data (fatura primeiro).
- [ ] Unitários, cenário C, renda recebida: `today = 2026-10-05`, ciclo 10-05 a 11-04 (31 dias), saldo R$ 5.000,00 (500000) já com a renda recebida, próxima renda PLANNED em 11-05; itens: aluguel R$ 1.500,00 (150000) em 10-10, fatura R$ 800,00 (80000) em 10-25, fixa R$ 100,00 (10000) em 10-28; flex R$ 1.500,00 (150000), gasto 0, colchão R$ 200,00 (20000). Esperado: `devidoAntes = 240000`, `falta = 0`, `mode = 'NORMAL'`, `cashEndOfCycleCents = 260000` (`cashBreakdown`: saldo 500000, entradas 0, faturas 80000, fixas 160000, parcelas 0, DAS 0), `freeCents = min(150000, 240000) = 150000`, `limitedBy = 'flex'`, `perDayCents = 4838` (150000 / 31), `pace = 0`, `state = 'calm'`.
- [ ] Unitários, cenário D, parcela atrasada: `today = 2026-10-05`, saldo R$ 1.000,00 (100000), limite 0, renda em 11-05, parcela de empréstimo R$ 400,00 (40000) vencida em 2026-09-28 e fatura R$ 700,00 (70000) em 10-20. Com a parcela: `devidoAntes = 110000`, `falta = 10000`, APERTO; série: 10-05 em 60000 (atrasada cai hoje) e 10-20 em −10000 (abaixo do piso 0, `firstBelowFloorDate = 2026-10-20`). Sem a parcela: `devidoAntes = 70000`, `falta = 0`, NORMAL.
- [ ] Unitários, ritmo: ciclo de 30 dias, `dayIndex = 10`, flex 90000, gasto 40000: `pace = 40000 / 30000 = 1,3333`, `state = 'tense'` (se `aperto` falso e `livre > 0`). Gasto 20000: `pace = 0,6667`, `calm`. `flexCents = 0`: `pace = null`.
- [ ] Unitários, limitante: flex restante 150000 e `caixa − colchão = 60000`: `freeCents = 60000`, `limitedBy = 'caixa'`, `state = 'tense'`. Empate: `limitedBy = 'flex'`.
- [ ] Unitários, caixa negativo sem limite: saldo −R$ 100,00 (−10000), limite 0, nada a vencer, renda pendente: `disponivelAgora = −10000`, `falta = 0 + 10000 = 10000`, APERTO.
- [ ] Unitários, bordas: último dia do ciclo (`daysRemaining = 1`); sem renda pendente (`squeeze = null`, NORMAL mesmo com falta); itens com data posterior ao fim do ciclo não entram em `cashEndOfCycleCents`; INFLOW de reembolso no ciclo aumenta o caixa; renda vencida e ainda PLANNED (`incomeDate < today`): `dataRenda = today` e `devidoAntes` só com atrasados.
- [ ] Unitários, ciclo: `payDay = 5`: hoje 2026-10-05 gera 2026-10-05 a 2026-11-04 com `dayIndex = 1`; hoje 2026-10-04 gera 2026-09-05 a 2026-10-04 com `daysRemaining = 1`; `payDay = 31`, hoje 2026-02-10: 2026-01-31 a 2026-02-27; mês calendário em 2028-02-10: 2028-02-01 a 2028-02-29.
- [ ] Integração: `get-available` com dados semeados sintéticos (`tests/fixtures/`), dedup parcela com PLANNED correspondente conta uma vez; compra de cartão não duplica (fatura + compra = 1); isolamento por `userId`; desempenho com 500 itens.
- [ ] E2E: não aplicável (cobertos na F3-04).
- [ ] Manual: abrir `GET /api/available` com os dados de teste e conferir contra os cenários.

## Riscos e rollback
- Risco: dupla contagem entre PLANNED, parcelas e faturas. Mitigação: chaves de dedupe e vínculo explícito; testes de integração dedicados.
- Risco: limiares do estado `tense`/`hot` serem pouco informativos. Mitigação: regras simples e documentadas (RN-08), fáceis de recalibrar sem tocar nas fórmulas.
- Risco: usar o limite do cheque especial como "dinheiro livre". Mitigação: RN-03 e teste dedicado.
- Rollback: módulo novo e rota nova; telas só passam a consumir na F3-04; reverter o commit não afeta dados.

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
