import type { LedgerTxn } from '@/server/modules/ledger'
import { CardsError } from '../domain/errors'
import type { CardsContext, CardsDeps } from './ports'
import {
  advanceDiscountKey,
  listAllTransactions,
  isPaidOut,
  liveTotals,
  lockExistingStatements,
  refreshStatement,
  type StatementSummary,
} from './shared'

export interface DeleteCardPurchaseResult {
  purchaseId: string
  /** Lançamentos apagados do ledger (parcelas e créditos de desconto de antecipação). */
  deletedTransactionIds: string[]
  /** Faturas que perderam lançamentos, já recalculadas. */
  statements: StatementSummary[]
}

/**
 * Apaga a compra, as parcelas e os lançamentos (pelo ledger, que reverte o saldo), desde que
 * nenhuma parcela esteja em fatura `PAID` (`PURCHASE_HAS_PAID_INSTALLMENTS`, sem alterar nada).
 * Também apaga os créditos de desconto de antecipações da própria compra. Estornos registrados
 * pelo usuário sobre as parcelas bloqueiam a exclusão (`PURCHASE_HAS_REFUNDS`): apague o estorno
 * antes, para não deixar crédito órfão.
 */
export async function deleteCardPurchase(
  deps: CardsDeps,
  ctx: CardsContext,
  purchaseId: string,
): Promise<DeleteCardPurchaseResult> {
  return deps.ledger.runInTransaction(ctx, async (uow) => {
    const purchase = await deps.repo.lockPurchase(ctx.userId, purchaseId, uow.tx)
    if (!purchase) throw new CardsError('PURCHASE_NOT_FOUND', 'Compra parcelada não encontrada.')

    const readInstallmentTxns = async () => {
      const found: LedgerTxn[] = []
      for (const installment of purchase.installments) {
        const txn = await uow.findTransaction(installment.ledgerTransactionId)
        if (txn) found.push(txn)
      }
      return found
    }
    const discountTxns = async () => {
      const found: LedgerTxn[] = []
      for (const advance of purchase.advances) {
        const txn = await uow.findTransactionByOccurrenceKey(advanceDiscountKey(advance.id))
        if (txn) found.push(txn)
      }
      return found
    }

    const peek = [...(await readInstallmentTxns()), ...(await discountTxns())]
    const locked = await lockExistingStatements(
      deps,
      uow,
      ctx,
      peek.map((txn) => txn.statementId),
    )

    // relê depois do lock das faturas
    const installmentTxns = await readInstallmentTxns()
    const discounts = await discountTxns()
    const all = [...installmentTxns, ...discounts]

    // fatura paga bloqueia (nada é alterado)
    for (const row of locked.values()) {
      const involved = all.some((txn) => txn.statementId === row.id)
      if (!involved) continue
      const items = await listAllTransactions(uow, { statementId: row.id })
      if (isPaidOut(liveTotals(deps, row, items).totals)) {
        throw new CardsError(
          'PURCHASE_HAS_PAID_INSTALLMENTS',
          'A compra tem parcela em fatura já paga e não pode ser apagada.',
          { statementKey: row.statementKey },
        )
      }
    }

    // estornos do usuário sobre as parcelas bloqueiam
    const discountIds = new Set(discounts.map((txn) => txn.id))
    for (const txn of installmentTxns) {
      const refunds = await listAllTransactions(uow, { refundOfId: txn.id, kind: 'INCOME' })
      if (refunds.some((refund) => !discountIds.has(refund.id))) {
        throw new CardsError(
          'PURCHASE_HAS_REFUNDS',
          'A compra tem estorno registrado: apague o estorno antes de apagar a compra.',
          { transactionId: txn.id },
        )
      }
    }

    // apaga: créditos de desconto primeiro (apontam para as parcelas), depois as parcelas
    const deletedTransactionIds: string[] = []
    for (const txn of [...discounts, ...installmentTxns]) {
      const result = await uow.deleteTransaction(txn.id)
      deletedTransactionIds.push(...result.deletedIds)
    }
    await deps.repo.deletePurchase(ctx.userId, purchase.id, uow.tx)

    const statements: StatementSummary[] = []
    for (const row of [...locked.values()].sort((a, b) =>
      a.statementKey < b.statementKey ? -1 : 1,
    )) {
      statements.push((await refreshStatement(deps, uow, ctx, row)).summary)
    }
    return { purchaseId: purchase.id, deletedTransactionIds, statements }
  })
}
