/**
 * API pública do módulo `accounts` (FC2-F1-02) para OUTROS módulos de servidor (reconciliação
 * F1-04, cartões F1-03, importação, tools/MCP). Não importa `@/server/db`: é seguro em testes
 * com repositório em memória. A instância ligada ao Prisma vem de `@/server/modules/accounts/service`.
 *
 * Contas nunca escrevem em `transactions`/`account_balances`: o saldo e o saldo inicial passam
 * pela API do ledger (`@/server/modules/ledger`). Documentação: `docs/domain/accounts.md`.
 */
export { createAccountsService, type AccountsService } from './application/accounts-service'
export type {
  AccountDeps,
  AccountRepository,
  AccountsLedger,
  AccountUpdate,
  AccountWarning,
  NewAccountRecord,
} from './application/ports'
export type { CreateAccountInput, CreateAccountResult } from './application/create-account'
export type { UpdateAccountInput, UpdateAccountResult } from './application/update-account'
export type { ArchiveAccountResult } from './application/archive-account'
export type { ListAccountsOptions, ListAccountsResult } from './application/list-accounts'

export {
  ACCOUNT_ERROR_CODES,
  ACCOUNT_ERROR_STATUS,
  AccountError,
  isAccountError,
  type AccountErrorCode,
} from './domain/errors'
export {
  ACCOUNT_TYPES,
  CASH_TYPES,
  OVERDRAFT_TYPES,
  type AccountFields,
  type AccountRecord,
  type AccountType,
} from './domain/types'
export {
  OPENING_DESCRIPTION,
  computeTotals,
  isOpeningTxn,
  type AccountTotals,
  type AccountView,
} from './domain/rules'
export { createPrismaAccountRepository } from './infra/prisma-account-repository'
