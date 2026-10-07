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
import type { LedgerContext, LedgerDeps } from './ports'
import { rebuildAccountBalance } from './rebuild-balance'
import {
  updateTransaction,
  type UpdateTransactionInput,
  type UpdateTransactionOptions,
} from './update-transaction'
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
  }
}

export type LedgerService = ReturnType<typeof createLedgerService>
