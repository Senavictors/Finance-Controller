import type { LedgerTxn } from '@/server/modules/ledger'
import { CardsError } from '../domain/errors'
import { refundableAmount } from '../domain/refund'
import type { AdvanceRow, CardsContext, CardsDeps, InstallmentRow } from './ports'
import {
  advanceDiscountKey,
  cycleFor,
  draftStatement,
  ensureStatementsInOrder,
  listAllTransactions,
  isPaidOut,
  liveTotals,
  lockExistingStatements,
  loadCard,
  refreshStatement,
  statusFor,
  type StatementSummary,
} from './shared'

export interface AdvanceInstallmentsInput {
  purchaseId: string
  /** Números das parcelas a antecipar (futuras e ainda não antecipadas). */
  installmentNumbers: number[]
  /** Data do pagamento antecipado (meio-dia UTC): as parcelas passam para esta data/fatura. */
  date: Date
  /** Desconto total obtido, centavos (`0 <= desconto < total original`). */
  discountAmount: number
  notes?: string | null
}

export interface AdvanceInstallmentsResult {
  advance: AdvanceRow
  installments: Array<InstallmentRow & { transactionId: string }>
  /** Crédito `INCOME` do desconto na fatura corrente; `null` quando não há desconto. */
  discountTransaction: LedgerTxn | null
  /** Faturas tocadas (origens e destino), já recalculadas. */
  statements: StatementSummary[]
}

/**
 * Antecipação de parcelas (porta do `advanceCreditCardPurchaseInstallments` do 1.x ao ledger
 * assinado). Paga parcelas futuras de uma compra parcelada com desconto: cada parcela vai para a
 * `date` da antecipação e para a fatura do ciclo dessa data, mantendo o valor original; o desconto
 * entra como um `INCOME` (crédito) positivo na fatura corrente, ligado à primeira parcela por
 * `refundOfId` (e com `occurrenceKey = advance:<id>` para idempotência/limpeza). Registra
 * `CardInstallmentAdvance` com `totalOriginalAmount`, `totalPaidAmount` e `totalDiscountAmount`.
 *
 * Decisão (F1-03): o desconto é um crédito explícito, não uma redução silenciosa do valor da
 * parcela: o extrato mostra o quanto foi economizado e `CardInstallment.originalAmount` continua
 * igual ao lançamento.
 */
export async function advanceInstallments(
  deps: CardsDeps,
  ctx: CardsContext,
  input: AdvanceInstallmentsInput,
): Promise<AdvanceInstallmentsResult> {
  if (!Number.isInteger(input.discountAmount) || input.discountAmount < 0) {
    throw new CardsError(
      'INVALID_DISCOUNT',
      'O desconto deve ser um inteiro em centavos, maior ou igual a zero.',
    )
  }
  const numbers = [...new Set(input.installmentNumbers)]
  if (numbers.length === 0 || numbers.length !== input.installmentNumbers.length) {
    throw new CardsError('INSTALLMENT_NOT_FOUND', 'Informe ao menos uma parcela, sem repetição.')
  }
  const advanceId = deps.uuid()

  return deps.ledger.runInTransaction(ctx, async (uow) => {
    // compra primeiro (ordem de locks: compra -> faturas -> ledger)
    const purchase = await deps.repo.lockPurchase(ctx.userId, input.purchaseId, uow.tx)
    if (!purchase) throw new CardsError('PURCHASE_NOT_FOUND', 'Compra parcelada não encontrada.')
    const card = await loadCard(deps, ctx, purchase.accountId, uow.tx)

    const selected = numbers.map((number) => {
      const found = purchase.installments.find((i) => i.installmentNumber === number)
      if (!found) {
        throw new CardsError('INSTALLMENT_NOT_FOUND', `Parcela ${number} não encontrada.`, {
          number,
        })
      }
      if (found.advanceId) {
        throw new CardsError(
          'INSTALLMENT_ALREADY_ADVANCED',
          `A parcela ${number} já foi antecipada.`,
          {
            number,
          },
        )
      }
      return found
    })

    // lançamentos das parcelas (leitura sem lock; confirmada depois do lock das faturas)
    const readTxns = async () => {
      const list: LedgerTxn[] = []
      for (const installment of selected) {
        const txn = await uow.findTransaction(installment.ledgerTransactionId)
        if (!txn)
          throw new CardsError('TRANSACTION_NOT_FOUND', 'Lançamento da parcela não encontrado.')
        list.push(txn)
      }
      return list
    }
    const before = await readTxns()
    for (const txn of before) {
      if (txn.date.getTime() <= input.date.getTime()) {
        throw new CardsError(
          'INSTALLMENT_NOT_FUTURE',
          'Só é possível antecipar parcelas futuras.',
          {
            date: txn.date.toISOString().slice(0, 10),
          },
        )
      }
    }

    const totalOriginal = selected.reduce((sum, i) => sum + i.originalAmount, 0)
    if (input.discountAmount >= totalOriginal) {
      throw new CardsError(
        'INVALID_DISCOUNT',
        'O desconto deve ser menor que o valor original das parcelas.',
        {
          totalOriginal,
        },
      )
    }

    // faturas: a corrente (ciclo da data da antecipação) e as de origem, travadas juntas
    const targetCycle = cycleFor(card, input.date)
    const ensured = await ensureStatementsInOrder(deps, uow, ctx, [
      draftStatement(ctx, card, targetCycle, deps.uuid()),
    ])
    const target = ensured.get(targetCycle.statementKey)!
    const locked = await lockExistingStatements(deps, uow, ctx, [
      target.id,
      ...before.map((txn) => txn.statementId),
    ])
    const targetRow = locked.get(target.id)!

    const after = await readTxns()
    after.forEach((txn, index) => {
      if (txn.statementId !== before[index]!.statementId) {
        throw new CardsError(
          'CONCURRENT_UPDATE',
          'A parcela foi alterada por outra requisição ao mesmo tempo. Tente novamente.',
        )
      }
    })

    // faturas pagas não cedem nem recebem parcelas
    for (const row of locked.values()) {
      const items = await listAllTransactions(uow, { statementId: row.id })
      if (isPaidOut(liveTotals(deps, row, items).totals)) {
        throw new CardsError('STATEMENT_PAID', 'Uma das faturas envolvidas já está paga.', {
          statementKey: row.statementKey,
        })
      }
    }

    // 1) antecipação registrada; 2) parcelas movidas (data, fatura, status)
    const advance: AdvanceRow = {
      id: advanceId,
      userId: ctx.userId,
      purchaseId: purchase.id,
      accountId: purchase.accountId,
      advancedAt: input.date,
      totalOriginalAmount: totalOriginal,
      totalPaidAmount: totalOriginal - input.discountAmount,
      totalDiscountAmount: input.discountAmount,
      notes: input.notes?.trim() || null,
    }
    await deps.repo.insertAdvance(advance, uow.tx)
    await deps.repo.setInstallmentsAdvance(
      selected.map((i) => i.id),
      advanceId,
      uow.tx,
    )

    for (const txn of after) {
      await uow.updateTransaction(txn.id, { date: input.date })
      await uow.setTransactionLinks(txn.id, {
        statementId: targetRow.id,
        statementKey: targetRow.statementKey,
      })
      const desired = statusFor(deps, input.date, targetRow)
      if (txn.status !== 'RECONCILED' && txn.status !== desired) {
        await uow.changeTransactionStatus(txn.id, desired)
      }
    }

    // 3) crédito do desconto na fatura corrente
    let discountTransaction: LedgerTxn | null = null
    if (input.discountAmount > 0) {
      const first = after[0]!
      const previousRefunds = await listAllTransactions(uow, {
        refundOfId: first.id,
        kind: 'INCOME',
      })
      const linkable = input.discountAmount <= refundableAmount(first, previousRefunds)
      const created = await uow.createTransaction({
        accountId: card.id,
        kind: 'INCOME',
        amount: input.discountAmount,
        date: input.date,
        description: `Desconto de antecipação: ${purchase.description}`.slice(0, 255),
        categoryId: purchase.categoryId,
        merchantId: purchase.merchantId,
        status: statusFor(deps, input.date, targetRow),
        occurrenceKey: advanceDiscountKey(advanceId),
        statementId: targetRow.id,
        statementKey: targetRow.statementKey,
        ...(linkable ? { refundOfId: first.id } : {}),
      })
      discountTransaction = created.transaction
    }

    const statements: StatementSummary[] = []
    for (const row of [...locked.values()].sort((a, b) =>
      a.statementKey < b.statementKey ? -1 : 1,
    )) {
      statements.push((await refreshStatement(deps, uow, ctx, row)).summary)
    }

    return {
      advance,
      installments: selected.map((i) => ({
        ...i,
        advanceId,
        transactionId: i.ledgerTransactionId,
      })),
      discountTransaction,
      statements,
    }
  })
}
