---
estado: real
fonte: src/server/modules/income/ (domain, application, infra, http); task FC2-F1-06; ADR-029; ADR-032 (proposto)
ultima-revisao: FC2-F1-06 2026-10-07
---

# Renda MEI: base + dia presencial, DAS e teto anual

O dono recebe como MEI/PJ: um pagamento mensal em dia fixo, composto por **valor base + adicional por dia presencial**, numa conta `BUSINESS`. O módulo `income` calcula a renda prevista pelo calendário, materializa previstos idempotentes no ledger (renda e DAS) e acompanha o teto anual do MEI. É um **acompanhamento informativo**: não substitui contador, não apura imposto e não emite nota. Exemplos nesta página são fictícios.

## Fórmula (RN-01)

```
rendaPrevista = base + adicionalPorDia x diasPresenciais
diasPresenciais = dias do período de competência cujo dia da semana está em weekdays
                  - feriados nacionais - extraDaysOff, com attendanceOverrides por cima
```

Tudo em centavos inteiros. `expectedIncome` devolve `{ paymentDate, base, additional, presentialDays, dates, total }` (os componentes que a UI mostra). Exemplo fictício: base 300000, adicional 4000 por dia, competência outubro/2026 com terça a quinta (13 dias) => adicional 52000, total 352000.

## Período de competência (RN-02)

`additionalBasis` na regra: `PREVIOUS_MONTH` (padrão: dias do mês anterior ao do pagamento) ou `SAME_MONTH`. **Pendência de confirmação com o dono**: qual vale na prática. O padrão é `PREVIOUS_MONTH` e a escolha é editável por regra.

## Calendário

- Feriados nacionais (`brazilNationalHolidays(year)`): 9 fixos (01-01, 04-21, 05-01, 09-07, 10-12, 11-02, 11-15, 11-20, 12-25) mais Sexta-feira Santa (Páscoa - 2 dias, Meeus/Jones/Butcher). 11-20 só vale de 2024 em diante. Carnaval, Corpus Christi, feriados estaduais e municipais **não** entram: o usuário informa em `extraDaysOff`.
- `weekdays`: 0 = domingo ... 6 = sábado.
- `attendanceOverrides` (`YYYY-MM-DD -> boolean`): `false` remove o dia, `true` inclui mesmo fora de `weekdays` ou em feriado. O override é a última palavra do usuário: prevalece sobre feriado e `extraDaysOff`.
- Dia de pagamento 1-31: dia inexistente é limitado ao último do mês (`clampDay`); fim de semana ou feriado segue `paymentAdjust` (`NEXT_BUSINESS_DAY` padrão, `PREVIOUS_BUSINESS_DAY`, `NONE`).
- Datas de calendário em meio-dia UTC; "hoje" é calculado em `America/Sao_Paulo` a partir de um relógio injetável.

## DAS MEI (RN-06)

Despesa mensal fixa (`dasAmountCents`), vence no `dasDueDay` (padrão 20), ajustada para o **próximo dia útil**; competência = mês anterior. Materializado como `EXPENSE` `PLANNED` na conta `dasAccountId` (PJ ou PF), `occurrenceKey = das:YYYY-MM-DD`, categoria `das-mei`, descrição "DAS MEI AAAA-MM".

## Teto anual (RN-07 a RN-09)

- Teto padrão 8100000 (parâmetro do `MeiProfile`, editável porque é valor legal). No ano de abertura é proporcional: `round(teto x meses de atividade / 12)`, contando o mês de abertura inteiro (aberto em março => 10 meses => 6750000; antes da abertura => 0).
- Acumulado = `INCOME` `CLEARED|RECONCILED` em contas `BUSINESS` (ou na `businessAccountId`) com `date` no ano, por regime de caixa. Transferências (inclusive PJ -> PF), ajustes, estornos e previstos não contam. Recalculado do ledger (idempotente) e gravado em `MeiLedger`.
- Níveis (comparação inteira, sem ponto flutuante; **ADR-032, proposto, a ratificar pelo dono**, que emenda o ADR-029): `OK` (< 80%), `ATTENTION` (>= 80% e < 95%), `CRITICAL` (>= 95% e < 100%), `EXCEEDED` (>= 100% e < 120%), `SEVERE` (>= 120%). Teto 0 com acumulado 0 => `OK`; teto 0 com receita => `SEVERE`. O aviso de projeção (`willExceed`/`exceedMonth`) é independente dos níveis. Mensagens informativas, sem aconselhamento fiscal.
- Feriados e premissas padrão (adicional presencial apurado no mês anterior; pagamento em dia não útil vai para o próximo dia útil): ver ADR-032.
- Projeção de fim de ano: média dos meses de atividade já fechados aplicada aos restantes (mantém o realizado quando maior); com 0 meses fechados, a projeção é o realizado. Devolve `projectedTotal`, `willExceed`, `exceedMonth`, e `getMeiStatus` expõe `assumptions` (regime de caixa, contas, primeiro mês ativo, meses decorridos).

## Previstos no ledger (RN-05, RN-10)

Todo previsto nasce pelo ledger (`upsertPlannedBatch`), `status PLANNED`, `source RECURRING`, `occurrenceKey` determinística: `income:{ruleId}:{YYYY-MM-DD}` e `das:{YYYY-MM-DD}`. Reexecutar não duplica; previsto ainda `PLANNED` é atualizado (valor/data); `CLEARED|RECONCILED` não é tocado (`userLocked` vence tudo). Previstos não mexem no saldo compensado (só `balancePlanned`); a confirmação (`confirmIncomeReceipt`, via `updateTransaction` com `status CLEARED`) aceita valor e data reais e guarda o previsto em `notes`, depois recalcula o `MeiLedger`. Mudança na regra ou em `attendanceOverrides` recalcula os `PLANNED` futuros da regra e remove os que deixaram de existir.

## API pública (`@/server/modules/income`)

Serviço: `getIncomeService()` (`infra/income-service.ts`, ligado ao Prisma) ou `createIncomeService(deps)` (testes, repositório em memória). Métodos, todos com `{ userId }` primeiro: `createIncomeRule`, `updateIncomeRule`, `archiveIncomeRule`, `setAttendanceOverride`, `listIncomeRules`, `getIncomeRule`, `projectIncome({ from, to })` (contrato de leitura para a engine Disponível F3-02, Planejar F3-05 e Hoje F3-04), `materializeIncome`, `confirmIncomeReceipt`, `upsertMeiProfile`, `getMeiProfile`, `materializeDas`, `recomputeMeiLedger`, `getMeiStatus`. Funções puras exportadas: `expectedIncome`, `paymentDateFor`, `projectIncomeEvents`, `presentialDays`, `brazilNationalHolidays`, `dasDueDate`, `proportionalCeiling`, `meiLevel`, `projectYearEnd` e correlatas.

Rotas finas: `GET/POST /api/income/rules`, `GET/PATCH/DELETE /api/income/rules/[id]`, `POST /api/income/rules/[id]/attendance`, `GET /api/income/projection?from&to`, `POST /api/income/materialize`, `POST /api/transactions/[id]/confirm-income`, `GET/PUT /api/mei/profile`, `GET /api/mei/status?year`.

## Plugando o job de materialização

Não há cron aqui (ADR-030 define os jobs na F5). O job diário, por usuário, chama `getIncomeService().materializeIncome(ctx, { now })` e `materializeDas(ctx, { now })` (horizonte padrão de 90 dias, idempotentes, seguros para reexecução) e, ao fim do mês, `recomputeMeiLedger(ctx, { year })`. A F3-01, se criar `RecurringSeries(INCOME)`, referencia `incomeRuleId` e reaproveita a mesma `occurrenceKey`.

## Erros

`IncomeError` com `code` e categoria (400 `INVALID`, 404 `NOT_FOUND`, 409 `CONFLICT`); erros do ledger propagam com o código. Aviso (não erro): `INCOME_ACCOUNT_NOT_BUSINESS` quando a conta destino não é `BUSINESS`.
