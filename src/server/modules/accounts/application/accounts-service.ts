import { archiveAccount, unarchiveAccount } from './archive-account'
import { createAccount, type CreateAccountInput } from './create-account'
import { deleteAccount } from './delete-account'
import { getAccount, listAccounts, type ListAccountsOptions } from './list-accounts'
import type { AccountDeps } from './ports'
import { reorderAccounts } from './reorder-accounts'
import { updateAccount, type UpdateAccountInput } from './update-account'

/**
 * Fachada com as dependências já ligadas: é o que UI, rotas, bot, MCP e outros módulos
 * (reconciliação F1-04, cartões F1-03) consomem (ADR-025). Todo método recebe `userId` primeiro.
 */
export function createAccountsService(deps: AccountDeps) {
  return {
    createAccount: (userId: string, input: CreateAccountInput) =>
      createAccount(deps, userId, input),
    updateAccount: (userId: string, id: string, patch: UpdateAccountInput) =>
      updateAccount(deps, userId, id, patch),
    archiveAccount: (userId: string, id: string) => archiveAccount(deps, userId, id),
    unarchiveAccount: (userId: string, id: string) => unarchiveAccount(deps, userId, id),
    deleteAccount: (userId: string, id: string) => deleteAccount(deps, userId, id),
    listAccounts: (userId: string, opts?: ListAccountsOptions) => listAccounts(deps, userId, opts),
    getAccount: (userId: string, id: string) => getAccount(deps, userId, id),
    reorderAccounts: (userId: string, ids: string[]) => reorderAccounts(deps, userId, ids),
  }
}

export type AccountsService = ReturnType<typeof createAccountsService>
