import { AccountError } from '../domain/errors'
import {
  canChangeType,
  countBeyondOpening,
  mergeAccountPatch,
  type AccountPatch,
  type AccountView,
} from '../domain/rules'
import { hasErrors, validateAccountFields } from '../domain/validation'
import type { AccountDeps, AccountWarning } from './ports'
import { assertNameAvailable, loadOwnedAccount, viewOf } from './shared'

export type UpdateAccountInput = AccountPatch

export interface UpdateAccountResult {
  account: AccountView
  warnings: AccountWarning[]
}

/**
 * Atualiza nome, emissor, cor, ícone, limites e dias de fatura. O `type` só muda enquanto não
 * há movimentação além do saldo inicial (RN-05, `ACCOUNT_TYPE_LOCKED`). Mudar fechamento ou
 * vencimento de cartão vale só para faturas futuras (a F1-03 aplica); o resultado avisa com
 * `STATEMENT_DAYS_CHANGED`.
 */
export async function updateAccount(
  deps: AccountDeps,
  userId: string,
  id: string,
  patch: UpdateAccountInput,
): Promise<UpdateAccountResult> {
  const current = await loadOwnedAccount(deps, userId, id)
  const { fields, changes, typeChanged } = mergeAccountPatch(current, patch)

  const errors = validateAccountFields(fields)
  if (hasErrors(errors)) {
    throw new AccountError('ACCOUNT_INVALID', 'Dados da conta inválidos.', errors)
  }

  if (typeChanged) {
    const page = await deps.ledger.listTransactions({ userId }, { accountId: id, limit: 5 })
    if (!canChangeType(countBeyondOpening(page.items))) {
      throw new AccountError(
        'ACCOUNT_TYPE_LOCKED',
        'O tipo da conta não pode mudar depois que ela tem lançamentos.',
      )
    }
  }
  if (changes.name !== undefined) await assertNameAvailable(deps, userId, changes.name, id)

  const warnings: AccountWarning[] = []
  if (
    current.type === 'CREDIT_CARD' &&
    fields.type === 'CREDIT_CARD' &&
    (changes.closingDay !== undefined || changes.dueDay !== undefined)
  ) {
    warnings.push('STATEMENT_DAYS_CHANGED')
  }

  const updated =
    Object.keys(changes).length === 0 ? current : await deps.accounts.update(userId, id, changes)
  if (!updated) throw new AccountError('ACCOUNT_NOT_FOUND', 'Conta não encontrada.')

  return { account: await viewOf(deps, userId, updated), warnings }
}
