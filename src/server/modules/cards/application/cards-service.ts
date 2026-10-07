import { advanceInstallments, type AdvanceInstallmentsInput } from './advance-installments'
import { createCardPurchase, type CreateCardPurchaseInput } from './create-card-purchase'
import { deleteCardPurchase } from './delete-card-purchase'
import {
  moveTransactionToStatement,
  type MoveTransactionToStatementInput,
} from './move-transaction-to-statement'
import { payStatement, type PayStatementInput } from './pay-statement'
import type { CardsContext, CardsDeps } from './ports'
import {
  getCardSummary,
  getStatementDetail,
  listStatements,
  type ListStatementsOptions,
} from './queries'
import { refundCardTransaction, type RefundCardTransactionInput } from './refund-card-transaction'
import { syncCardStatuses, type SyncCardStatusesInput } from './sync-card-statuses'

/**
 * Fachada do módulo de cartões com as dependências ligadas: é o que UI, rotas, bot e MCP
 * consomem (ADR-025). Cada método recebe `{ userId }` como primeiro argumento.
 */
export function createCardsService(deps: CardsDeps) {
  return {
    createCardPurchase: (ctx: CardsContext, input: CreateCardPurchaseInput) =>
      createCardPurchase(deps, ctx, input),
    payStatement: (ctx: CardsContext, input: PayStatementInput) => payStatement(deps, ctx, input),
    moveTransactionToStatement: (ctx: CardsContext, input: MoveTransactionToStatementInput) =>
      moveTransactionToStatement(deps, ctx, input),
    refundCardTransaction: (ctx: CardsContext, input: RefundCardTransactionInput) =>
      refundCardTransaction(deps, ctx, input),
    advanceInstallments: (ctx: CardsContext, input: AdvanceInstallmentsInput) =>
      advanceInstallments(deps, ctx, input),
    deleteCardPurchase: (ctx: CardsContext, purchaseId: string) =>
      deleteCardPurchase(deps, ctx, purchaseId),
    syncCardStatuses: (ctx: CardsContext, input?: SyncCardStatusesInput) =>
      syncCardStatuses(deps, ctx, input),
    listStatements: (ctx: CardsContext, accountId: string, options?: ListStatementsOptions) =>
      listStatements(deps, ctx, accountId, options),
    getStatementDetail: (ctx: CardsContext, statementId: string) =>
      getStatementDetail(deps, ctx, statementId),
    getCardSummary: (ctx: CardsContext, accountId: string) => getCardSummary(deps, ctx, accountId),
  }
}

export type CardsService = ReturnType<typeof createCardsService>
