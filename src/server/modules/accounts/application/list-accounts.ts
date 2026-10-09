import { computeTotals, toAccountView, type AccountTotals, type AccountView } from '../domain/rules'
import type { AccountDeps } from './ports'
import { loadOwnedAccount, viewOf } from './shared'

export interface ListAccountsOptions {
  /** Inclui as arquivadas (padrão: não). */
  includeArchived?: boolean
  /** Tira as contas PJ do total `cash` (RN-07); a lista continua completa. */
  excludeBusiness?: boolean
}

export interface ListAccountsResult {
  accounts: AccountView[]
  totals: AccountTotals
}

/**
 * Contas com a posição do ledger (saldos por balde e uso do limite), por `sortOrder` e nome.
 * Nada é recalculado aqui: os números vêm de `getAccountPosition`/`listAccountPositions`.
 */
export async function listAccounts(
  deps: AccountDeps,
  userId: string,
  opts: ListAccountsOptions = {},
): Promise<ListAccountsResult> {
  const [records, positions] = await Promise.all([
    deps.accounts.listByUser(userId),
    deps.ledger.listAccountPositions({ userId }, { includeArchived: true }),
  ])
  const byId = new Map(positions.map((position) => [position.accountId, position]))

  const accounts: AccountView[] = []
  for (const record of records) {
    if (record.isArchived && !opts.includeArchived) continue
    const position =
      byId.get(record.id) ?? (await deps.ledger.getAccountPosition({ userId }, record.id))
    accounts.push(toAccountView(record, position))
  }
  return { accounts, totals: computeTotals(accounts, { excludeBusiness: opts.excludeBusiness }) }
}

export async function getAccount(
  deps: AccountDeps,
  userId: string,
  id: string,
): Promise<AccountView> {
  return viewOf(deps, userId, await loadOwnedAccount(deps, userId, id))
}
