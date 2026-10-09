import { AccountError } from '../domain/errors'
import type { AccountDeps } from './ports'

/**
 * Define a ordem de exibição. As contas listadas vêm primeiro, na ordem dada; as demais (por
 * exemplo, arquivadas) seguem depois na ordem atual. Id repetido: `ACCOUNT_INVALID`; id que não
 * é do usuário: `ACCOUNT_NOT_FOUND` (RN-08).
 */
export async function reorderAccounts(
  deps: AccountDeps,
  userId: string,
  ids: string[],
): Promise<void> {
  if (new Set(ids).size !== ids.length) {
    throw new AccountError('ACCOUNT_INVALID', 'A lista de contas tem ids repetidos.', {
      ids: ['Ids repetidos.'],
    })
  }
  const all = await deps.accounts.listByUser(userId)
  const known = new Set(all.map((account) => account.id))
  if (ids.some((id) => !known.has(id))) {
    throw new AccountError('ACCOUNT_NOT_FOUND', 'Conta não encontrada.')
  }
  const listed = new Set(ids)
  const rest = all.filter((account) => !listed.has(account.id)).map((account) => account.id)
  await deps.accounts.setSortOrders(userId, [...ids, ...rest])
}
