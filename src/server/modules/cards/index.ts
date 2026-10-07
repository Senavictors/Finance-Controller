/**
 * API pública do módulo `cards` (FC2-F1-03) para OUTROS módulos de servidor, telas (F3-06) e
 * importação de faturas (F4-02/F4-04). O contrato com a importação é a `statementKey`
 * (`AAAA-MM` do mês de VENCIMENTO), calculada por `getStatementCycle`.
 *
 * Este arquivo não importa `@/server/db`: é seguro em testes com repositório em memória.
 * A instância ligada ao Prisma está em `./service` (`getCardsService`).
 */

// ---- fábrica e fachada --------------------------------------------------------------------
export { createCardsService, type CardsService } from './application/cards-service'
export type {
  AdvanceRow,
  CardAccountRow,
  CardsContext,
  CardsDeps,
  CardsRepository,
  InstallmentRow,
  PurchaseRow,
  PurchaseWithInstallments,
  StatementRow,
} from './application/ports'

// ---- entradas e resultados dos use-cases --------------------------------------------------
export type {
  AdvanceInstallmentsInput,
  AdvanceInstallmentsResult,
} from './application/advance-installments'
export type {
  CreateCardPurchaseInput,
  CreateCardPurchaseResult,
  CreatedInstallment,
} from './application/create-card-purchase'
export type { DeleteCardPurchaseResult } from './application/delete-card-purchase'
export type {
  MoveTransactionToStatementInput,
  MoveTransactionToStatementResult,
} from './application/move-transaction-to-statement'
export type { PayStatementInput, PayStatementResult } from './application/pay-statement'
export type {
  ActivePurchase,
  CardSummary,
  ListStatementsOptions,
  StatementDetail,
} from './application/queries'
export type {
  RefundCardTransactionInput,
  RefundCardTransactionResult,
} from './application/refund-card-transaction'
export type { StatementSummary } from './application/shared'
export type {
  CardSyncReport,
  SyncCardStatusesInput,
  SyncCardStatusesResult,
} from './application/sync-card-statuses'

// ---- domínio puro reaproveitável (importação, telas) -------------------------------------
export {
  CARDS_ERROR_CODES,
  CardsError,
  isCardsError,
  type CardsErrorCategory,
  type CardsErrorCode,
} from './domain/errors'
export {
  getStatementCycle,
  getStatementCycleByKey,
  isCardConfigured,
  type StatementCycle,
  type StatementCycleInput,
} from './domain/statement-cycle'
export { getStatementStatus, type StatementStatus } from './domain/statement-status'
export { computeStatementTotals, type StatementTotals } from './domain/statement-totals'
export {
  MAX_INSTALLMENTS,
  addMonthsClamped,
  buildInstallmentSchedule,
  splitAmountIntoInstallments,
} from './domain/installments'
export { refundableAmount, validateRefund } from './domain/refund'
export {
  overdraftWarning,
  suggestPaymentAccount,
  type OverdraftWarning,
  type PaymentCandidate,
} from './domain/payment'
export { BUSINESS_TIME_ZONE, calendarDayInZone } from './domain/calendar'
