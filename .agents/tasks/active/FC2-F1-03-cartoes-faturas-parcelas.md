---
id: FC2-F1-03
title: "Cartões: ciclo de fatura, compras/parcelas, pagamento, mover, estorno"
status: active
type: feature
phase: F1
wave: 2
owner: dominio-financeiro
depends_on: [FC2-F1-01, FC2-F1-09]
created_at: 2026-10-05
updated_at: 2026-10-06
affected_modules: [cards, ledger]
related_use_cases: [createCardPurchase, payStatement, moveTransactionToStatement, refundCardTransaction, advanceInstallments, syncCardStatuses, getStatementDetail, listStatements]
related_adrs: [ADR-008, ADR-019, ADR-004, ADR-002, ADR-025]
---

# FC2-F1-03 — Cartões: ciclo de fatura, compras/parcelas, pagamento, mover, estorno

## Contexto
O dono tem vários cartões com ciclos diferentes (fechamento/vencimento distintos), limites baixos e compras parceladas. A lógica de ciclo de fatura do 1.x é boa e testada (ADR-008) e deve ser reaproveitada; o resto do módulo de cartões do 1.x (`billing.ts`, `credit-card-purchases/use-cases.ts`) foi escrito sobre o modelo antigo (`type`, valores positivos, `creditCardStatementId`) e tem bugs conhecidos. No 2.0 o cartão é uma `Account` do tipo `CREDIT_CARD` cujo saldo no ledger é negativo (dívida); a fatura é um agrupamento de lançamentos da conta de cartão por `statementId`/`statementKey`.

A F0-01 moveu `statement-cycle.ts` (+ teste) para `src/server/modules/cards/domain/` e extraiu `splitAmountIntoInstallments`/`buildInstallmentSchedule` para `cards/domain/installments.ts` (+ teste), sem alterar comportamento. O código 1.x completo está em `git show fc-1.x-final:src/...` (caminho completo do arquivo).

## Problema
1. **Estorno não abate a fatura**: `refreshCreditCardStatement` em `src/server/modules/finance/application/credit-card/billing.ts` (linha 57) soma como `totalAmount` apenas lançamentos `type === 'EXPENSE'` e como `paidAmount` apenas `TRANSFER`; um estorno (receita no cartão) é ignorado, a fatura continua cheia.
2. **Parcelas no dia 29/30/31**: `addMonthsPreservingDay` (em `credit-card-purchases/use-cases.ts`) faz `new Date(y, m + n, d)`; para dia 31 em mês curto o JavaScript "transborda" para o mês seguinte (31/01 + 1 mês = 03/03), desalinhando a parcela de fevereiro.
3. **Relógio e fuso**: `getCreditCardStatementStatus` usa `new Date()` internamente (não testável) e `getCreditCardStatementCycle` constrói datas em fuso local (`new Date(year, month, day, ...)`), enquanto o projeto exige meio-dia UTC (ADR-002).
4. Não há como mover um lançamento para outra fatura (o banco às vezes lança na fatura seguinte) nem pagar fatura como `CARD_PAYMENT` no ledger novo.
5. Fatura calculada por refresh em cada escrita (N+1) e sem `statementKey` estável para casar com importação (F4).

## Objetivo
Módulo `src/server/modules/cards/` completo sobre o ledger 2.0:
1. Domínio puro: ciclo (UTC, relógio injetável), `statementKey`, status, parcelas corrigidas, totais líquidos da fatura.
2. Compras (à vista e parceladas) que geram lançamentos no ledger e vinculam à fatura correta.
3. Pagamento de fatura como par `CARD_PAYMENT` (total ou parcial), com aviso de cheque especial.
4. Mover lançamento entre faturas, estorno que abate a fatura, antecipação de parcelas (reaproveitada do 1.x).
5. Transição de status por data (PLANNED -> PENDING -> CLEARED) com função idempotente chamável por job/leitura.

## Fora de escopo
- Tela Cartões (FC2-F3-06) e pagamento por UI (usa estes use-cases).
- Importação de fatura PDF e casamento por `statementKey` (F4-02/F4-04) — aqui só se garante a chave.
- Crédito rotativo, juros da fatura e Pix no crédito (FC2-F1-05).
- Cron diário (F3-01): apenas expor `syncCardStatuses`.
- Compra parcelada via wishlist (o 1.x tinha `wishlistItemId`; no 2.0 a wishlist é meta `WISH`).

## Comportamento atual (1.x e o que foi preservado)
- `statement-cycle.ts` (preservado em `cards/domain/`): `getCreditCardStatementCycle({transactionDate, closingDay, dueDay})` devolve `periodStart`, `periodEnd`/`closingDate` (23:59:59.999), `dueDate`; compra com data **até o dia de fechamento inclusive** cai na fatura que fecha naquele dia (`txDate > closingDate` empurra para o mês seguinte); dia de vencimento `<= ` dia de fechamento vence no mês seguinte; dias inexistentes no mês são limitados ao último dia (`buildMonthDate`); `getCreditCardStatementStatus` devolve `PAID | OVERDUE | CLOSED | OPEN` conforme `totalAmount`, `paidAmount`, `closingDate`, `dueDate` e `new Date()`; `isCreditCardBillingConfigured`.
- `billing.ts`: `upsertCreditCardStatementForDate` (upsert por `accountId_periodStart`), `refreshCreditCardStatement` (soma e status), `syncCreditCardTransactionStatement`, `syncCreditCardStatementsForAccount`.
- `credit-card-purchases/use-cases.ts` (580 linhas): `createCreditCardPurchase` (1 lançamento por parcela + `CreditCardPurchaseInstallment` com `ledgerTransactionId` 1:1), `advanceCreditCardPurchaseInstallments`, `deleteCreditCardPurchase`, `splitAmountIntoInstallments` (resto distribuído nas primeiras parcelas), limite de 24 parcelas.
- `api/credit-cards/statements/[id]/payments/route.ts`: pagamento = par `TRANSFER` com `transferId`; bloqueia pagar mais que o aberto e conta de origem = cartão.

## Comportamento esperado
### Domínio puro — `src/server/modules/cards/domain/`
- `statement-cycle.ts` (refinado, **sem quebrar os 3 testes originais**): passa a operar com datas de calendário em meio-dia UTC (`Date.UTC(y, m, d, 12)`), expõe `getStatementCycle({ purchaseDate, closingDay, dueDay })` retornando `{ periodStart, closingDate, dueDate, statementKey }`, onde `statementKey = 'YYYY-MM'` do **mês de vencimento** (ADR-008). `closingDate`/`dueDate` são dias de calendário (meio-dia UTC); a regra "compra no dia do fechamento entra na fatura que fecha" é mantida e documentada (configurável em `closingInclusive = true`, default 1.x). Mantém `getCreditCardStatementCycle` como alias deprecado apenas se os testes originais o importarem.
- `statement-status.ts`: `getStatementStatus({ closingDate, dueDate, totalAmount, paidAmount, now })` com `now` **injetado**; `OPEN` (antes do fechamento), `CLOSED` (após fechar, antes de vencer ou sem saldo aberto vencido), `OVERDUE` (venceu e aberto > 0), `PAID` (total > 0 e aberto = 0); fatura com total <= 0 após estornos: `PAID` se fechada, `OPEN` se aberta.
- `installments.ts` (corrigido): `addMonthsClamped(date, n)` limita o dia ao último dia do mês de destino (31/01 + 1 mês = 28/02 ou 29/02; 30/01 + 1 = fim de fevereiro; 31/03 + 1 = 30/04); `buildInstallmentSchedule` usa a data da **compra** como âncora para todas as parcelas (parcela n = compra + (n-1) meses, sempre com o dia original limitado ao mês), evitando acúmulo de clamp (31/01, 28/02, 31/03, 30/04). `splitAmountIntoInstallments` mantido (resto nas primeiras parcelas). Limite configurável `MAX_INSTALLMENTS = 24` (constante exportada).
- `statement-totals.ts`: `computeStatementTotals(txns)`: `charges = -Σ amount` de lançamentos da conta de cartão **na fatura** com kind `EXPENSE | FEE | INTEREST | ADJUSTMENT(negativo)`; `credits = Σ amount` de `INCOME` (estornos) e `ADJUSTMENT` positivo; `net = charges - credits` (pode ser negativo = crédito a favor); `paid = Σ amount` das pernas `CARD_PAYMENT` positivas no cartão ligadas à fatura; `open = max(0, net - paid)`; `creditBalance = max(0, -(net - paid))`. Estorno **abate** a fatura (corrige o bug de `billing.ts:57`).
- `refund.ts`: `refundableAmount(original, previousRefunds)` e `validateRefund`.
- `payment.ts`: `suggestPaymentAccount(accounts)`: entre contas `CHECKING`/`WALLET`/`SAVINGS` (e opcionalmente `BUSINESS`) não arquivadas, a de maior `available = max(0, current) + (overdraftLimit - used)`; empate por menor uso do limite; devolve `null` se não houver. `overdraftWarning(sourcePosition, amount)` -> `{ willUseOverdraft, usedAfter, excessAfter }` usando `limitUsage` do ledger.

### Convenção de status no ledger para contas de cartão
- Lançamento com data futura (parcelas ainda não vencidas no calendário de compra): `PLANNED`.
- Lançamento com `date <= hoje` em fatura **aberta**: `PENDING`.
- Lançamento em fatura **fechada** (após `closingDate`): `CLEARED`.
- Pagamento de fatura: perna do cartão `CLEARED`; perna da origem `CLEARED` (ou `PENDING` se a data é futura -> `PLANNED`).
- `syncCardStatuses(userId, now)` (idempotente): promove `PLANNED -> PENDING` quando `date <= hoje`, `PENDING -> CLEARED` quando a fatura fecha, atualiza `CreditCardStatement.status/totalAmount/paidAmount` em lote (uma passada por cartão, sem N+1) e cria faturas ausentes das datas futuras apenas sob demanda. Também é chamada de forma preguiçosa por `listStatements`. A semântica de uso do limite: `usado = -(cleared + pending + planned)` (inclui parcelas futuras, como no banco); a F1-01 já calcula.

### Use-cases (`src/server/modules/cards/application/`)
- `createCardPurchase({ accountId, amount, installmentCount, date, description, categoryId?, merchantId?, notes?, source })`: valida `CREDIT_CARD` configurado (`creditLimit`, `closingDay`, `dueDay`), `1 <= installmentCount <= MAX_INSTALLMENTS`, `amount > 0`; em uma `$transaction`: cria `CardPurchase`, e para cada parcela cria lançamento `EXPENSE` negativo (via ledger) com `statementId`/`statementKey` calculados do `date` da parcela (upsert da fatura por `accountId_statementKey`), `CardInstallment` 1:1 com `ledgerTransactionId`; status conforme convenção acima; atualiza `AccountBalance` e totais das faturas tocadas. Devolve `{ purchase, transactions, statements, limitWarning? }` (`LIMIT_EXCEEDED` quando o novo uso passa do `creditLimit`; **informativo, não bloqueia**).
- `payStatement({ statementId, sourceAccountId, amount, date, description? })`: valida origem != cartão, origem não é `CREDIT_CARD`, `amount > 0` e `amount <= open` (excedente -> `STATEMENT_OVERPAYMENT`; fatura quitada -> `STATEMENT_ALREADY_PAID`); cria par `CARD_PAYMENT` via `createTransfer` do ledger (`-amount` na origem, `+amount` no cartão com `statementId`); atualiza `paidAmount`/status; devolve `overdraftWarning`. Pagamento parcial permitido.
- `moveTransactionToStatement({ transactionId, targetStatementKey })`: só lançamentos de cartão (`EXPENSE|FEE|INTEREST|INCOME` com `statementId`); fatura alvo deve existir ou ser criável (data coerente com o ciclo do cartão) e **não estar `PAID`**; muda `statementId`/`statementKey`, marca `userLocked.statement = true` para a re-sincronização não devolver o lançamento ao ciclo original; recalcula as duas faturas; não altera `date` nem o saldo da conta. Para parcela de compra parcelada move apenas aquela parcela.
- `refundCardTransaction({ originalTransactionId, amount, date, statementKey? })`: cria `INCOME` **positivo** na conta de cartão com `refundOfId = original`, categoria herdada, na fatura do ciclo da `date` do estorno (ou `statementKey` informado); valida `amount <= refundableAmount`; recalcula a fatura (estorno abate o total). Estorno maior que o total da fatura deixa `creditBalance > 0` (o saldo do cartão no ledger continua correto); o crédito é compensado automaticamente na próxima fatura via `computeStatementTotals` quando houver cobranças (decisão: **crédito não é rolado como lançamento**, só exibido; registrar em Decisões).
- `advanceInstallments({ purchaseId, installmentNumbers[], date, discountAmount })`: reaproveita o conceito do 1.x (`CardInstallmentAdvance`): paga parcelas futuras com desconto, move-as para a data/fatura corrente e registra `totalOriginalAmount`, `totalPaidAmount`, `totalDiscountAmount`; o desconto vira `INCOME`/`ADJUSTMENT` positivo na fatura. Porta fiel da lógica do 1.x (`git show fc-1.x-final:src/server/modules/finance/application/credit-card-purchases/use-cases.ts`, função `advanceCreditCardPurchaseInstallments`), adaptada ao ledger assinado.
- `deleteCardPurchase(purchaseId)`: apaga compra, parcelas e lançamentos (via ledger) se nenhuma parcela está em fatura `PAID`; senão `PURCHASE_HAS_PAID_INSTALLMENTS`.
- `listStatements(accountId)`, `getStatementDetail(statementId)` (itens, totais, `open`, `creditBalance`, dias para vencer), `getCardSummary(accountId)` (`limit`, `used`, `available`, fatura atual, próxima, parcelas ativas) — todos somente leitura.
- Rotas finas: `POST /api/cards/[accountId]/purchases`, `GET /api/cards/[accountId]/statements`, `GET /api/statements/[id]`, `POST /api/statements/[id]/payments`, `POST /api/transactions/[id]/move-statement`, `POST /api/transactions/[id]/refund`, `POST /api/purchases/[id]/advance`, `DELETE /api/purchases/[id]`.

## Regras de negócio
- RN-01: Valores em centavos; lançamentos de cartão são assinados (compra negativa, estorno positivo, pagamento positivo na perna do cartão).
- RN-02: A fatura é identificada por `statementKey = YYYY-MM` do mês de **vencimento** (ADR-008); `@@unique([accountId, statementKey])`.
- RN-03: Compra com data até o dia de fechamento (inclusive) entra na fatura que fecha naquele dia; depois, na seguinte. Se `dueDay <= closingDay`, o vencimento é no mês seguinte ao do fechamento. Dias 29/30/31 são limitados ao último dia do mês.
- RN-04: A parcela n de uma compra vence na data da compra + (n-1) meses (âncora na data original, dia limitado ao mês) e cai na fatura do ciclo dessa data.
- RN-05: Estorno **abate** a fatura (`net = cobranças - créditos`); `open = max(0, net - pago)`; sobra vira `creditBalance` informativo.
- RN-06: Pagamento de fatura é `CARD_PAYMENT` em par ligado (ADR-004); parcial permitido; não pode exceder o aberto; origem diferente do cartão e não-cartão.
- RN-07: Pagar com conta que ficará negativa **avisa** (`willUseOverdraft`) mas não bloqueia.
- RN-08: Mover lançamento entre faturas não altera data nem saldo; marca `userLocked.statement`; fatura `PAID` não recebe nem cede lançamentos.
- RN-09: Uso do limite do cartão inclui parcelas futuras; exceder o limite é informado, não bloqueado.
- RN-10: Máximo de 24 parcelas (constante); `installmentCount = 1` é compra à vista.
- RN-11: Toda mutação passa pelo use-case do ledger (atualiza `AccountBalance` na mesma transação); nenhum `prisma.transaction.*` direto em `cards`.
- RN-12: Funções de domínio recebem `now`; nenhum `new Date()` implícito no domínio.

## Critérios de aceitação
- [ ] CA-01: Os 3 testes originais de `statement-cycle.test.ts` continuam passando; novos testes cobrem fechamento dia 31 em fevereiro (29 em bissexto, 28 em comum), `dueDay <= closingDay`, compra exatamente no dia do fechamento, virada de ano (compra em 20/12 com fechamento 10 vence em janeiro) e `statementKey` correto em cada caso.
- [ ] CA-02: `buildInstallmentSchedule(R$ 300,00 -> 30000, 3, 2026-01-31)` gera datas 2026-01-31, 2026-02-28, 2026-03-31 (e para 4 parcelas, 2026-04-30); em ano bissexto (2028-01-31) a segunda parcela é 2028-02-29; `splitAmountIntoInstallments(10000, 3)` = `[3334, 3333, 3333]` e a soma é sempre o total.
- [ ] CA-03: Compra de R$ 600,00 em 3x no cartão com fechamento dia 10 e vencimento dia 17, comprada em 2026-10-05, gera 3 lançamentos `EXPENSE` de -20000 (datas 2026-10-05, 2026-11-05, 2026-12-05), três `CardInstallment` 1:1 e faturas `2026-10`, `2026-11`, `2026-12`; o saldo do cartão no ledger fica -60000 e o uso do limite 60000; a primeira parcela é `PENDING` e as demais `PLANNED`.
- [ ] CA-04: **Estorno abate a fatura**: fatura com cobranças de R$ 500,00; estorno de R$ 120,00 (`refundCardTransaction`) -> `net = 38000`, `open = 38000`; estorno parcial seguido de outro que excede o `refundableAmount` retorna `REFUND_EXCEEDS_ORIGINAL`; estorno de R$ 600,00 sobre fatura de R$ 500,00 -> `open = 0`, `creditBalance = 10000`.
- [ ] CA-05: `payStatement` de R$ 200,00 numa fatura de R$ 380,00 -> `paid = 20000`, `open = 18000`, status segue `CLOSED`; pagar R$ 180,00 depois -> `PAID`; pagar R$ 1,00 numa fatura `PAID` -> `STATEMENT_ALREADY_PAID`; pagar mais que o aberto -> `STATEMENT_OVERPAYMENT`; origem = cartão -> erro; origem outro cartão -> erro.
- [ ] CA-06: Pagamento a partir de conta corrente com saldo R$ 100,00, limite de cheque especial R$ 500,00 e pagamento de R$ 300,00 grava os dois lançamentos e devolve `overdraftWarning = { willUseOverdraft: true, usedAfter: 20000, excessAfter: 0 }`.
- [ ] CA-07: `suggestPaymentAccount` entre 3 contas escolhe a de maior `available`; ignora arquivadas e cartões; devolve `null` sem candidatas.
- [ ] CA-08: `moveTransactionToStatement` leva uma compra da fatura `2026-10` para `2026-11`; totais das duas faturas recalculados; `date` e saldo da conta inalterados; mover para fatura `PAID` ou de outro cartão retorna erro; após `syncCardStatuses`, o lançamento **permanece** na fatura escolhida (`userLocked.statement`).
- [ ] CA-09: `syncCardStatuses` com `now` fixo promove `PLANNED -> PENDING` (data <= hoje) e `PENDING -> CLEARED` (fatura fechou), é idempotente (segunda chamada sem mudanças) e atualiza `AccountBalance` coerentemente (`rebuildAccountBalance` não altera nada).
- [ ] CA-10: `advanceInstallments` de 2 parcelas de R$ 200,00 (totalOriginal 40000) pagas por R$ 380,00 registra `totalDiscountAmount = 2000`, move as parcelas para a fatura corrente e o desconto aparece como crédito na fatura (porta do comportamento 1.x, coberta por teste equivalente ao `records an advance...` do 1.x).
- [ ] CA-11: `deleteCardPurchase` com uma parcela em fatura `PAID` retorna `PURCHASE_HAS_PAID_INSTALLMENTS` e não altera nada; sem parcelas pagas, remove compra, parcelas e lançamentos e reverte o saldo.
- [ ] CA-12: Compra que ultrapassa o `creditLimit` é gravada e retorna `limitWarning: 'LIMIT_EXCEEDED'`.
- [ ] CA-13: Todos os testes de domínio passam com `TZ=America/Sao_Paulo` e `TZ=UTC`; `rg "new Date\(\)" src/server/modules/cards/domain` não encontra uso implícito de relógio; `rg prisma src/server/modules/cards/domain` vazio.
- [ ] CA-14: `npm run lint`, `npm test`, `npx next build`, `npm run format:check` passam.

## Impacto técnico
### Backend
`src/server/modules/cards/{domain,application,infra,http}`. Domínio: `statement-cycle.ts`, `statement-status.ts`, `installments.ts`, `statement-totals.ts`, `refund.ts`, `payment.ts` (+ testes). Aplicação: `create-card-purchase.ts`, `pay-statement.ts`, `move-transaction-to-statement.ts`, `refund-card-transaction.ts`, `advance-installments.ts`, `delete-card-purchase.ts`, `sync-card-statuses.ts`, `list-statements.ts`, `get-statement-detail.ts`, `get-card-summary.ts`. Infra: `prisma-card-repository.ts` (faturas, compras, parcelas), reutilizando o repositório do ledger passando o cliente transacional. Rotas finas conforme acima.
### Frontend
Nenhum (F3-06).
### Banco de dados
Tabelas da F0-02: `credit_card_statements` (com `statement_key`), `card_purchases`, `card_installments`, `card_installment_advances`, `transactions` (`statement_id`, `statement_key`, `refund_of_id`, `user_locked`). Sem migration; pendência para dados-prisma se faltar índice `[statementId]`/`[accountId, statementKey]`.
### Integrações
Nenhuma. A chave `statementKey` é o contrato com a importação de faturas (F4-02/F4-04).
### Segurança
`userId` em todas as consultas; validação Zod; ids de outro usuário => 404; valores/exemplos fictícios.

## Plano de implementação
- [ ] Etapa 1 — Ler ADR-008, ADR-019, F1-01 e o código 1.x via `git show fc-1.x-final:...` (`billing.ts`, `statement-cycle.ts`, `credit-card-purchases/use-cases.ts` e seus testes).
- [ ] Etapa 2 — Domínio: refinar `statement-cycle.ts` (UTC, `statementKey`, `closingInclusive`) mantendo os 3 testes; criar `statement-status.ts`, corrigir `installments.ts`, criar `statement-totals.ts`, `refund.ts`, `payment.ts`; testes por tabela.
- [ ] Etapa 3 — Repositório de cartões e porta; repositório em memória para testes.
- [ ] Etapa 4 — `createCardPurchase`, `deleteCardPurchase`, `listStatements`, `getStatementDetail`, `getCardSummary`.
- [ ] Etapa 5 — `payStatement`, `suggestPaymentAccount`, aviso de cheque especial.
- [ ] Etapa 6 — `refundCardTransaction`, `moveTransactionToStatement`, `advanceInstallments`.
- [ ] Etapa 7 — `syncCardStatuses` e chamada preguiçosa; testes de idempotência.
- [ ] Etapa 8 — Schemas Zod e rotas finas; testes de schema.
- [ ] Etapa 9 — Testes de integração em banco de teste (atomicidade, corrida entre dois pagamentos).
- [ ] Etapa 10 — Docs `docs/domain/cartoes.md` (ciclo, estorno, pagamento, status), ADR-008 (nota de atualização: UTC e `statementKey`), `.agents/context/CONTEXT.md`, `PLANS.md`; commit `feat(f1-cartoes): faturas, parcelas, pagamento, mover e estorno`.

## Estratégia de testes
- [ ] Unitários (ciclo): tabela com fechamento 5/10/15/28/31 x vencimento 1/10/17/31 x compras no dia anterior, no dia e no dia seguinte ao fechamento; mês de fevereiro; virada de ano; `statementKey` esperado em cada linha.
- [ ] Unitários (status): `OPEN` antes de fechar; `CLOSED` entre fechar e vencer; `OVERDUE` após vencer com aberto; `PAID` com aberto 0; total negativo (crédito).
- [ ] Unitários (parcelas): 1x, 2x, 12x, 24x, valor não divisível (R$ 100,00 em 3x), valor menor que o número de parcelas (R$ 0,02 em 3x -> `[1,1,0]` é inválido: rejeitar `amount < installmentCount` com `INSTALLMENT_TOO_SMALL`), dia 31, 30, 29/02 bissexto.
- [ ] Unitários (totais): cobranças + tarifas + juros + estorno parcial + pagamento parcial; estorno maior que a fatura; fatura vazia.
- [ ] Unitários (pagamento): `suggestPaymentAccount` (empate, arquivadas, só cartões), `overdraftWarning` (sem uso, com uso, acima do limite).
- [ ] Integração (repositório em memória): compra parcelada ponta a ponta (CA-03), pagamento parcial e total, mover + sync, estorno, antecipação, apagar compra.
- [ ] Integração (banco de teste): atomicidade da compra (falha na parcela 2 desfaz tudo); dois pagamentos concorrentes da mesma fatura não ultrapassam o aberto (um falha).
- [ ] E2E: não aplicável.
- [ ] Manual: via `curl`: criar cartão (F1-02), comprar 3x, pagar parcial, estornar, mover, ver detalhes.

## Riscos e rollback
- **Regra de fechamento varia por banco** (compra no dia do fechamento pode ir para a próxima fatura): o default segue o 1.x; `closingInclusive` fica configurável por cartão numa evolução (registrar em Pendências); importação de fatura (F4) corrige divergências com `moveTransactionToStatement`.
- **Crédito de estorno sem rolagem automática**: simplificação consciente; se a fatura seguinte tiver cobranças, o total líquido já considera o crédito apenas quando o estorno cai dentro dela. Reavaliar na F3-06.
- **Mudança de `closingDay`/`dueDay`** com faturas existentes pode deixar lançamentos "fora" do ciclo novo: manter faturas passadas intactas; só aplicar a lançamentos novos.
- **Complexidade de `advanceInstallments`**: porta do 1.x; se estourar a task, entregar o restante e abrir `FC2-F1-03b` para antecipação (registrar no handoff).
- Rollback: `git revert`; sem migration. O código 1.x permanece em `fc-1.x-final`.

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
