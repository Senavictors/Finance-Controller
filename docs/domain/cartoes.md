---
estado: real
fonte: src/server/modules/cards/ (task FC2-F1-03); decisões em ADR-008, ADR-019, ADR-004, ADR-002, ADR-025
ultima-revisao: FC2-F1-03 2026-10-07
---

# Cartões: faturas, parcelas, pagamento, mover e estorno

O cartão é uma `Account` `CREDIT_CARD` cujo saldo no ledger é **negativo** (dívida). A fatura (`CreditCardStatement`) é um agrupamento dos lançamentos da conta de cartão por `statementId`/`statementKey`. O ledger continua sendo a fonte de verdade (ADR-019): `totalAmount`/`paidAmount`/`status` da fatura são cache, recalculado dentro da mesma transação de cada mutação.

Código: `src/server/modules/cards/{domain,application,infra,http}`. Rotas: `src/app/api/cards/**`, `src/app/api/statements/**`, `src/app/api/purchases/**`, `src/app/api/transactions/[id]/{move-statement,refund}`.

## Ciclo da fatura e `statementKey`

Tudo em dia de calendário ao meio-dia UTC (ADR-002); nenhuma função do domínio lê o relógio ou o fuso do servidor.

- A fatura é identificada por `statementKey = AAAA-MM` do mês de **vencimento** (ADR-008); `@@unique([accountId, statementKey])`. É o contrato com a importação de faturas (F4-02/F4-04): `getStatementCycle`/`getStatementCycleByKey` são exportados em `src/server/modules/cards/index.ts`.
- Compra com data **até o dia de fechamento (inclusive)** entra na fatura que fecha naquele dia; depois, na seguinte (`closingInclusive = true`, padrão do 1.x; configurável por parâmetro, ainda sem coluna por cartão).
- `dueDay <= closingDay` (comparação nominal) vence no mês seguinte ao do fechamento; senão, no mesmo mês.
- Dias 29/30/31 são limitados ao último dia de cada mês (fevereiro: 28 ou 29).
- Virada de ano: compra em 20/12 com fechamento dia 10 fecha em 10/01 e, com vencimento dia 17, tem `statementKey` `2027-01`.

| Fechamento | Vencimento | Compra     | Fecha      | Vence      | `statementKey` |
| ---------- | ---------- | ---------- | ---------- | ---------- | -------------- |
| 10         | 17         | 2026-10-05 | 2026-10-10 | 2026-10-17 | `2026-10`      |
| 10         | 17         | 2026-10-10 | 2026-10-10 | 2026-10-17 | `2026-10`      |
| 10         | 17         | 2026-10-11 | 2026-11-10 | 2026-11-17 | `2026-11`      |
| 10         | 17         | 2026-12-20 | 2027-01-10 | 2027-01-17 | `2027-01`      |
| 25         | 5          | 2026-10-05 | 2026-10-25 | 2026-11-05 | `2026-11`      |
| 31         | 10         | 2027-02-20 | 2027-02-28 | 2027-03-10 | `2027-03`      |

## Parcelas

- `splitAmountIntoInstallments(total, n)`: o resto vai para as primeiras parcelas (`10000` em 3x = `[3334, 3333, 3333]`); a soma é sempre o total. `amount < installmentCount` => `INSTALLMENT_TOO_SMALL`. Máximo `MAX_INSTALLMENTS = 24`.
- `buildInstallmentSchedule`: a parcela n vence na data da **compra** mais (n-1) meses, sempre ancorada na data original com o dia limitado ao mês (`addMonthsClamped`): compra em 31/01 gera 31/01, 28/02, 31/03, 30/04 (em 2028: 29/02). Corrige o bug do 1.x, em que 31/01 + 1 mês transbordava para 03/03.
- Cada parcela é um lançamento `EXPENSE` negativo no ledger, na fatura do ciclo da data da parcela, ligado 1:1 a um `CardInstallment` (`ledgerTransactionId`).

## Status dos lançamentos de cartão

| Situação                                   | Status    |
| ------------------------------------------ | --------- |
| `date` futura (parcela ainda não chegou)   | `PLANNED` |
| `date <= hoje`, fatura aberta              | `PENDING` |
| fatura já fechada (hoje > `closingDate`)   | `CLEARED` |
| pagamento de fatura com data futura / hoje | `PLANNED` / `CLEARED` |

`syncCardStatuses` promove `PLANNED -> PENDING -> CLEARED` por data, é idempotente (segunda chamada sem mudanças), nunca rebaixa nem toca em `RECONCILED`, e recalcula os totais em lote (uma passada por cartão). Também vincula lançamentos sem fatura (`setTransactionLinks` com `actor: 'SYSTEM'`; `userLocked.statement` vence). `listStatements` o chama de forma preguiçosa; o cron diário é da F3-01.

O uso do limite do cartão (`usage.used` do ledger) inclui as parcelas futuras, como no banco; passar do `creditLimit` devolve `limitWarning: 'LIMIT_EXCEEDED'` e **não bloqueia**.

## Totais da fatura (`computeStatementTotals`)

- `charges = -Σ amount` de `EXPENSE | FEE | INTEREST | ADJUSTMENT (negativo)`.
- `credits = Σ amount` de `INCOME` (estorno, desconto de antecipação) e `ADJUSTMENT` positivo.
- `net = charges - credits` (pode ser negativo = crédito a favor); é o `totalAmount`.
- `paid = Σ amount` das pernas `CARD_PAYMENT` positivas no cartão ligadas à fatura.
- `open = max(0, net - paid)`; `creditBalance = max(0, paid - net)`.
- O retorno inclui `breakdown` (despesas, tarifas, juros, estornos, pagamentos) para a UI explicar o número.

Status (`getStatementStatus`, com `now` injetado): `OPEN` antes de fechar; `CLOSED` entre fechar e vencer; `OVERDUE` venceu com aberto > 0; `PAID` com total > 0 e aberto = 0, ou fatura fechada sem nada a pagar. Para os **bloqueios** (mover, estornar, antecipar, apagar compra) o critério é "quitada por pagamentos" (`paid > 0 e open = 0`): uma fatura fechada e vazia tem rótulo `PAID`, mas continua aceitando lançamentos movidos pelo usuário.

## Operações

- **Compra** (`createCardPurchase`): uma transação do ledger com `CardPurchase`, `CardInstallment` 1:1 e faturas (criadas com `INSERT ... ON CONFLICT DO NOTHING`, idempotente sob concorrência). Falha na parcela 2 desfaz tudo.
- **Pagamento** (`payStatement`): par `CARD_PAYMENT` (`-X` na origem, `+X` no cartão com `statementId`/`statementKey`); total ou parcial; origem diferente do cartão e que não seja cartão; excedente => `STATEMENT_OVERPAYMENT`; fatura quitada => `STATEMENT_ALREADY_PAID`. A fatura é travada (`SELECT ... FOR UPDATE`) e o aberto é conferido **dentro do lock**, a partir do ledger: pagamentos concorrentes nunca passam do aberto. Devolve `overdraftWarning { willUseOverdraft, usedAfter, excessAfter }` (informa, não bloqueia). Fica fora de orçamento e de receita/despesa (o gasto já foi contado na compra).
- **Estorno** (`refundCardTransaction`): `INCOME` positivo no cartão com `refundOfId`, categoria herdada, na fatura do ciclo da data do estorno (ou `statementKey` informada). **Abate a fatura**. `amount > refundableAmount` => `REFUND_EXCEEDS_ORIGINAL` (estornos concorrentes do mesmo original são serializados). Estorno maior que a fatura vira `creditBalance` informativo: o crédito **não** é rolado como lançamento para a próxima fatura (decisão da F1-03; reavaliar na F3-06).
- **Mover** (`moveTransactionToStatement`): só `EXPENSE | FEE | INTEREST | INCOME` de cartão, para fatura do mesmo cartão (existente ou criável dentro de 1 mês antes / 2 depois do ciclo natural); fatura paga não cede nem recebe (`STATEMENT_PAID`). Não altera `date` nem saldo. Usa `setTransactionLinks(..., { actor: 'USER' })`, que grava `userLocked.statement`, e o sync não devolve o lançamento ao ciclo original. Mover A->B e B->A ao mesmo tempo não gera deadlock (locks de fatura ordenados por id).
- **Antecipação** (`advanceInstallments`): porta do 1.x. As parcelas futuras vão para a data/fatura da antecipação; o desconto vira um `INCOME` (crédito) na fatura corrente, ligado à primeira parcela por `refundOfId` e com `occurrenceKey = advance:<id>`; registra `totalOriginalAmount`, `totalPaidAmount`, `totalDiscountAmount`.
- **Apagar compra** (`deleteCardPurchase`): remove compra, parcelas e lançamentos (via ledger, revertendo o saldo); parcela em fatura quitada => `PURCHASE_HAS_PAID_INSTALLMENTS` (nada muda); estorno registrado => `PURCHASE_HAS_REFUNDS`.
- **Leituras**: `listStatements`, `getStatementDetail` (itens, `totals`, conta sugerida para pagar), `getCardSummary` (limite, usado, disponível, fatura atual, próxima, parcelas ativas).

## Ordem de locks (concorrência)

Compra de parcelas (antecipar/apagar) -> faturas (`SELECT ... FOR UPDATE` ordenado por id; criação em ordem de `statementKey`) -> ledger (contas por id, ver `ledger.md`). Todo use-case trava a(s) fatura(s) **antes** de chamar o ledger; a transação é a do `ledger.runInTransaction` e o `PrismaCardsRepository` escreve nela por `prismaClientOf(uow.tx)`. Nenhum `prisma.transaction.*` direto em `cards` (guard `ledger-boundaries`).

## Erros (`CardsError.code`)

Validação (400): `INVALID_AMOUNT`, `INVALID_DATE`, `INVALID_BILLING_DAY`, `INVALID_STATEMENT_KEY`, `INVALID_INSTALLMENT_COUNT`, `INSTALLMENT_TOO_SMALL`, `CARD_NOT_CONFIGURED`, `INVALID_PAYMENT_SOURCE`, `NOT_REFUNDABLE`, `REFUND_EXCEEDS_ORIGINAL`, `NOT_A_CARD_TRANSACTION`, `STATEMENT_ACCOUNT_MISMATCH`, `STATEMENT_TARGET_OUT_OF_RANGE`, `INVALID_DISCOUNT`, `INSTALLMENT_NOT_FUTURE`. Não encontrado (404, inclusive ids de outro usuário): `CARD_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `STATEMENT_NOT_FOUND`, `PURCHASE_NOT_FOUND`, `TRANSACTION_NOT_FOUND`, `INSTALLMENT_NOT_FOUND`. Conflito (409): `STATEMENT_ALREADY_PAID`, `STATEMENT_OVERPAYMENT`, `STATEMENT_PAID`, `PURCHASE_HAS_PAID_INSTALLMENTS`, `PURCHASE_HAS_REFUNDS`, `INSTALLMENT_ALREADY_ADVANCED`, `CONCURRENT_UPDATE`. Erros do ledger (`LedgerError`) passam como estão.

## Rotas

| Método e rota                                | Use-case                       |
| -------------------------------------------- | ------------------------------ |
| `POST /api/cards/[accountId]/purchases`      | `createCardPurchase`           |
| `GET /api/cards/[accountId]/statements`      | `listStatements`               |
| `GET /api/cards/[accountId]/summary`         | `getCardSummary`               |
| `GET /api/statements/[id]`                   | `getStatementDetail`           |
| `POST /api/statements/[id]/payments`         | `payStatement`                 |
| `POST /api/transactions/[id]/move-statement` | `moveTransactionToStatement`   |
| `POST /api/transactions/[id]/refund`         | `refundCardTransaction`        |
| `POST /api/purchases/[id]/advance`           | `advanceInstallments`          |
| `DELETE /api/purchases/[id]`                 | `deleteCardPurchase`           |

Rotas finas: `requireAuth` -> Zod -> use-case -> JSON.

## Fora deste módulo

Tela Cartões (F3-06), importação de fatura PDF e casamento por `statementKey` (F4-02/F4-04), crédito rotativo, juros da fatura e Pix no crédito (F1-05), cron diário (F3-01).
