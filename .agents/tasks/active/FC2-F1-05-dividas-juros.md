---
id: FC2-F1-05
title: "Dívidas: consignado (Price), cheque especial, rotativo, Pix no crédito"
status: active
type: feature
phase: F1
wave: 2
owner: dominio-financeiro
depends_on: [FC2-F1-01, FC2-F1-09]
created_at: 2026-10-05
updated_at: 2026-10-06
affected_modules: [debts, ledger]
related_use_cases: [createLoan, registerInstallmentPayment, listDebts, getDebtSummary, estimateOverdraftCost, rankDebtsByRate, simulatePayoff]
related_adrs: [ADR-028, ADR-019, ADR-002, ADR-025]
---

# FC2-F1-05 — Dívidas: consignado (Price), cheque especial, rotativo, Pix no crédito

## Contexto
O perfil financeiro do dono inclui crédito caro e recorrente: **cheque especial** frequentemente em uso, **Pix no crédito** e **limite do cartão convertido em saldo**, rotativo eventual e **empréstimos consignados** (sistema Price, parcela fixa, débito em conta), às vezes com parcelas em atraso. O ADR-028 faz de "dívidas e juros" um módulo de primeira classe: a tela Planejar (F3-05) lista as dívidas **ordenadas por taxa**, com **custo mensal em R$** e **data prevista de quitação**, e o engine Disponível (F3-02) precisa das parcelas pendentes (inclusive atrasadas) como compromissos do ciclo. O 1.x não tem nada disso (só `Goal` de quitação genérica).

## Problema
- Não há modelo, cálculo nem API de dívidas.
- Sem juros calculados, o usuário não enxerga o custo real de cada dívida nem a ordem de prioridade para quitar.
- Parcelas em atraso (multa + juros de mora) precisam entrar nos compromissos com o valor corrigido.
- O uso do cheque especial já é medido pelo ledger (F1-01), mas o **custo** em R$ não.

## Objetivo
Módulo `src/server/modules/debts/` com:
1. Engine pura de juros: Price, cronograma de amortização, taxa implícita, encargos de atraso, custo mensal de cheque especial/rotativo, prazo de quitação, taxa anual equivalente e ordenação por taxa.
2. Use-cases e rotas para cadastrar dívidas (`Loan`/`LoanInstallment`), registrar pagamento de parcela (vinculando um lançamento do ledger) e listar dívidas com resumo.
3. Integração leitura-somente com o ledger para cheque especial e cartão (rotativo).

## Fora de escopo
- Tela Planejar e metas de quitação (F3-05, F3-07).
- Engine Disponível (F3-02): aqui apenas se expõe `listPendingDebtObligations(userId, { until, now })`.
- Recorrência de parcela via `RecurringSeries(LOAN_INSTALLMENT)` (F3-01); aqui as parcelas são `LoanInstallment` próprios.
- Renegociação/portabilidade, CET/IOF detalhado do contrato (o usuário informa a parcela real do contrato), amortização extraordinária parcial (apenas quitação antecipada simples no cálculo de simulação).
- Importação de contratos.

## Comportamento atual
Nenhum equivalente no 1.x (existe apenas `goals` do tipo quitação sem juros). O schema 2.0 (F0-02) define `Loan` (`kind`, `monthlyRate` Decimal(9,6) fração mensal, `principalCents`, `installmentCount`, `installmentAmountCents`, `firstDueDate`, `system = PRICE`, `outstandingCents`, `lateFeePct`, `lateInterestMonthlyPct`, `accountId`, `status`) e `LoanInstallment` (`number`, `dueDate`, `principalCents`, `interestCents`, `amountCents`, `status`, `paidAt`, `paidAmountCents`, `lateChargesCents`, `transactionId`). O ledger (F1-01) expõe `limitUsage` e posições por conta.

## Comportamento esperado
Convenção: taxa mensal como **fração** (`0.02` = 2% a.m.); dinheiro em centavos inteiros com arredondamento `Math.round` (meio para cima) em cada passo; datas de calendário meio-dia UTC; funções recebem `now`.

### Domínio puro — `src/server/modules/debts/domain/`
- `price.ts`
  - `priceInstallment({ principal, monthlyRate, installments })`: `PMT = P·i / (1 − (1+i)^−n)`; `i = 0` => `round(P/n)`. Ex.: principal 1.000.000 (R$ 10.000,00), 2% a.m., 12 parcelas => **94560** (R$ 945,60).
  - `buildAmortizationSchedule({ principal, monthlyRate, installments, firstDueDate, installmentAmount? })`: para cada parcela k: `interest = round(saldo · i)`, `amortization = pmt − interest`, `saldo -= amortization`; **a última parcela ajusta** o resíduo (`amortization = saldo restante`, `amount = amortization + interest`) para zerar o saldo. Se `installmentAmount` (valor real do contrato) for informado, usa-o como PMT em vez do calculado (e ajusta a última). Datas: `firstDueDate` + (k−1) meses com `addMonthsClamped` (mesma função da F1-03, importada do módulo `cards/domain` ou promovida a `src/lib/dates.ts` — preferir promover e referenciar nas duas).
  - `impliedMonthlyRate({ principal, installmentAmount, installments })`: taxa que torna `PMT(i) = installmentAmount` (bissecção em `[0, 1]`, tolerância 1e-9, até 200 iterações). Ex.: 1.000.000, 94560, 12 => ≈ 0,02 (erro < 1e-6). Retorna `0` se `installmentAmount * installments <= principal`.
  - `outstandingBalance(schedule, paidCount)`: saldo devedor após `paidCount` parcelas pagas.
- `late-charges.ts`
  - `daysLate(dueDate, payDate)`: dias de calendário (>= 0).
  - `lateCharges({ amount, dueDate, payDate, lateFeePct = 0.02, lateInterestMonthly = 0.01 })` => `{ fee, interest, total, days }`: `fee = round(amount · lateFeePct)` (única, se `days > 0`); `interest = round(amount · lateInterestMonthly · days / 30)` (mora pro rata die, mês comercial de 30 dias). Ex.: parcela 94560, 10 dias de atraso, 2% + 1% a.m. => fee 1891, interest 315, total 2206, valor a pagar **96766**.
  - `installmentStatus(installment, now)` => `PAID | OVERDUE | PENDING | SKIPPED` (calculado na leitura; `OVERDUE` quando `dueDate < hoje` e não pago).
- `overdraft.ts`
  - `overdraftMonthlyCost({ used, monthlyRate, iofMonthly = 0 })` = `round(used · (monthlyRate + iofMonthly))`. Ex.: uso 50000 a 8% a.m. => **4000** (R$ 40,00).
  - `estimateOverdraftCostFromSeries({ dailyBalances: {date, balance}[], overdraftLimit, monthlyRate })`: soma diária `max(0, min(-balance, limit)) · (monthlyRate / 30)` (juros simples diários, documentado como **estimativa**; o banco calcula por convenção própria) — usada para "quanto o cheque especial me custou este mês".
- `revolving.ts`
  - `revolvingMonthlyCost({ unpaid, monthlyRate, originalPrincipal?, interestAlreadyCharged?, capMultiple = 1 })`: `round(unpaid · rate)` limitado de modo que `interestAlreadyCharged + custo <= originalPrincipal · capMultiple` (teto legal de juros e encargos de 100% do valor original da dívida do cartão; **configurável**, informado como parâmetro). Ex.: não pago 100000 a 12% a.m. => 12000.
- `payoff.ts`
  - `monthsToPayoff({ balance, monthlyRate, monthlyPayment })`: `n = −ln(1 − i·B/P) / ln(1+i)` arredondado para cima; `Infinity` se `P <= round(B·i)` (nunca quita); `i = 0` => `ceil(B/P)`. Ex.: 100000, 2%, 10000 => 12 meses; 100000, 2%, 2000 => `Infinity`.
  - `payoffDate(from, months)`.
- `rate.ts`
  - `annualEquivalent(monthlyRate)` = `(1+i)^12 − 1`. Ex.: 2% => 26,82%.
  - `rankDebtsByRate(debts)`: ordena por `monthlyRate` desc; desempate por `monthlyCost` desc, depois por `outstanding` desc, depois por `id` (estável). Efeito esperado nos dados típicos: rotativo (12%) > cheque especial (8%) > Pix no crédito/limite convertido (7%) > consignado (1,9%); a ordem **sempre vem da taxa**, não do tipo.
- `summary.ts`: `summarizeDebt(input, now)` devolve `DebtSummary { id, kind, name, outstanding, monthlyRate, annualRate, monthlyInterestCost, nextInstallment? { number, dueDate, amount, status, lateCharges, amountDueNow }, installmentsLeft, payoffDate | null, overdueCount, overdueAmount }`:
  - Parcelado (`CONSIGNADO`, `PERSONAL`, `PIX_CREDIT`, `CARD_REFINANCE`): `monthlyInterestCost = round(outstanding · i)` (juros embutidos na próxima parcela); `payoffDate` = vencimento da última parcela pendente.
  - `OVERDRAFT`: `outstanding = used` (do ledger); `monthlyInterestCost = overdraftMonthlyCost`; `payoffDate = null` salvo `plannedMonthlyPayment` informado (então `monthsToPayoff`).
  - `CARD_REVOLVING`: `outstanding = open` da fatura em atraso/rotativo; `monthlyInterestCost = revolvingMonthlyCost`.

### Aplicação — `src/server/modules/debts/application/`
- `createLoan(input)`: valida por `kind`: parcelados exigem `principalCents`, `installmentCount (1..120)`, `firstDueDate`, e `monthlyRate` **ou** `installmentAmountCents` (se só vier a parcela, calcula `monthlyRate` por `impliedMonthlyRate`); `OVERDRAFT`/`CARD_REVOLVING` exigem `monthlyRate` e `accountId` (conta de cheque especial/cartão); grava `Loan` + `LoanInstallment[]` (cronograma de `buildAmortizationSchedule`) e `outstandingCents` na mesma transação. Aceita contrato já em andamento: `alreadyPaidInstallments` marca as primeiras como `PAID` (sem lançamento) e ajusta o saldo.
- `registerInstallmentPayment({ loanId, number, payDate, accountId, amountPaid? })`: calcula `lateCharges`; cria no ledger um lançamento `EXPENSE` (valor da parcela, categoria `parcelas-emprestimos`) e, se houver atraso, lançamentos `INTEREST`/`FEE` separados (categorias `juros-encargos`/`multas-atrasos`) — **todos via use-case do ledger**; preenche `LoanInstallment` (`status = PAID`, `paidAt`, `paidAmountCents`, `lateChargesCents`, `transactionId` da parcela principal); recalcula `outstandingCents`; se a última parcela for paga, `Loan.status = PAID_OFF`. Pagamento fora de ordem é permitido (sinaliza), mas parcela já paga => `INSTALLMENT_ALREADY_PAID`.
- `listDebts(userId, { now })`: carrega `Loan`s ativos, junta uso de cheque especial (ledger) e rotativo/fatura; devolve `DebtSummary[]` já ordenado por `rankDebtsByRate`, mais totais `{ totalOutstanding, totalMonthlyInterestCost, overdueAmount }`.
- `getDebtDetail(loanId)`: cronograma com status calculado e encargos de atraso de cada parcela vencida.
- `simulatePayoff({ loanId, extraMonthlyPayment?, lumpSum? })`: devolve nova data/meses e juros economizados (usa `buildAmortizationSchedule` e `monthsToPayoff`); somente leitura.
- `estimateOverdraftCost(userId, accountId, { month })`: lê o saldo diário do ledger (reconstruído por lançamentos) e aplica `estimateOverdraftCostFromSeries` com a taxa da dívida `OVERDRAFT` da conta.
- `listPendingDebtObligations(userId, { until, now })`: parcelas `PENDING|OVERDUE` com vencimento `<= until` e valor devido agora (inclui encargos de atraso) — contrato consumido pelo engine Disponível (F3-02).
- `updateLoan`, `archiveLoan` (`status`), `deleteLoan` (somente sem parcelas pagas).
- Rotas finas: `GET/POST /api/debts`, `GET/PATCH/DELETE /api/debts/[id]`, `POST /api/debts/[id]/installments/[number]/pay`, `GET /api/debts/[id]/simulate`, `GET /api/debts/summary`.

## Regras de negócio
- RN-01: Valores em centavos inteiros; taxas como fração mensal; arredondamento `Math.round` por parcela; a **última parcela fecha o saldo a zero**.
- RN-02: Sistema Price: parcela fixa; juros de cada parcela = saldo devedor anterior × taxa mensal; amortização = parcela − juros.
- RN-03: Se o usuário informar o valor real da parcela do contrato, ele prevalece sobre o PMT calculado (CET/IOF/seguros mudam a parcela); a taxa mensal pode ser inferida (`impliedMonthlyRate`).
- RN-04: Atraso: multa única de `lateFeePct` (default 2%) + juros de mora de `lateInterestMonthlyPct` (default 1% a.m.) pro rata die sobre o valor da parcela; ambos configuráveis por contrato.
- RN-05: Cheque especial: custo mensal estimado = uso × taxa mensal configurável (+ IOF opcional); é **estimativa** (o banco pode usar outra convenção); uso vem do ledger.
- RN-06: Rotativo: custo mensal = não pago × taxa, respeitado o teto de encargos de 100% do valor original (parâmetro `capMultiple`).
- RN-07: Pix no crédito e limite convertido em saldo são empréstimos parcelados (`PIX_CREDIT`) tratados como Price com taxa informada.
- RN-08: A ordenação de prioridade vem exclusivamente da taxa mensal efetiva (`rankDebtsByRate`), com desempates determinísticos.
- RN-09: Parcela atrasada permanece como compromisso do ciclo com o valor corrigido (principal + encargos até hoje).
- RN-10: Pagamento de parcela gera lançamentos no ledger apenas via use-cases do ledger; juros/multa pagos em atraso ficam em lançamentos próprios (`INTEREST`/`FEE`) para alimentar o relatório "juros pagos" (F6-03).
- RN-11: Nenhum valor real em testes/exemplos; usar valores redondos fictícios.

## Critérios de aceitação
- [ ] CA-01: `priceInstallment({ principal: 1000000, monthlyRate: 0.02, installments: 12 })` = 94560; com `monthlyRate: 0` e 12 parcelas de 1.000.000 => 83333.
- [ ] CA-02: `buildAmortizationSchedule(1000000, 0.02, 12)`: parcela 1 tem juros 20000 e amortização 74560; Σ amortizações = 1000000 exatamente; saldo final = 0; só a última parcela difere das demais (ajuste de resíduo, diferença <= 12 centavos).
- [ ] CA-03: `impliedMonthlyRate({ principal: 1000000, installmentAmount: 94560, installments: 12 })` está em `[0.019999, 0.020001]`; para `installmentAmount * installments <= principal` retorna 0.
- [ ] CA-04: `lateCharges({ amount: 94560, dueDate: 2026-10-01, payDate: 2026-10-11 })` => `{ fee: 1891, interest: 315, total: 2206, days: 10 }`; pagamento no dia do vencimento ou antes => tudo zero.
- [ ] CA-05: `overdraftMonthlyCost({ used: 50000, monthlyRate: 0.08 })` = 4000; `used = 0` = 0; `estimateOverdraftCostFromSeries` com saldo -50000 por 30 dias a 8% a.m. ≈ 4000 (±1 centavo por arredondamento) e com saldo positivo = 0; a parte do saldo negativo que excede `overdraftLimit` **não** entra na estimativa (é reportada à parte como excedente, vinda do ledger).
- [ ] CA-06: `revolvingMonthlyCost({ unpaid: 100000, monthlyRate: 0.12 })` = 12000; com `originalPrincipal: 100000`, `interestAlreadyCharged: 95000`, `capMultiple: 1` => 5000 (limitado pelo teto).
- [ ] CA-07: `monthsToPayoff({ balance: 100000, monthlyRate: 0.02, monthlyPayment: 10000 })` = 12; com pagamento 2000 => `Infinity`; com taxa 0 e pagamento 30000 => 4.
- [ ] CA-08: `annualEquivalent(0.02)` ≈ 0.2682 (4 casas); `annualEquivalent(0)` = 0.
- [ ] CA-09: `rankDebtsByRate` com rotativo 12%, cheque especial 8%, Pix no crédito 7% e consignado 1,9% devolve nessa ordem; duas dívidas com a mesma taxa são desempatadas por custo mensal e depois por saldo; a função não muta a entrada.
- [ ] CA-10: `createLoan` de consignado (principal 1.000.000, parcela informada 94560, 12 parcelas, 1ª parcela em 2026-11-05) grava 12 `LoanInstallment` com datas mensais (2026-11-05 ... 2027-10-05), Σ `principalCents` = 1000000, `outstandingCents` = 1000000 e `monthlyRate` inferida ≈ 0.02; com `alreadyPaidInstallments = 3`, as 3 primeiras ficam `PAID`, `outstandingCents` = saldo após 3 parcelas.
- [ ] CA-11: Parcela com vencimento dia 31 em contrato começando em 2026-01-31 gera vencimentos 2026-02-28, 2026-03-31, 2026-04-30 (clamp sem acúmulo).
- [ ] CA-12: `registerInstallmentPayment` de uma parcela atrasada em 10 dias cria 3 lançamentos no ledger (parcela `EXPENSE` -94560 na categoria `parcelas-emprestimos`, `FEE` -1891 e `INTEREST` -315), marca a parcela `PAID` com `lateChargesCents = 2206`, `paidAmountCents = 96766`, e a conta de débito reduz exatamente 96766; pagar de novo retorna `INSTALLMENT_ALREADY_PAID`; pagar a última marca `Loan.status = PAID_OFF`.
- [ ] CA-13: `listDebts` com 4 dívidas (consignado, cheque especial em uso 50000 a 8%, rotativo, Pix no crédito) devolve a ordem por taxa, `monthlyInterestCost` em R$ (centavos) de cada uma e totais coerentes; cheque especial sem uso não aparece (ou aparece com custo 0, decisão registrada).
- [ ] CA-14: `listPendingDebtObligations` inclui parcelas atrasadas com `amountDueNow` = principal + encargos até `now` e exclui as pagas.
- [ ] CA-15: `simulatePayoff` com `extraMonthlyPayment` reduz meses e juros totais em relação à linha de base (valores calculados no teste).
- [ ] CA-16: Todos os testes de domínio passam com `TZ=America/Sao_Paulo` e `TZ=UTC`; `rg prisma src/server/modules/debts/domain` vazio; `rg "new Date\(\)" src/server/modules/debts/domain` vazio.
- [ ] CA-17: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.

## Impacto técnico
### Backend
`src/server/modules/debts/{domain,application,infra,http}`; domínio: `price.ts`, `late-charges.ts`, `overdraft.ts`, `revolving.ts`, `payoff.ts`, `rate.ts`, `summary.ts`; infra: `prisma-loan-repository.ts` e repositório em memória; HTTP: Zod (`createLoanSchema`, `payInstallmentSchema`) e rotas finas. Promover `addMonthsClamped` para `src/lib/dates.ts` e importar em `cards` e `debts`.
### Frontend
Nenhum (F3-05).
### Banco de dados
Tabelas `loans` e `loan_installments` da F0-02; sem migration. `Decimal` convertido com `.toNumber()` apenas na borda do repositório.
### Integrações
Leitura do ledger (uso do cheque especial e fatura em aberto) e escrita via use-cases do ledger.
### Segurança
`userId` em tudo; validação Zod; nenhum contrato real nos testes; nome do credor é texto livre (`lenderName`) e não deve conter documentos — a validação rejeita sequências de dígitos longas (>= 11) no nome para evitar CPF/CNPJ/conta digitados por engano.

## Plano de implementação
- [ ] Etapa 1 — Ler ADR-028, §4.4/§5/§6 da especificação, F1-01 (ledger), F1-03 (clamp de datas) e o schema 2.0 (`Loan`, `LoanInstallment`).
- [ ] Etapa 2 — Promover `addMonthsClamped` para `src/lib/dates.ts` (se ainda estiver em `cards/domain`), com testes.
- [ ] Etapa 3 — Domínio: `price.ts`, `rate.ts`, `payoff.ts`, `late-charges.ts`, `overdraft.ts`, `revolving.ts`, `summary.ts` com testes por tabela (todos os números dos critérios).
- [ ] Etapa 4 — Repositório (porta + em memória) e use-cases `createLoan`, `listDebts`, `getDebtDetail`, `simulatePayoff`.
- [ ] Etapa 5 — `registerInstallmentPayment` integrando o ledger; `listPendingDebtObligations`; `estimateOverdraftCost`.
- [ ] Etapa 6 — Zod e rotas finas; teste de integração em banco de teste (atomicidade do pagamento com 3 lançamentos).
- [ ] Etapa 7 — Docs `docs/domain/dividas.md` (fórmulas, convenções e limites de estimativa), `.agents/context/CONTEXT.md`, `PLANS.md`; commit `feat(f1-dividas): juros price, cheque especial, rotativo e ranking por taxa`.

## Estratégia de testes
- [ ] Unitários (Price): 12 parcelas a 2% (945,60), 1 parcela (PMT = P·(1+i)), taxa 0, 120 parcelas, principal pequeno (R$ 1,00 em 3x), valores grandes (R$ 1.000.000,00); soma de amortizações sempre igual ao principal.
- [ ] Unitários (taxa implícita): idas e voltas `rate -> PMT -> rate` para taxas 0,5%, 1,9%, 2%, 7%, 12%; casos degenerados (parcela × n <= principal; principal 0).
- [ ] Unitários (atraso): 0, 1, 10, 30, 365 dias; multa só uma vez; mês de 28/31 dias não altera (pro rata sobre 30); `lateFeePct` e mora personalizados.
- [ ] Unitários (cheque especial/rotativo): uso 0; uso igual ao limite; excedente além do limite; série diária com alternância positivo/negativo; teto de 100% atingido.
- [ ] Unitários (prazo): taxa 0; pagamento igual aos juros (infinito); pagamento maior que o saldo (1 mês); arredondamentos de `ceil`.
- [ ] Unitários (ranking): 4 dívidas típicas; empate de taxa; lista vazia; 1 item; imutabilidade.
- [ ] Integração (repositório em memória): criar contrato em andamento; pagar parcelas em ordem e fora de ordem; pagar atrasada; quitar; apagar contrato com parcela paga (erro).
- [ ] Integração (banco de teste): atomicidade do pagamento (falha no 3º lançamento desfaz tudo).
- [ ] E2E: não aplicável.
- [ ] Manual: cadastrar um consignado fictício e um cheque especial via `curl`, listar `/api/debts` e conferir ordem e custos.

## Riscos e rollback
- **Convenção de juros do banco difere** (dias corridos, base 360/365, IOF diário, capitalização): o módulo oferece **estimativa transparente** com parâmetros (`monthlyRate`, `iofMonthly`) e o valor real da parcela informado pelo usuário prevalece. Documentar a limitação na UI (F3-05).
- **Taxa implícita incorreta** se o usuário informar parcela incluindo seguro/tarifas: mostrar a taxa inferida como "efetiva".
- **Escopo**: se estourar, dividir em `F1-05a` (engine pura + `listDebts`) e `F1-05b` (pagamento integrado ao ledger).
- Rollback: `git revert`; sem migration; dados criados em testes são descartáveis.

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
