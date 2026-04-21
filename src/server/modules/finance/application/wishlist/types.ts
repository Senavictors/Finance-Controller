import type {
  TransactionType,
  WishlistItemPriority,
  WishlistItemStatus,
} from '@/generated/prisma/client'

export type WishlistItemFilters = {
  status?: WishlistItemStatus
  priority?: WishlistItemPriority
  categoryId?: string
  q?: string
}

export type WishlistCategorySummary = {
  id: string
  name: string
}

export type WishlistListItem = {
  id: string
  name: string
  categoryId: string | null
  desiredPrice: number
  paidPrice: number | null
  productUrl: string | null
  priority: WishlistItemPriority
  status: WishlistItemStatus
  desiredPurchaseDate: Date | null
  purchasedAt: Date | null
  purchaseTransactionId: string | null
  createdAt: Date
  updatedAt: Date
  category: WishlistCategorySummary | null
  purchaseTransaction: {
    id: string
    accountId: string
    date: Date
    amount: number
    description: string
  } | null
}

export type WishlistPurchaseResult = {
  item: WishlistListItem
  transaction: {
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
}
