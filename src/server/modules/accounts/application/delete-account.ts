import { AccountError } from '../domain/errors'
import { countBeyondOpening, isOpeningTxn } from '../domain/rules'
import type { AccountDeps } from './ports'
import { loadOwnedAccount } from './shared'

const HAS_TRANSACTIONS_MESSAGE =
  'A conta tem lançamentos e não pode ser excluída: arquive-a em vez de apagar.'

/**
 * Exclui uma conta recém-criada (só com o saldo inicial) para desfazer erro de cadastro
 * (RN-04). Conta com qualquer outro lançamento: `ACCOUNT_HAS_TRANSACTIONS`. O `ADJUSTMENT`
 * inicial é apagado pelo ledger, a conta e o `AccountBalance` caem na mesma transação.
 */
export async function deleteAccount(deps: AccountDeps, userId: string, id: string): Promise<void> {
  await loadOwnedAccount(deps, userId, id)

  await deps.ledger.runInTransaction({ userId }, async (uow) => {
    const { items } = await uow.listTransactions({ accountId: id, limit: 5 })
    if (countBeyondOpening(items) > 0) {
      throw new AccountError('ACCOUNT_HAS_TRANSACTIONS', HAS_TRANSACTIONS_MESSAGE)
    }
    const opening = items.find(isOpeningTxn)
    if (opening) {
      // O delete trava a linha do saldo: um lançamento concorrente (que também precisa dela)
      // fica esperando e é visto na releitura abaixo, em vez de sumir junto com a conta.
      await uow.deleteTransaction(opening.id)
      const remaining = await uow.listTransactions({ accountId: id, limit: 1 })
      if (remaining.items.length > 0) {
        throw new AccountError('ACCOUNT_HAS_TRANSACTIONS', HAS_TRANSACTIONS_MESSAGE)
      }
    }
    await deps.accounts.delete(userId, id, uow.tx)
  })
}
