import type { CreditCardPurchaseSource, TransactionType } from '@/generated/prisma/client'

export type CreditCardPurchaseInstallmentSummary = {
  id: string
  installmentNumber: number
  originalAmount: number
  originalDate: Date
  currentAmount: number
  currentDate: Date
  creditCardStatementId: string | null
  creditCardStatement: {
    id: string
    dueDate: Date
    status: string
  } | null
  advance: {
    id: string
    advancedAt: Date
    totalOriginalAmount: number
    totalPaidAmount: number
    totalDiscountAmount: number
  } | null
}

export type CreditCardPurchaseAdvanceSummary = {
  id: string
  advancedAt: Date
  totalOriginalAmount: number
  totalPaidAmount: number
  totalDiscountAmount: number
  notes: string | null
}

export type CreditCardPurchaseDetail = {
  id: string
  userId: string
  accountId: string
  categoryId: string | null
  wishlistItemId: string | null
  description: string
  notes: string | null
  purchaseDate: Date
  totalAmount: number
  installmentCount: number
  source: CreditCardPurchaseSource
  createdAt: Date
  updatedAt: Date
  account: {
    id: string
    name: string
    color: string | null
    icon: string | null
    networkBrandKey: string | null
  }
  category: {
    id: string
    name: string
    color: string | null
    icon: string | null
  } | null
  wishlistItem: {
    id: string
    name: string
  } | null
  installments: CreditCardPurchaseInstallmentSummary[]
  advances: CreditCardPurchaseAdvanceSummary[]
}

export type CreditCardPurchaseLedgerTransaction = {
  id: string
  userId: string
  accountId: string
  categoryId: string | null
  creditCardStatementId: string | null
  type: TransactionType
  amount: number
  description: string
  notes: string | null
  date: Date
  transferId: string | null
  createdAt: Date
  updatedAt: Date
}

export type CreateCreditCardPurchaseInput = {
  userId: string
  accountId: string
  categoryId?: string | null
  description: string
  notes?: string | null
  date: Date
  amount: number
  installmentCount: number
  source?: CreditCardPurchaseSource
  wishlistItemId?: string | null
}

export type CreateCreditCardPurchaseResult = {
  purchase: CreditCardPurchaseDetail
  primaryTransaction: CreditCardPurchaseLedgerTransaction
  transactions: CreditCardPurchaseLedgerTransaction[]
}

export type CreateCreditCardInstallmentAdvanceInput = {
  advancedAt: Date
  notes?: string | null
  installments: Array<{
    installmentId: string
    paidAmount: number
  }>
}

export type CreditCardInstallmentAdvanceResult = {
  purchase: CreditCardPurchaseDetail
  advance: CreditCardPurchaseAdvanceSummary
}
