/**
 * API pública do módulo `ledger` para OUTROS módulos de servidor (contas, cartões, renda,
 * dívidas, importação...). Importe só daqui (`@/server/modules/ledger`), de `./service`
 * (instância ligada ao Prisma) ou, em testes, de `./testing`. Importar `ledger/application`,
 * `ledger/infra`, `ledger/domain` ou `ledger/http` de fora do módulo é barrado por
 * `tests/guards/ledger-boundaries.ts`.
 *
 * Este arquivo não importa `@/server/db`: é seguro em testes de aplicação com repositório em
 * memória. Documentação e exemplos: `docs/domain/ledger.md` ("API para módulos consumidores").
 */

// ---- fábrica e unit of work -----------------------------------------------------------
export { createLedgerService, type LedgerService } from './application/ledger-service'
export { runInTransaction, type LedgerUnitOfWork } from './application/unit-of-work'
export type {
  LedgerContext,
  LedgerDeps,
  LedgerMutationEvent,
  LedgerRepository,
  TransactionHandle,
  TxnListFilter,
  TxnPage,
} from './application/ports'

// ---- handle transacional (repositórios de outros módulos) ----------------------------
export {
  memoryTxOf,
  onRollback,
  prismaClientOf,
  type ConsumerTransactionClient,
  type InMemoryTransactionHandle,
} from './infra/transaction-handle'

// ---- entradas e resultados dos use-cases ----------------------------------------------
export type {
  CreateTransactionInput,
  CreateTransactionResult,
} from './application/create-transaction'
export type { CreateTransferInput, CreateTransferResult } from './application/create-transfer'
export type { DeleteTransactionResult } from './application/delete-transaction'
export type { ListTransactionsInput } from './application/get-position'
export type { MutationResult } from './application/shared'
export type { SetTransactionLinksOptions, SetTransactionLinksResult } from './application/set-links'
export type {
  UpdateTransactionInput,
  UpdateTransactionOptions,
  UpdateTransactionResult,
} from './application/update-transaction'
export type {
  UpsertPlannedAction,
  UpsertPlannedInput,
  UpsertPlannedResult,
} from './application/upsert-planned'

// ---- tradução de erros para HTTP (rotas e handlers de outros módulos) ---------------------
export { mapErrorToHttp, type HttpErrorMapping } from './http/error-response'

// ---- domínio: tipos, erros e códigos estáveis ----------------------------------------
export { STATEMENT_KEY_PATTERN, type TxnLinksInput } from './domain/links'
export {
  LEDGER_ERROR_CODES,
  LedgerError,
  TXN_LINK_FIELDS,
  isLedgerError,
  type AccountKind,
  type AccountPosition,
  type Buckets,
  type CategorySource,
  type LedgerErrorCode,
  type LedgerTxn,
  type LedgerWarning,
  type ReviewState,
  type TransferKind,
  type TxnKind,
  type TxnLinks,
  type TxnSource,
  type TxnStatus,
} from './domain/types'
