import type { AccountPosition } from '../domain/types'
import type { LedgerContext, LedgerDeps, TxnListFilter, TxnPage } from './ports'
import { buildPosition, loadAccount } from './shared'

/** Posição de uma conta a partir do cache `AccountBalance` (sem somar o ledger). */
export async function getAccountPosition(
  deps: LedgerDeps,
  ctx: LedgerContext,
  accountId: string,
): Promise<AccountPosition> {
  const account = await loadAccount(deps.repo, ctx.userId, accountId)
  const balance = await deps.repo.findBalance(ctx.userId, accountId)
  return buildPosition(account, balance)
}

/** Posições de todas as contas do usuário (arquivadas só com `includeArchived`). */
export async function listAccountPositions(
  deps: LedgerDeps,
  ctx: LedgerContext,
  opts: { includeArchived?: boolean } = {},
): Promise<AccountPosition[]> {
  const [accounts, balances] = await Promise.all([
    deps.repo.listAccounts(ctx.userId, opts),
    deps.repo.listBalances(ctx.userId),
  ])
  const byAccount = new Map(balances.map((b) => [b.accountId, b]))
  return accounts.map((account) => buildPosition(account, byAccount.get(account.id) ?? null))
}

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

export type ListTransactionsInput = Omit<TxnListFilter, 'limit'> & { limit?: number }

/** Lista lançamentos do usuário (data desc, paginação por cursor). */
export async function listTransactions(
  deps: LedgerDeps,
  ctx: LedgerContext,
  input: ListTransactionsInput = {},
): Promise<TxnPage> {
  const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
  return deps.repo.listTransactions(ctx.userId, { ...input, limit })
}
