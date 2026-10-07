import { zeroBuckets } from '../domain/rules'
import type { AccountPosition, Buckets } from '../domain/types'
import type { LedgerContext, LedgerDeps } from './ports'
import { loadAccount, notifyMutation, positionsFor } from './shared'

export interface RebuildAccountBalanceResult {
  accountId: string
  /** Baldes do cache antes da reconstrução (zeros se a linha ainda não existia). */
  before: Buckets
  /** Baldes recalculados a partir do ledger. */
  after: Buckets
  /** `true` se o cache divergia do ledger (drift). */
  drifted: boolean
  position: AccountPosition
}

/**
 * Recalcula `AccountBalance` somando o ledger por balde e substitui os três campos
 * (rede de segurança do ADR-019; usado pela F1-04 e por scripts de reparo). Idempotente.
 *
 * Primeiro trava a linha do cache (incremento zero, que também incrementa `version`) e só
 * depois soma: escritas concorrentes esperam o commit e depois somam seus deltas sobre o
 * valor reconstruído, sem perda.
 */
export async function rebuildAccountBalance(
  deps: LedgerDeps,
  ctx: LedgerContext,
  accountId: string,
): Promise<RebuildAccountBalanceResult> {
  const result = await deps.repo.withTransaction(async (tx) => {
    await loadAccount(tx, ctx.userId, accountId)
    // Trava a linha antes de somar; o valor devolvido é o cache atual (linha ausente = zeros).
    const locked = await tx.incrementBalance(ctx.userId, accountId, zeroBuckets())
    const before: Buckets = {
      cleared: locked.balanceCleared,
      pending: locked.balancePending,
      planned: locked.balancePlanned,
    }
    const after = await tx.sumByBucket(ctx.userId, accountId)
    await tx.setBalance(ctx.userId, accountId, after)

    const [position] = await positionsFor(tx, ctx.userId, [accountId])
    const drifted =
      before.cleared !== after.cleared ||
      before.pending !== after.pending ||
      before.planned !== after.planned
    return { accountId, before, after, drifted, position }
  })

  await notifyMutation(deps, {
    userId: ctx.userId,
    type: 'REBUILD',
    accountIds: [accountId],
    transactionIds: [],
  })
  return result
}
