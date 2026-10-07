import { changeTransactionStatus } from './change-status'
import { createTransaction, type CreateTransactionInput } from './create-transaction'
import { createTransfer, type CreateTransferInput } from './create-transfer'
import { deleteTransaction } from './delete-transaction'
import {
  getAccountPosition,
  listAccountPositions,
  listTransactions,
  type ListTransactionsInput,
} from './get-position'
import { openAccountBalance } from './open-account-balance'
import type { LedgerContext, LedgerDeps } from './ports'
import { rebuildAccountBalance } from './rebuild-balance'
import { setTransactionLinks, type SetTransactionLinksOptions } from './set-links'
import { runInTransaction, type LedgerUnitOfWork } from './unit-of-work'
import type { UpsertPlannedInput } from './upsert-planned'
import {
  updateTransaction,
  type UpdateTransactionInput,
  type UpdateTransactionOptions,
} from './update-transaction'
import type { TxnLinksInput } from '../domain/links'
import type { TxnStatus } from '../domain/types'

/**
 * Fachada com as dependências já ligadas: é o que UI, rotas, bot e MCP consomem (ADR-025).
 * Cada método recebe `{ userId }` como primeiro argumento.
 */
export function createLedgerService(deps: LedgerDeps) {
  return {
    createTransaction: (ctx: LedgerContext, input: CreateTransactionInput) =>
      createTransaction(deps, ctx, input),
    updateTransaction: (
      ctx: LedgerContext,
      id: string,
      input: UpdateTransactionInput,
      opts?: UpdateTransactionOptions,
    ) => updateTransaction(deps, ctx, id, input, opts),
    deleteTransaction: (ctx: LedgerContext, id: string) => deleteTransaction(deps, ctx, id),
    changeTransactionStatus: (ctx: LedgerContext, id: string, to: TxnStatus) =>
      changeTransactionStatus(deps, ctx, id, to),
    createTransfer: (ctx: LedgerContext, input: CreateTransferInput) =>
      createTransfer(deps, ctx, input),
    rebuildAccountBalance: (ctx: LedgerContext, accountId: string) =>
      rebuildAccountBalance(deps, ctx, accountId),
    getAccountPosition: (ctx: LedgerContext, accountId: string) =>
      getAccountPosition(deps, ctx, accountId),
    listAccountPositions: (ctx: LedgerContext, opts?: { includeArchived?: boolean }) =>
      listAccountPositions(deps, ctx, opts),
    listTransactions: (ctx: LedgerContext, input?: ListTransactionsInput) =>
      listTransactions(deps, ctx, input),
    setTransactionLinks: (
      ctx: LedgerContext,
      id: string,
      links: TxnLinksInput,
      opts?: SetTransactionLinksOptions,
    ) => setTransactionLinks(deps, ctx, id, links, opts),
    /** Cria a linha zerada de `AccountBalance` (idempotente). */
    openAccountBalance: (ctx: LedgerContext, accountId: string) =>
      openAccountBalance(deps, ctx, accountId),
    /** Previsto idempotente por `occurrenceKey` (transação própria). */
    upsertPlannedByOccurrenceKey: (ctx: LedgerContext, input: UpsertPlannedInput) =>
      runInTransaction(deps, ctx, (uow) => uow.upsertPlannedByOccurrenceKey(input)),
    upsertPlannedBatch: (ctx: LedgerContext, inputs: UpsertPlannedInput[]) =>
      runInTransaction(deps, ctx, (uow) => uow.upsertPlannedBatch(inputs)),
    /**
     * Unit of work: `fn` roda numa única transação com as operações do ledger e o handle
     * opaco (`uow.tx`) para outro módulo escrever na mesma transação. Ver `runInTransaction`.
     */
    runInTransaction: <T>(ctx: LedgerContext, fn: (uow: LedgerUnitOfWork) => Promise<T>) =>
      runInTransaction(deps, ctx, fn),
  }
}

export type LedgerService = ReturnType<typeof createLedgerService>
