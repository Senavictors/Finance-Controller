import { diffDeltas, mergeDeltas, validateStatusChange } from '../domain/rules'
import type { TxnStatus } from '../domain/types'
import type { LedgerContext, LedgerDeps } from './ports'
import {
  applyDeltas,
  assertKnownStatus,
  collectWarnings,
  loadLockedWithCounterpart,
  notifyMutation,
  positionsFor,
  type MutationResult,
} from './shared'

/**
 * Muda o status (PLANNED/PENDING/CLEARED/RECONCILED) e move o valor entre baldes do
 * `AccountBalance` na mesma transação. Transferências mudam as duas pernas juntas, exceto
 * para `RECONCILED`: a conciliação é por conta e afeta só a perna informada.
 * `RECONCILED -> qualquer` falha com `LEDGER_RECONCILED_LOCKED`.
 */
export async function changeTransactionStatus(
  deps: LedgerDeps,
  ctx: LedgerContext,
  id: string,
  to: TxnStatus,
): Promise<MutationResult> {
  assertKnownStatus(to, true)

  const result = await deps.repo.withTransaction(async (tx) => {
    const legs = await loadLockedWithCounterpart(tx, ctx.userId, id)
    const txn = legs[0]!
    const targets = to === 'RECONCILED' ? [txn] : legs

    for (const leg of targets) validateStatusChange(leg.status, to)

    const changed = targets.filter((leg) => leg.status !== to)
    const updatedById = new Map<string, typeof txn>()
    for (const leg of changed) {
      updatedById.set(leg.id, await tx.updateTxn(ctx.userId, leg.id, { status: to }))
    }
    await applyDeltas(
      tx,
      ctx.userId,
      mergeDeltas(
        ...changed.map((leg) =>
          diffDeltas(
            { accountId: leg.accountId, amount: leg.amount, status: leg.status },
            { accountId: leg.accountId, amount: leg.amount, status: to },
          ),
        ),
      ),
    )

    const positions = await positionsFor(
      tx,
      ctx.userId,
      legs.map((leg) => leg.accountId),
    )
    return {
      transaction: updatedById.get(txn.id) ?? txn,
      counterpart: legs[1] ? (updatedById.get(legs[1].id) ?? legs[1]) : null,
      positions,
      changedIds: changed.map((leg) => leg.id),
    }
  })

  if (result.changedIds.length > 0) {
    await notifyMutation(deps, {
      userId: ctx.userId,
      type: 'STATUS',
      accountIds: result.positions.map((p) => p.accountId),
      transactionIds: result.changedIds,
    })
  }
  return {
    transaction: result.transaction,
    counterpart: result.counterpart,
    positions: result.positions,
    warnings: collectWarnings(result.positions),
  }
}
