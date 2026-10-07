import type { LedgerTxn } from '../domain/types'

/** Representação pública de um lançamento (sem `userId`; datas de calendário `YYYY-MM-DD`). */
export interface TransactionDto {
  id: string
  accountId: string
  categoryId: string | null
  merchantId: string | null
  kind: LedgerTxn['kind']
  status: LedgerTxn['status']
  review: LedgerTxn['review']
  source: LedgerTxn['source']
  /** Centavos, assinado (positivo entra, negativo sai). */
  amount: number
  date: string
  postedDate: string | null
  description: string
  notes: string | null
  tags: string[]
  transferId: string | null
  excludeFromBudget: boolean
  userLocked: Record<string, boolean>
  createdAt: string
  updatedAt: string
}

function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function toTransactionDto(txn: LedgerTxn): TransactionDto {
  return {
    id: txn.id,
    accountId: txn.accountId,
    categoryId: txn.categoryId,
    merchantId: txn.merchantId,
    kind: txn.kind,
    status: txn.status,
    review: txn.review,
    source: txn.source,
    amount: txn.amount,
    date: calendarDay(txn.date),
    postedDate: txn.postedDate ? calendarDay(txn.postedDate) : null,
    description: txn.description,
    notes: txn.notes,
    tags: txn.tags,
    transferId: txn.transferId,
    excludeFromBudget: txn.excludeFromBudget,
    userLocked: txn.userLocked,
    createdAt: txn.createdAt.toISOString(),
    updatedAt: txn.updatedAt.toISOString(),
  }
}
