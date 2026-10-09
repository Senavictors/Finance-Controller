import type { AccountView } from '../domain/rules'
import { AccountError } from '../domain/errors'
import type { AccountDeps, AccountWarning } from './ports'
import { loadOwnedAccount, viewOf } from './shared'

export interface ArchiveAccountResult {
  account: AccountView
  warnings: AccountWarning[]
}

/**
 * Arquiva a conta (RN-04): some das listas padrão e só aceita `ADJUSTMENT` no ledger. Permitido
 * com saldo diferente de zero, avisando com `ARCHIVED_WITH_BALANCE`. Idempotente.
 */
export async function archiveAccount(
  deps: AccountDeps,
  userId: string,
  id: string,
): Promise<ArchiveAccountResult> {
  const current = await loadOwnedAccount(deps, userId, id)
  const updated = current.isArchived
    ? current
    : await deps.accounts.update(userId, id, { isArchived: true })
  if (!updated) throw new AccountError('ACCOUNT_NOT_FOUND', 'Conta não encontrada.')

  const account = await viewOf(deps, userId, updated)
  const { cleared, pending, planned } = account.balance
  const warnings: AccountWarning[] =
    cleared !== 0 || pending !== 0 || planned !== 0 ? ['ARCHIVED_WITH_BALANCE'] : []
  return { account, warnings }
}

/** Reabre uma conta arquivada. Idempotente. */
export async function unarchiveAccount(
  deps: AccountDeps,
  userId: string,
  id: string,
): Promise<{ account: AccountView }> {
  const current = await loadOwnedAccount(deps, userId, id)
  const updated = current.isArchived
    ? await deps.accounts.update(userId, id, { isArchived: false })
    : current
  if (!updated) throw new AccountError('ACCOUNT_NOT_FOUND', 'Conta não encontrada.')
  return { account: await viewOf(deps, userId, updated) }
}
