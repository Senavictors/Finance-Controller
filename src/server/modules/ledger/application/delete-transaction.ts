import { diffDeltas, mergeDeltas } from '../domain/rules'
import { LedgerError, type AccountPosition, type LedgerWarning } from '../domain/types'
import type { LedgerContext, LedgerDeps } from './ports'
import {
  applyDeltas,
  assertAllDeleted,
  collectWarnings,
  loadLockedWithCounterpart,
  notifyMutation,
  positionsFor,
} from './shared'

export interface DeleteTransactionResult {
  /** Ids removidos (as duas pernas, no caso de transferência). */
  deletedIds: string[]
  positions: AccountPosition[]
  warnings: LedgerWarning[]
}

/**
 * Apaga um lançamento e reverte o delta no `AccountBalance` (mesma transação). Perna de
 * transferência remove o par inteiro. `RECONCILED` (em qualquer perna) não pode ser apagado.
 */
export async function deleteTransaction(
  deps: LedgerDeps,
  ctx: LedgerContext,
  id: string,
): Promise<DeleteTransactionResult> {
  const result = await deps.repo.withTransaction(async (tx) => {
    const legs = await loadLockedWithCounterpart(tx, ctx.userId, id)
    if (legs.some((leg) => leg.status === 'RECONCILED')) {
      throw new LedgerError(
        'LEDGER_RECONCILED_LOCKED',
        'Lançamento conciliado não pode ser apagado: desfaça a conciliação antes.',
      )
    }

    const deleted = await tx.deleteTxns(
      ctx.userId,
      legs.map((leg) => leg.id),
    )
    assertAllDeleted(deleted, legs.length)
    await applyDeltas(
      tx,
      ctx.userId,
      mergeDeltas(
        ...legs.map((leg) =>
          diffDeltas({ accountId: leg.accountId, amount: leg.amount, status: leg.status }, null),
        ),
      ),
    )
    const positions = await positionsFor(
      tx,
      ctx.userId,
      legs.map((leg) => leg.accountId),
    )
    return { deletedIds: legs.map((leg) => leg.id), positions }
  })

  await notifyMutation(deps, {
    userId: ctx.userId,
    type: 'DELETE',
    accountIds: result.positions.map((p) => p.accountId),
    transactionIds: result.deletedIds,
  })
  return { ...result, warnings: collectWarnings(result.positions) }
}
