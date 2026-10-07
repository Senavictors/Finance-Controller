import type { LedgerTxn } from '@/server/modules/ledger'
import { CardsError } from '../domain/errors'
import { assertStatementKeyCreatable } from '../domain/move'
import { validateRefund } from '../domain/refund'
import type { CardsContext, CardsDeps } from './ports'
import {
  assertCardTransaction,
  cycleFor,
  cycleForKey,
  draftStatement,
  listAllTransactions,
  isPaidOut,
  liveTotals,
  lockExistingStatements,
  refreshStatement,
  statusFor,
  type StatementSummary,
} from './shared'

export interface RefundCardTransactionInput {
  originalTransactionId: string
  /** Centavos em módulo (> 0), até o valor ainda estornável do original. */
  amount: number
  /** Data do estorno (meio-dia UTC); define a fatura quando `statementKey` não vem. */
  date: Date
  /** Fatura do crédito (padrão: o ciclo da `date` do estorno). */
  statementKey?: string
  description?: string
}

export interface RefundCardTransactionResult {
  /** O `INCOME` positivo criado no cartão (`refundOfId` = original). */
  transaction: LedgerTxn
  /** Fatura que recebeu o crédito, já recalculada (estorno abate o total). */
  statement: StatementSummary
  /** Quanto ainda pode ser estornado do original depois deste estorno. */
  refundableRemaining: number
}

/**
 * Estorno de uma compra, tarifa ou juros do cartão: `INCOME` **positivo** na conta do cartão com
 * `refundOfId = original`, categoria e estabelecimento herdados, na fatura do ciclo da data do
 * estorno (ou na `statementKey` informada). **Abate a fatura** (`net = cobranças - créditos`);
 * estorno maior que a fatura vira `creditBalance` informativo, sem rolar para a próxima (decisão
 * da F1-03). Valida `amount <= refundableAmount` (soma dos estornos anteriores do mesmo original).
 */
export async function refundCardTransaction(
  deps: CardsDeps,
  ctx: CardsContext,
  input: RefundCardTransactionInput,
): Promise<RefundCardTransactionResult> {
  return deps.ledger.runInTransaction(ctx, async (uow) => {
    const original = await uow.findTransaction(input.originalTransactionId)
    if (!original)
      throw new CardsError('TRANSACTION_NOT_FOUND', 'Lançamento original não encontrado.')
    const card = await assertCardTransaction(deps, ctx, original, uow.tx)

    // fatura do crédito: a pedida (existente ou criável) ou o ciclo da data do estorno
    const naturalKey = cycleFor(card, input.date).statementKey
    const targetKey = input.statementKey ?? naturalKey
    const existing = await deps.repo.findStatementByKey(ctx.userId, card.id, targetKey, uow.tx)
    if (!existing && input.statementKey) {
      assertStatementKeyCreatable({ naturalKey, targetKey })
    }
    const ensured = await deps.repo.ensureStatements(
      ctx.userId,
      [draftStatement(ctx, card, cycleForKey(card, targetKey), deps.uuid())],
      uow.tx,
    )
    // locks (ordenados por id) antes do ledger: fatura do crédito e fatura do original (esta
    // serializa estornos simultâneos do mesmo original)
    const locked = await lockExistingStatements(deps, uow, ctx, [
      ensured[0]!.id,
      original.statementId,
    ])
    const statement = locked.get(ensured[0]!.id)!

    // lê depois do lock (estado commitado atual)
    const current = await uow.findTransaction(original.id)
    if (!current)
      throw new CardsError('TRANSACTION_NOT_FOUND', 'Lançamento original não encontrado.')
    const previous = (
      await listAllTransactions(uow, { refundOfId: current.id, kind: 'INCOME' })
    ).filter((txn) => txn.accountId === card.id)
    const { refundableAfter } = validateRefund({
      original: current,
      previousRefunds: previous,
      amount: input.amount,
    })

    const items = await listAllTransactions(uow, { statementId: statement.id })
    if (isPaidOut(liveTotals(deps, statement, items).totals)) {
      throw new CardsError(
        'STATEMENT_PAID',
        'A fatura do estorno já está paga: informe outra fatura (statementKey).',
        { statementKey: statement.statementKey },
      )
    }

    const created = await uow.createTransaction({
      accountId: card.id,
      kind: 'INCOME',
      amount: input.amount,
      date: input.date,
      description: input.description?.trim() || `Estorno: ${current.description}`.slice(0, 255),
      categoryId: current.categoryId,
      merchantId: current.merchantId,
      status: statusFor(deps, input.date, statement),
      refundOfId: current.id,
      statementId: statement.id,
      statementKey: statement.statementKey,
    })

    const refreshed = await refreshStatement(deps, uow, ctx, statement)
    return {
      transaction: created.transaction,
      statement: refreshed.summary,
      refundableRemaining: refundableAfter,
    }
  })
}
