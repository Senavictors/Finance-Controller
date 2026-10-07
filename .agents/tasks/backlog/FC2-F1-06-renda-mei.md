---
id: FC2-F1-06
title: "Renda MEI: base + dia presencial, DAS, teto anual"
status: backlog
type: feature
phase: F1
wave: 2
owner: dominio-financeiro
depends_on: [FC2-F1-01, FC2-F1-09]
created_at: 2026-10-05
updated_at: 2026-10-06
affected_modules: [income, ledger]
related_use_cases: [createIncomeRule, updateIncomeRule, projectIncome, materializeIncome, confirmIncomeReceipt, setAttendanceOverride, upsertMeiProfile, materializeDas, recomputeMeiLedger, getMeiStatus]
related_adrs: [ADR-029, ADR-019, ADR-020, ADR-021, ADR-002]
---

# FC2-F1-06 — Renda MEI: base + dia presencial, DAS, teto anual

## Contexto
O dono recebe como MEI/PJ: um pagamento mensal em dia fixo, composto por **valor base + adicional por dia presencial** (o adicional depende de quais dias da semana ele vai ao local e dos feriados). O dinheiro cai numa **conta PJ separada** (`type = BUSINESS`) e depois é transferido para a conta PF. Todo mês há o **DAS MEI** (guia fixa, vence dia 20) e é preciso acompanhar o **teto anual de faturamento do MEI**, que é proporcional ao mês de abertura no primeiro ano. A "renda prevista do ciclo" é insumo central do engine Disponível (ADR-021, F3-02): `rendaPrevista(ciclo) = base + adicionalPorDia × diasPresenciais(calendário, diasDaSemana, feriados)`; o modo Aperto depende da data e do valor da próxima renda. O ADR-029 define esta regra.

O 1.x não tem nada equivalente (só `RecurringRule` com valor fixo).

## Problema
- Não há como modelar renda variável determinística por calendário (dias úteis presenciais x feriados nacionais).
- Dia de pagamento que cai em fim de semana/feriado precisa ajustar para o dia útil (e o DAS, idem).
- Falta o acompanhamento do teto anual do MEI (proporcional no ano de abertura) com alertas.
- O DAS é uma despesa fixa mensal que precisa aparecer como compromisso previsto.

## Objetivo
Módulo `src/server/modules/income/` com:
1. Cálculo puro de feriados nacionais (fixos + Sexta-feira Santa), dias presenciais e renda prevista por competência.
2. Cálculo da data de pagamento com ajuste de dia útil.
3. Use-cases: regra de renda, projeção, materialização de lançamentos `PLANNED` idempotentes (renda e DAS), confirmação de recebimento.
4. `MeiProfile`/`MeiLedger`: teto anual proporcional, acumulado a partir do ledger, nível de alerta (80% / 100% / 120%) e projeção.

## Fora de escopo
- Recorrências genéricas por RRULE (F3-01) e matching de lançamento importado com o previsto (F4-04): aqui os previstos nascem com `occurrenceKey` para que F3/F4 os reconheçam.
- Engine Disponível (F3-02); tela Planejar (F3-05) e tela Hoje (F3-04): apenas contratos de leitura.
- Emissão de nota fiscal, apuração fiscal, declaração anual (DASN-SIMEI) e orientação contábil. O módulo é um **acompanhamento informativo** e não substitui contador.
- Feriados estaduais/municipais (o usuário informa em `extraDaysOff`); ponto facultativo (Carnaval, Corpus Christi) também via `extraDaysOff`.
- Transferência PJ -> PF (já coberta por `createTransfer` do ledger).

## Comportamento atual
Nada no 1.x. O schema 2.0 (F0-02) define `IncomeRule` (`baseCents`, `perDayCents`, `weekdays Int[]` 0=domingo..6=sábado, `payDay`, `paymentAdjust BusinessDayRule`, `additionalBasis AdditionalBasis`, `destinationAccountId`, `extraDaysOff String[]`, `attendanceOverrides Json`, `startDate`, `endDate`, `isActive`), `MeiProfile` (`openedAt`, `annualCeilingCents` default 8100000, `dasAmountCents`, `dasDueDay` default 20, `dasAccountId`, `businessAccountId`), `MeiLedger` (`year`, `accumulatedCents`, `proportionalCeilingCents`, `byMonth Json`, `lastRecomputedAt`) e `Transaction.occurrenceKey` único por usuário. O ledger (F1-01) cria lançamentos `PLANNED` e muda status. Categorias `renda-mei` e `das-mei` vêm da F1-07 (onda 1 da mesma fase).

## Comportamento esperado
Convenções: valores em centavos inteiros; datas de calendário em meio-dia UTC; `weekdays` usa 0=domingo ... 6=sábado; funções puras recebem datas explícitas (nenhum `new Date()` implícito).

### Domínio puro — `src/server/modules/income/domain/`
- `holidays.ts`
  - `easterSunday(year)`: algoritmo de Meeus/Jones/Butcher (verificar: 2024-03-31, 2025-04-20, 2026-04-05, 2027-03-28).
  - `brazilNationalHolidays(year): { date, name }[]`: **fixos** 01-01 (Confraternização), 04-21 (Tiradentes), 05-01 (Dia do Trabalho), 09-07 (Independência), 10-12 (Nossa Senhora Aparecida), 11-02 (Finados), 11-15 (Proclamação da República), 11-20 (Consciência Negra, feriado nacional desde 2024), 12-25 (Natal); **móvel**: Sexta-feira Santa (Páscoa − 2 dias). Carnaval e Corpus Christi são pontos facultativos: **não** entram (o usuário os inclui em `extraDaysOff`). Para anos anteriores a 2024, 11-20 não é nacional (regra por ano).
  - `isHoliday(date, extraDaysOff[])`.
- `calendar.ts`
  - `presentialDays({ periodStart, periodEnd, weekdays, extraDaysOff, overrides, ruleStart?, ruleEnd? })`: lista de datas do período (inclusive) cujo dia da semana está em `weekdays`, que **não** são feriado nacional nem `extraDaysOff`, aplicando `overrides` (mapa `YYYY-MM-DD -> boolean`: `false` remove o dia, `true` inclui mesmo se fora de `weekdays`/feriado) e limitando a `ruleStart/ruleEnd`.
  - `isBusinessDay(date, extraDaysOff)`: segunda a sexta e não feriado.
  - `adjustToBusinessDay(date, rule: BusinessDayRule, extraDaysOff)`: `NONE` mantém; `NEXT_BUSINESS_DAY` avança até o próximo dia útil; `PREVIOUS_BUSINESS_DAY` recua.
  - `clampDay(year, month, day)`: limita o dia ao último do mês (dia 31 em fevereiro => 28/29).
- `income-rule.ts`
  - `paymentDateFor({ year, month, payDay, adjust, extraDaysOff })`: data de pagamento do mês (com `clampDay` + `adjustToBusinessDay`).
  - `competencePeriod({ paymentDate, additionalBasis })`: `PREVIOUS_MONTH` => mês calendário anterior ao do pagamento; `SAME_MONTH` => mês do pagamento.
  - `expectedIncome(rule, paymentDate)` => `{ paymentDate, base, additional, presentialDays: number, dates: string[], total }` com `additional = perDayCents × presentialDays`.
  - `projectIncomeEvents(rule, from, to)`: um evento por mês cujo `paymentDate` esteja em `[from, to]` e dentro de `[startDate, endDate]` da regra; ordenado por data.
- `das.ts`: `dasDueDate({ year, month, dueDay, extraDaysOff })` (vence no dia `dueDay` do mês, ajustado para o **próximo dia útil** se cair em fim de semana/feriado); `dasCompetence(dueDate)` = mês anterior (`YYYY-MM`); `projectDasEvents(profile, from, to)`.
- `mei-ceiling.ts`
  - `proportionalCeiling({ annualCeiling, openedAt, year })`: ano posterior ao de abertura ou abertura em anos anteriores => teto cheio; no **ano de abertura**, `round(annualCeiling × mesesDeAtividade / 12)` com `mesesDeAtividade = 12 − mêsDeAbertura + 1` (o mês de abertura conta inteiro). Ex.: teto 8100000 aberto em março/2026 => 10 meses => **6750000**; aberto em outubro/2026 => 3 meses => 2025000.
  - `meiLevel({ accumulated, ceiling })` (comparações inteiras, sem ponto flutuante: `accumulated*100 >= ceiling*80`): `OK` (< 80%), `ATTENTION` (>= 80% e < 100%), `LIMIT` (>= 100% e < 120%), `CRITICAL` (>= 120%).
  - `meiMessage(level)`: texto informativo curto (pt-BR): `ATTENTION` "Você usou 80% do teto do MEI"; `LIMIT` "Teto ultrapassado: o excedente de até 20% exige DAS complementar"; `CRITICAL` "Acima de 120% do teto: risco de desenquadramento do MEI, fale com seu contador". Sem aconselhamento fiscal; apenas alerta.
  - `projectYearEnd({ byMonth, monthsElapsed, ceiling })`: média mensal dos meses decorridos × 12 (ou meses de atividade restantes), devolve `{ projectedTotal, willExceed, exceedMonth | null }`.
  - `ceilingRemaining(ceiling, accumulated)` (pode ser negativo).

### Aplicação — `src/server/modules/income/application/`
- `createIncomeRule` / `updateIncomeRule` / `archiveIncomeRule`: valida `destinationAccountId` (conta do usuário, tipo `BUSINESS` recomendado: se não for, aviso `INCOME_ACCOUNT_NOT_BUSINESS`), `payDay` 1-31, `weekdays` subconjunto de 0..6 sem repetição, `baseCents >= 0`, `perDayCents >= 0`, `extraDaysOff` com datas ISO válidas. Ao atualizar, **recalcula** os `PLANNED` futuros da regra.
- `setAttendanceOverride(ruleId, date, present | null)`: grava/remove no JSON `attendanceOverrides` e recalcula os previstos afetados.
- `projectIncome(userId, { from, to })`: eventos de todas as regras ativas com detalhamento (base, adicional, dias) — contrato para F3-02/F3-05.
- `materializeIncome(userId, { until, now })`: para cada evento em `(now, until]` (default `now + 90 dias`), **upsert idempotente** de um lançamento via ledger: `kind INCOME`, `status PLANNED`, `source RECURRING`, conta destino da regra, valor `total`, `date` = `paymentDate`, categoria `renda-mei`, `occurrenceKey = income:{ruleId}:{YYYY-MM-DD}`. Se já existe e ainda é `PLANNED`, atualiza valor/data; se já foi confirmado (`CLEARED|RECONCILED`), não toca.
- `confirmIncomeReceipt({ transactionId, receivedAmount?, receivedDate? })`: muda o previsto para `CLEARED` pelo ledger, permitindo valor/data reais diferentes do previsto (mantém o previsto em `notes`), e dispara `recomputeMeiLedger` do ano.
- `upsertMeiProfile(userId, input)`: `openedAt`, `annualCeilingCents` (default 8100000, editável porque o teto é parâmetro legal), `dasAmountCents`, `dasDueDay` (default 20), `dasAccountId`, `businessAccountId`; valida contas do usuário.
- `materializeDas(userId, { until, now })`: para cada vencimento do DAS em `(now, until]`, upsert idempotente de lançamento `EXPENSE` `PLANNED` (via ledger) na conta `dasAccountId`, valor `-dasAmountCents`, `date` = `dasDueDate`, categoria `das-mei`, descrição "DAS MEI AAAA-MM" (competência), `source RECURRING`, `occurrenceKey = das:{YYYY-MM-DD}`.
- `recomputeMeiLedger(userId, year)`: soma, por mês, os lançamentos `INCOME` com status `CLEARED|RECONCILED` das contas `BUSINESS` do usuário (ou da `businessAccountId`) com `date` no ano, **excluindo** `TRANSFER`, `ADJUSTMENT` e estornos; grava `MeiLedger` (`byMonth`, `accumulatedCents`, `proportionalCeilingCents`, `lastRecomputedAt`). Idempotente. Regime de caixa: o faturamento conta no mês do recebimento.
- `getMeiStatus(userId, { year, now })` => `{ ceiling, accumulated, remaining, pct, level, message, byMonth, projection: { projectedTotal, willExceed, exceedMonth } }`.
- Rotas finas: `GET/POST /api/income/rules`, `PATCH/DELETE /api/income/rules/[id]`, `POST /api/income/rules/[id]/attendance`, `GET /api/income/projection?from&to`, `POST /api/income/materialize`, `POST /api/transactions/[id]/confirm-income`, `GET/PUT /api/mei/profile`, `GET /api/mei/status?year`.

## Regras de negócio
- RN-01: Renda do ciclo = base + adicionalPorDia × dias presenciais; dias presenciais = dias da semana configurados no período de competência, menos feriados nacionais e `extraDaysOff`, com ajustes manuais (`attendanceOverrides`).
- RN-02: Período de competência do adicional é configurável: `PREVIOUS_MONTH` (padrão: dias do mês anterior ao do pagamento) ou `SAME_MONTH`. **A confirmar com o dono** qual vale na prática; a escolha fica no cadastro da regra e é registrada em Decisões/Pendências.
- RN-03: Dia de pagamento 1-31; dia inexistente no mês é limitado ao último dia; se cair em fim de semana ou feriado aplica-se `paymentAdjust` (`NEXT_BUSINESS_DAY` padrão).
- RN-04: Feriados nacionais = 9 fixos (11-20 apenas de 2024 em diante) + Sexta-feira Santa. Facultativos e municipais/estaduais entram por `extraDaysOff`.
- RN-05: A renda prevista é sempre um lançamento `PLANNED` idempotente (`occurrenceKey`); o recebimento real o **confirma** (pode diferir em valor e data).
- RN-06: DAS MEI: despesa mensal fixa (`dasAmountCents`), vence no `dasDueDay` (padrão 20), ajustada para o próximo dia útil; competência = mês anterior; sai da conta configurada (PJ ou PF).
- RN-07: Teto anual MEI parametrizável (padrão R$ 81.000,00 = 8100000); no ano de abertura é **proporcional**: `teto/12 × meses de atividade`, contando o mês de abertura inteiro.
- RN-08: Faturamento acumulado = recebimentos (`INCOME` compensados) em contas `BUSINESS` no ano, por regime de caixa; transferências, ajustes e estornos não contam.
- RN-09: Alertas: `ATTENTION` >= 80%, `LIMIT` >= 100%, `CRITICAL` >= 120% do teto (proporcional quando aplicável). Comparação em inteiros. Mensagens são informativas e não constituem orientação fiscal.
- RN-10: Previstos de renda e DAS não afetam o saldo compensado (apenas `balancePlanned`); só a confirmação move o saldo (ADR-019).
- RN-11: Nenhum CNPJ, CPF, valor real ou nome de contratante em código, testes, fixtures ou docs; exemplos fictícios.

## Critérios de aceitação
- [ ] CA-01: `easterSunday` = 2024-03-31, 2025-04-20, 2026-04-05, 2027-03-28; `brazilNationalHolidays(2026)` contém exatamente: 01-01, 04-03 (Sexta-feira Santa), 04-21, 05-01, 09-07, 10-12, 11-02, 11-15, 11-20, 12-25 (10 itens); `brazilNationalHolidays(2023)` **não** contém 11-20 (9 itens).
- [ ] CA-02: `presentialDays` para outubro de 2026 com `weekdays=[2,3,4]` (terça a quinta) retorna **13** dias (terças 6, 13, 20, 27; quartas 7, 14, 21, 28; quintas 1, 8, 15, 22, 29); para novembro de 2026 com `weekdays=[1,2,3,4,5]` retorna **19** (21 dias úteis menos os feriados de 02/11 e 20/11); para abril de 2026 com segunda a sexta retorna **20** (22 menos 03/04 e 21/04).
- [ ] CA-03: `overrides = { '2026-10-13': false }` reduz a contagem de outubro/2026 (terça a quinta) para 12; `overrides = { '2026-10-12': true }` (segunda-feira feriado) a aumenta para 14; `extraDaysOff = ['2026-10-14']` reduz para 12.
- [ ] CA-04: `expectedIncome` com `baseCents = 300000`, `perDayCents = 4000`, `PREVIOUS_MONTH`, pagamento em novembro/2026 (competência outubro/2026, 13 dias) => `additional = 52000`, `total = 352000`; com `SAME_MONTH` e pagamento em outubro (13 dias) => mesmo total; `weekdays = []` => `additional = 0`; `perDayCents = 0` => `total = base`.
- [ ] CA-05: `paymentDateFor`: `payDay=15`, novembro/2026 (domingo): `NEXT_BUSINESS_DAY` => 2026-11-16, `PREVIOUS_BUSINESS_DAY` => 2026-11-13, `NONE` => 2026-11-15; `payDay=20`, novembro/2026 (feriado, sexta): `NEXT` => 2026-11-23, `PREVIOUS` => 2026-11-19; `payDay=31`, fevereiro/2027 (28/02, domingo): `NEXT` => 2027-03-01.
- [ ] CA-06: `dasDueDate` com `dueDay=20` em novembro/2026 (feriado) => 2026-11-23; em dezembro/2026 (dia 20 é domingo) => 2026-12-21; em outubro/2026 (dia 20, terça) => 2026-10-20; competência de 2026-11-23 é `2026-10`.
- [ ] CA-07: `proportionalCeiling`: aberto 2026-03-10 em 2026 => 6750000; aberto 2026-10-31 em 2026 => 2025000; aberto 2026-01-02 em 2026 => 8100000; aberto 2026-03-10 consultando 2027 => 8100000; consultando 2025 (antes da abertura) => 0.
- [ ] CA-08: `meiLevel` com teto 6750000: 5399999 => `OK`; 5400000 => `ATTENTION`; 6749999 => `ATTENTION`; 6750000 => `LIMIT`; 8099999 => `LIMIT`; 8100000 => `CRITICAL`; teto 0 e acumulado 0 => `OK` (sem divisão por zero).
- [ ] CA-09: `materializeIncome` com uma regra ativa e `until = now + 90 dias` cria, via ledger, um `PLANNED` `INCOME` por pagamento no horizonte na conta destino, com `occurrenceKey` esperado; chamar duas vezes **não duplica**; alterar `perDayCents` e chamar de novo atualiza o valor do previsto ainda `PLANNED`; um previsto já `CLEARED` não é alterado.
- [ ] CA-10: `confirmIncomeReceipt` com valor recebido diferente do previsto grava o valor real, muda para `CLEARED`, ajusta `AccountBalance` da conta PJ (`balancePlanned` -previsto, `balanceCleared` +real) e atualiza o `MeiLedger` do ano.
- [ ] CA-11: `materializeDas` gera um `EXPENSE` `PLANNED` por vencimento com `occurrenceKey = das:YYYY-MM-DD`, valor `-dasAmountCents`, na conta configurada; idempotente; dia 20 em fim de semana/feriado usa o próximo dia útil.
- [ ] CA-12: `recomputeMeiLedger` soma apenas `INCOME` `CLEARED|RECONCILED` em contas `BUSINESS` do ano; ignora `TRANSFER` (inclusive PJ -> PF), `ADJUSTMENT` e lançamentos `PLANNED`; é idempotente; dois meses distintos populam `byMonth` corretamente.
- [ ] CA-13: `getMeiStatus` com acumulado 5400000 e teto proporcional 6750000 devolve `pct = 80`, `level = ATTENTION`, `remaining = 1350000` e uma mensagem; com `projectYearEnd` indicando excesso, `willExceed = true` e `exceedMonth` preenchido.
- [ ] CA-14: Criar regra com `weekdays=[7]`, `payDay=0`, `payDay=32` ou `baseCents` negativo retorna 400; conta destino de outro usuário retorna 404; conta destino não-`BUSINESS` grava com aviso `INCOME_ACCOUNT_NOT_BUSINESS`.
- [ ] CA-15: Todos os testes de domínio passam com `TZ=America/Sao_Paulo` e `TZ=UTC`; `rg prisma src/server/modules/income/domain` vazio; `rg "new Date\(\)" src/server/modules/income/domain` vazio.
- [ ] CA-16: `npm run lint`, `npm test`, `npx next build`, `npm run format:check`, `npm run guard:data` passam.

## Impacto técnico
### Backend
`src/server/modules/income/{domain,application,infra,http}`; domínio: `holidays.ts`, `calendar.ts`, `income-rule.ts`, `das.ts`, `mei-ceiling.ts` (+ testes); aplicação: casos de uso acima; infra: `prisma-income-repository.ts` e repositório em memória; HTTP: Zod + rotas finas. Lançamentos criados exclusivamente via use-cases do ledger. Datas com utilitários de `src/lib/dates.ts`.
### Frontend
Nenhum (F3-05 mostra renda/DAS no Planejar; F3-04 mostra renda pendente no Hoje).
### Banco de dados
Tabelas `income_rules`, `mei_profiles`, `mei_ledgers` e `transactions.occurrence_key` da F0-02; sem migration.
### Integrações
Nenhuma externa; calendário de feriados é calculado (sem API).
### Segurança
`userId` em tudo; Zod; nenhum CNPJ/CPF/valor real em código, testes ou docs (exemplos fictícios); descrições dos previstos não carregam nome do contratante.

## Plano de implementação
- [ ] Etapa 1 — Ler ADR-029/021/020, §2 e §5.1 da especificação, F1-01 (ledger) e o schema 2.0.
- [ ] Etapa 2 — `holidays.ts` e `calendar.ts` com testes (anos 2024-2028; 11-20 antes/depois de 2024).
- [ ] Etapa 3 — `income-rule.ts` e `das.ts` com testes (tabelas dos CA-04/05/06).
- [ ] Etapa 4 — `mei-ceiling.ts` com testes (CA-07/08 e projeção).
- [ ] Etapa 5 — Repositório e use-cases `createIncomeRule`, `projectIncome`, `materializeIncome`, `setAttendanceOverride`.
- [ ] Etapa 6 — `confirmIncomeReceipt`, `upsertMeiProfile`, `materializeDas`, `recomputeMeiLedger`, `getMeiStatus`.
- [ ] Etapa 7 — Zod e rotas; testes de integração em banco de teste (idempotência de `occurrenceKey`, unique por usuário).
- [ ] Etapa 8 — Docs `docs/domain/renda-mei.md` (fórmulas, feriados, teto, limites do alerta) e ADR-029 (nota de decisão sobre `additionalBasis`), `.agents/context/CONTEXT.md`, `PLANS.md`; commit `feat(f1-renda-mei): renda base mais dia presencial, das e teto anual`.

## Estratégia de testes
- [ ] Unitários (feriados): Páscoa em 2024-2028; lista nacional 2023 vs 2026; `isHoliday` com `extraDaysOff`; 29/02 em ano bissexto.
- [ ] Unitários (calendário): semana inteira; só fins de semana (`[0,6]`); período de 1 dia; período invertido (retorna vazio ou erro `INVALID_PERIOD`, fixar); `overrides` positivo/negativo; `ruleStart/ruleEnd` cortando o período; virada de mês e de ano.
- [ ] Unitários (renda): tabela de `paymentDateFor` (sábado, domingo, feriado, dia 29/30/31 em fevereiro, 31 em abril); `expectedIncome` com `weekdays` vazio, `perDayCents` 0, `base` 0; `projectIncomeEvents` respeitando `startDate`/`endDate`; horizonte atravessando o ano.
- [ ] Unitários (DAS): 12 meses de 2026 (dia 20 útil, sábado, domingo, feriado); competência; `dueDay` 31 clamp.
- [ ] Unitários (teto): proporcional por mês de abertura (jan a dez); níveis nas bordas (80%/100%/120% - 1 centavo, exato, + 1 centavo); teto 0; projeção com 0 meses decorridos (sem divisão por zero) e com excesso.
- [ ] Integração (repositório em memória): materialização idempotente; atualização de previsto; confirmação divergente; `recomputeMeiLedger` com mistura de contas PF/PJ e de kinds; DAS em conta PF.
- [ ] Integração (banco de teste): unique `(userId, occurrenceKey)` impede duplicata; duas chamadas concorrentes de `materializeIncome` resultam em 1 lançamento por data.
- [ ] E2E: não aplicável.
- [ ] Manual: criar conta PJ e regra fictícia via `curl`, materializar 90 dias, confirmar um recebimento e consultar `/api/mei/status`.

## Riscos e rollback
- **Regra real do pagamento incerta** (competência anterior ou do mês; ajuste de dia útil): parametrizado (`additionalBasis`, `paymentAdjust`) e marcado como pendência de confirmação com o dono; defaults documentados.
- **Teto e DAS mudam por lei/salário mínimo**: valores são parâmetros do `MeiProfile`, não constantes de código (exceto o default do teto, documentado).
- **Feriados**: lista nacional pode mudar (como 11-20 em 2024); manter dados por ano e permitir `extraDaysOff`.
- **Consistência com F3-01**: se a F3-01 introduzir `RecurringSeries(INCOME)`, a renda MEI continua sendo materializada por este módulo (fonte de verdade da fórmula) e a série apenas referencia `incomeRuleId`; evitar duplicidade usando o mesmo `occurrenceKey`.
- **Risco jurídico/fiscal**: as mensagens são avisos informativos; não há cálculo de imposto além do DAS fixo informado.
- Rollback: `git revert`; sem migration; previstos criados em testes são descartáveis.

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
