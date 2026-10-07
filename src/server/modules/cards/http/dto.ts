import type { LedgerTxn } from '@/server/modules/ledger'
import type {
  CreatedInstallment,
  CreateCardPurchaseResult,
} from '../application/create-card-purchase'
import type { AdvanceInstallmentsResult } from '../application/advance-installments'
import type { PurchaseRow } from '../application/ports'
import type { CardSummary, StatementDetail } from '../application/queries'
import type { StatementSummary } from '../application/shared'

/** Representações públicas (datas de calendário `YYYY-MM-DD`; sem `userId`). */

const calendarDay = (date: Date) => date.toISOString().slice(0, 10)

export function toStatementDto(statement: StatementSummary) {
  return {
    id: statement.id,
    accountId: statement.accountId,
    statementKey: statement.statementKey,
    periodStart: calendarDay(statement.periodStart),
    periodEnd: calendarDay(statement.periodEnd),
    closingDate: calendarDay(statement.closingDate),
    dueDate: calendarDay(statement.dueDate),
    status: statement.status,
    total: statement.total,
    paid: statement.paid,
    open: statement.open,
    creditBalance: statement.creditBalance,
    daysToDue: statement.daysToDue,
  }
}

/** Lançamento de cartão (mesmo formato do ledger, sem campos internos). */
export function toCardTxnDto(txn: LedgerTxn) {
  return {
    id: txn.id,
    accountId: txn.accountId,
    categoryId: txn.categoryId,
    merchantId: txn.merchantId,
    kind: txn.kind,
    status: txn.status,
    amount: txn.amount,
    date: calendarDay(txn.date),
    description: txn.description,
    transferId: txn.transferId,
    refundOfId: txn.refundOfId,
    statementId: txn.statementId,
    statementKey: txn.statementKey,
    excludeFromBudget: txn.excludeFromBudget,
    userLocked: txn.userLocked,
  }
}

export function toPurchaseDto(purchase: PurchaseRow) {
  return {
    id: purchase.id,
    accountId: purchase.accountId,
    categoryId: purchase.categoryId,
    merchantId: purchase.merchantId,
    description: purchase.description,
    notes: purchase.notes,
    purchaseDate: calendarDay(purchase.purchaseDate),
    totalAmount: purchase.totalAmount,
    installmentCount: purchase.installmentCount,
  }
}

function toInstallmentDto(item: CreatedInstallment) {
  return { ...item, date: calendarDay(item.date) }
}

export function toCreatePurchaseResponse(result: CreateCardPurchaseResult) {
  return {
    purchase: toPurchaseDto(result.purchase),
    installments: result.installments.map(toInstallmentDto),
    transactions: result.transactions.map(toCardTxnDto),
    statements: result.statements.map(toStatementDto),
    position: result.position,
    ...(result.limitWarning ? { limitWarning: result.limitWarning } : {}),
  }
}

export function toStatementDetailResponse(detail: StatementDetail) {
  return {
    statement: toStatementDto(detail.statement),
    totals: detail.totals,
    items: detail.items.map(toCardTxnDto),
    card: detail.card,
    suggestedPaymentAccountId: detail.suggestedPaymentAccountId,
  }
}

export function toAdvanceResponse(result: AdvanceInstallmentsResult) {
  return {
    advance: {
      id: result.advance.id,
      purchaseId: result.advance.purchaseId,
      advancedAt: calendarDay(result.advance.advancedAt),
      totalOriginalAmount: result.advance.totalOriginalAmount,
      totalPaidAmount: result.advance.totalPaidAmount,
      totalDiscountAmount: result.advance.totalDiscountAmount,
      notes: result.advance.notes,
    },
    installments: result.installments.map((i) => ({
      installmentNumber: i.installmentNumber,
      originalAmount: i.originalAmount,
      transactionId: i.transactionId,
    })),
    discountTransaction: result.discountTransaction
      ? toCardTxnDto(result.discountTransaction)
      : null,
    statements: result.statements.map(toStatementDto),
  }
}

export function toCardSummaryResponse(summary: CardSummary) {
  return {
    ...summary,
    currentStatement: summary.currentStatement ? toStatementDto(summary.currentStatement) : null,
    nextStatement: summary.nextStatement ? toStatementDto(summary.nextStatement) : null,
    payable: summary.payable.map(toStatementDto),
  }
}
