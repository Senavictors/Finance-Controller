import { AccountError } from '../domain/errors'
import { toAccountView, type AccountView } from '../domain/rules'
import type { AccountRecord } from '../domain/types'
import { nameKey } from '../domain/validation'
import type { AccountDeps } from './ports'

/** Conta do usuário ou `ACCOUNT_NOT_FOUND` (RN-08: id de outro usuário também é 404). */
export async function loadOwnedAccount(
  deps: AccountDeps,
  userId: string,
  id: string,
): Promise<AccountRecord> {
  const account = await deps.accounts.findById(userId, id)
  if (!account) throw new AccountError('ACCOUNT_NOT_FOUND', 'Conta não encontrada.')
  return account
}

/**
 * RN-02: nome único por usuário, sem diferenciar maiúsculas, inclusive contra contas
 * arquivadas (o nome delas continua reservado). `exceptId` ignora a própria conta.
 */
export async function assertNameAvailable(
  deps: AccountDeps,
  userId: string,
  name: string,
  exceptId?: string,
): Promise<void> {
  const wanted = nameKey(name)
  const all = await deps.accounts.listByUser(userId)
  if (all.some((account) => account.id !== exceptId && nameKey(account.name) === wanted)) {
    throw new AccountError('ACCOUNT_NAME_TAKEN', 'Já existe uma conta com esse nome.')
  }
}

/** Conta + posição do ledger (saldos por balde e uso do limite). */
export async function viewOf(
  deps: AccountDeps,
  userId: string,
  account: AccountRecord,
): Promise<AccountView> {
  const position = await deps.ledger.getAccountPosition({ userId }, account.id)
  return toAccountView(account, position)
}
