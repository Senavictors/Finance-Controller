import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { ANALYTICS_MUTATION_MODULES, invalidateAnalyticsSnapshots } from '../analytics'
import {
  refreshCreditCardStatement,
  syncCreditCardTransactionStatement,
} from '../credit-card/billing'
import type {
  CreateCreditCardInstallmentAdvanceInput,
  CreateCreditCardPurchaseInput,
  CreateCreditCardPurchaseResult,
  CreditCardInstallmentAdvanceResult,
  CreditCardPurchaseDetail,
  CreditCardPurchaseLedgerTransaction,
} from './types'

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeInstallmentDate(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0)
}

function addMonthsPreservingDay(value: Date, monthOffset: number) {
  const date = normalizeInstallmentDate(value)
  return new Date(date.getFullYear(), date.getMonth() + monthOffset, date.getDate(), 12, 0, 0, 0)
}

export function splitAmountIntoInstallments(totalAmount: number, installmentCount: number) {
  const baseAmount = Math.floor(totalAmount / installmentCount)
  const remainder = totalAmount % installmentCount

  return Array.from(
    { length: installmentCount },
    (_, index) => baseAmount + (index < remainder ? 1 : 0),
  )
}

export function buildInstallmentSchedule(
  totalAmount: number,
  installmentCount: number,
  date: Date,
) {
  const amounts = splitAmountIntoInstallments(totalAmount, installmentCount)

  return amounts.map((amount, index) => ({
    installmentNumber: index + 1,
    amount,
    date: addMonthsPreservingDay(date, index),
  }))
}

const purchaseDetailInclude = {
  account: {
    select: {
      id: true,
      name: true,
      color: true,
      icon: true,
      networkBrandKey: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      color: true,
      icon: true,
    },
  },
  wishlistItem: {
    select: {
      id: true,
      name: true,
    },
  },
  advances: {
    select: {
      id: true,
      advancedAt: true,
      totalOriginalAmount: true,
      totalPaidAmount: true,
      totalDiscountAmount: true,
      notes: true,
    },
    orderBy: { advancedAt: 'desc' as const },
  },
  installments: {
    select: {
      id: true,
      installmentNumber: true,
      originalAmount: true,
      originalDate: true,
      advance: {
        select: {
          id: true,
          advancedAt: true,
          totalOriginalAmount: true,
          totalPaidAmount: true,
          totalDiscountAmount: true,
        },
      },
      ledgerTransaction: {
        select: {
          id: true,
          amount: true,
          date: true,
          creditCardStatementId: true,
          creditCardStatement: {
            select: {
              id: true,
              dueDate: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: { installmentNumber: 'asc' as const },
  },
} satisfies Prisma.CreditCardPurchaseInclude

type CreditCardPurchasePayload = Prisma.CreditCardPurchaseGetPayload<{
  include: typeof purchaseDetailInclude
}>

async function ensureCreditCardAccount(accountId: string, userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      userId,
      isArchived: false,
    },
    select: {
      id: true,
      userId: true,
      type: true,
    },
  })

  if (!account) {
    throw new Error('Conta nao encontrada')
  }

  if (account.type !== 'CREDIT_CARD') {
    throw new Error('Parcelamento so pode ser usado em contas de cartao de credito')
  }

  return account
}

async function ensureExpenseCategory(categoryId: string, userId: string) {
  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      userId,
      type: 'EXPENSE',
    },
    select: { id: true },
  })

  if (!category) {
    throw new Error('Categoria financeira nao encontrada')
  }
}

function mapLedgerTransactionFromCreate(
  transaction: CreditCardPurchaseLedgerTransaction,
): CreditCardPurchaseLedgerTransaction {
  return transaction
}

function toCreditCardPurchaseDetail(purchase: CreditCardPurchasePayload): CreditCardPurchaseDetail {
  return {
    id: purchase.id,
    userId: purchase.userId,
    accountId: purchase.accountId,
    categoryId: purchase.categoryId,
    wishlistItemId: purchase.wishlistItemId,
    description: purchase.description,
    notes: purchase.notes,
    purchaseDate: purchase.purchaseDate,
    totalAmount: purchase.totalAmount,
    installmentCount: purchase.installmentCount,
    source: purchase.source,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
    account: purchase.account,
    category: purchase.category,
    wishlistItem: purchase.wishlistItem,
    advances: purchase.advances,
    installments: purchase.installments.map((installment) => ({
      id: installment.id,
      installmentNumber: installment.installmentNumber,
      originalAmount: installment.originalAmount,
      originalDate: installment.originalDate,
      currentAmount: installment.ledgerTransaction.amount,
      currentDate: installment.ledgerTransaction.date,
      creditCardStatementId: installment.ledgerTransaction.creditCardStatementId,
      creditCardStatement: installment.ledgerTransaction.creditCardStatement,
      advance: installment.advance,
    })),
  }
}

async function getCreditCardPurchaseOrThrow(purchaseId: string, userId: string) {
  const purchase = await prisma.creditCardPurchase.findFirst({
    where: { id: purchaseId, userId },
    include: purchaseDetailInclude,
  })

  if (!purchase) {
    throw new Error('Compra parcelada nao encontrada')
  }

  return purchase
}

async function syncPurchaseTransactions(transactions: Array<{ id: string }>) {
  const statements = await Promise.all(
    transactions.map((transaction) => syncCreditCardTransactionStatement(transaction.id)),
  )

  return statements
    .filter((statement): statement is NonNullable<typeof statement> => statement != null)
    .map((statement) => statement.id)
}

export async function createCreditCardPurchase(
  input: CreateCreditCardPurchaseInput,
): Promise<CreateCreditCardPurchaseResult> {
  if (input.installmentCount < 1 || input.installmentCount > 24) {
    throw new Error('Quantidade de parcelas invalida')
  }

  if (input.amount <= 0) {
    throw new Error('Valor da compra deve ser maior que zero')
  }

  const account = await ensureCreditCardAccount(input.accountId, input.userId)

  if (input.categoryId) {
    await ensureExpenseCategory(input.categoryId, input.userId)
  }

  const schedule = buildInstallmentSchedule(input.amount, input.installmentCount, input.date)

  const created = await prisma.$transaction(async (tx) => {
    const purchase = await tx.creditCardPurchase.create({
      data: {
        userId: input.userId,
        accountId: account.id,
        categoryId: input.categoryId ?? null,
        wishlistItemId: input.wishlistItemId ?? null,
        description: input.description.trim(),
        notes: trimOrNull(input.notes),
        purchaseDate: normalizeInstallmentDate(input.date),
        totalAmount: input.amount,
        installmentCount: input.installmentCount,
        source: input.source ?? 'MANUAL',
      },
    })

    const createdTransactions: CreditCardPurchaseLedgerTransaction[] = []

    for (const installment of schedule) {
      const transaction = await tx.transaction.create({
        data: {
          userId: input.userId,
          accountId: account.id,
          categoryId: input.categoryId ?? null,
          type: 'EXPENSE',
          amount: installment.amount,
          description: input.description.trim(),
          notes: trimOrNull(input.notes),
          date: installment.date,
        },
      })

      createdTransactions.push(mapLedgerTransactionFromCreate(transaction))

      await tx.creditCardPurchaseInstallment.create({
        data: {
          purchaseId: purchase.id,
          installmentNumber: installment.installmentNumber,
          originalAmount: installment.amount,
          originalDate: installment.date,
          ledgerTransactionId: transaction.id,
        },
      })
    }

    if (input.wishlistItemId) {
      await tx.wishlistItem.update({
        where: { id: input.wishlistItemId },
        data: {
          paidPrice: input.amount,
          purchasedAt: normalizeInstallmentDate(input.date),
          status: 'PURCHASED',
          purchaseTransactionId: null,
        },
      })
    }

    return {
      purchaseId: purchase.id,
      transactions: createdTransactions,
    }
  })

  const statementIds = await syncPurchaseTransactions(created.transactions)
  const purchase = await getCreditCardPurchaseOrThrow(created.purchaseId, input.userId)

  await invalidateAnalyticsSnapshots({
    userId: input.userId,
    modules: ANALYTICS_MUTATION_MODULES.transaction,
    dates: created.transactions.map((transaction) => transaction.date),
    accountIds: [input.accountId],
    categoryIds: [input.categoryId ?? null],
    statementIds,
  })

  return {
    purchase: toCreditCardPurchaseDetail(purchase),
    primaryTransaction: created.transactions[0],
    transactions: created.transactions,
  }
}

export async function getCreditCardPurchaseDetail(purchaseId: string, userId: string) {
  const purchase = await getCreditCardPurchaseOrThrow(purchaseId, userId)
  return toCreditCardPurchaseDetail(purchase)
}

export async function advanceCreditCardPurchaseInstallments(
  purchaseId: string,
  input: CreateCreditCardInstallmentAdvanceInput,
  userId: string,
): Promise<CreditCardInstallmentAdvanceResult> {
  const purchase = await prisma.creditCardPurchase.findFirst({
    where: { id: purchaseId, userId },
    include: {
      installments: {
        include: {
          ledgerTransaction: {
            select: {
              id: true,
              amount: true,
              date: true,
              creditCardStatementId: true,
            },
          },
        },
        orderBy: { installmentNumber: 'asc' },
      },
    },
  })

  if (!purchase) {
    throw new Error('Compra parcelada nao encontrada')
  }

  const selectedMap = new Map(
    input.installments.map((installment) => [installment.installmentId, installment.paidAmount]),
  )
  const selectedInstallments = purchase.installments.filter((installment) =>
    selectedMap.has(installment.id),
  )

  if (selectedInstallments.length !== input.installments.length) {
    throw new Error('Parcela invalida para este adiantamento')
  }

  const advancedAt = normalizeInstallmentDate(input.advancedAt)

  for (const installment of selectedInstallments) {
    if (installment.advanceId) {
      throw new Error('Uma ou mais parcelas selecionadas ja foram adiantadas')
    }

    if (installment.ledgerTransaction.date <= advancedAt) {
      throw new Error('So e possivel adiantar parcelas futuras')
    }
  }

  const totalOriginalAmount = selectedInstallments.reduce(
    (sum, installment) => sum + installment.originalAmount,
    0,
  )
  const totalPaidAmount = selectedInstallments.reduce(
    (sum, installment) => sum + (selectedMap.get(installment.id) ?? 0),
    0,
  )

  const advance = await prisma.$transaction(async (tx) => {
    const advance = await tx.creditCardInstallmentAdvance.create({
      data: {
        purchaseId: purchase.id,
        userId,
        accountId: purchase.accountId,
        advancedAt,
        totalOriginalAmount,
        totalPaidAmount,
        totalDiscountAmount: Math.max(totalOriginalAmount - totalPaidAmount, 0),
        notes: trimOrNull(input.notes),
      },
      select: {
        id: true,
        advancedAt: true,
        totalOriginalAmount: true,
        totalPaidAmount: true,
        totalDiscountAmount: true,
        notes: true,
      },
    })

    for (const installment of selectedInstallments) {
      const paidAmount = selectedMap.get(installment.id)
      if (paidAmount == null) {
        throw new Error('Parcela invalida para este adiantamento')
      }

      await tx.transaction.update({
        where: { id: installment.ledgerTransactionId },
        data: {
          amount: paidAmount,
          date: advancedAt,
        },
      })

      await tx.creditCardPurchaseInstallment.update({
        where: { id: installment.id },
        data: { advanceId: advance.id },
      })
    }

    return advance
  })

  const statementIds = await Promise.all(
    selectedInstallments.map((installment) =>
      syncCreditCardTransactionStatement(installment.ledgerTransactionId),
    ),
  )

  await invalidateAnalyticsSnapshots({
    userId,
    modules: ANALYTICS_MUTATION_MODULES.transaction,
    dates: [
      ...selectedInstallments.map((installment) => installment.ledgerTransaction.date),
      advancedAt,
    ],
    accountIds: [purchase.accountId],
    categoryIds: [purchase.categoryId],
    statementIds: [
      ...selectedInstallments.map(
        (installment) => installment.ledgerTransaction.creditCardStatementId,
      ),
      ...statementIds.map((statement) => statement?.id),
    ],
  })

  const refreshedPurchase = await getCreditCardPurchaseOrThrow(purchase.id, userId)

  return {
    purchase: toCreditCardPurchaseDetail(refreshedPurchase),
    advance,
  }
}

export async function deleteCreditCardPurchase(purchaseId: string, userId: string) {
  const purchase = await prisma.creditCardPurchase.findFirst({
    where: { id: purchaseId, userId },
    select: {
      id: true,
      accountId: true,
      categoryId: true,
      wishlistItemId: true,
      installments: {
        select: {
          ledgerTransactionId: true,
          originalDate: true,
          ledgerTransaction: {
            select: {
              id: true,
              date: true,
              creditCardStatementId: true,
            },
          },
        },
      },
    },
  })

  if (!purchase) {
    throw new Error('Compra parcelada nao encontrada')
  }

  const transactionIds = purchase.installments.map((installment) => installment.ledgerTransactionId)
  const previousStatementIds = purchase.installments.map(
    (installment) => installment.ledgerTransaction.creditCardStatementId,
  )
  const affectedDates = purchase.installments.map(
    (installment) => installment.ledgerTransaction.date,
  )

  await prisma.$transaction(async (tx) => {
    if (purchase.wishlistItemId) {
      await tx.wishlistItem.update({
        where: { id: purchase.wishlistItemId },
        data: {
          paidPrice: null,
          purchasedAt: null,
          status: 'READY_TO_BUY',
          purchaseTransactionId: null,
        },
      })
    }

    await tx.transaction.deleteMany({
      where: {
        id: { in: transactionIds },
      },
    })

    await tx.creditCardPurchase.delete({
      where: { id: purchase.id },
    })
  })

  await Promise.all(
    Array.from(new Set(previousStatementIds.filter((value): value is string => value != null))).map(
      (statementId) => refreshCreditCardStatement(statementId),
    ),
  )

  await invalidateAnalyticsSnapshots({
    userId,
    modules: ANALYTICS_MUTATION_MODULES.transaction,
    dates: affectedDates,
    accountIds: [purchase.accountId],
    categoryIds: [purchase.categoryId],
    statementIds: previousStatementIds,
  })

  return {
    id: purchase.id,
  }
}

export async function deleteCreditCardPurchaseByTransactionId(
  transactionId: string,
  userId: string,
) {
  const installment = await prisma.creditCardPurchaseInstallment.findFirst({
    where: {
      ledgerTransactionId: transactionId,
      purchase: {
        is: {
          userId,
        },
      },
    },
    select: {
      purchaseId: true,
    },
  })

  if (!installment) {
    return null
  }

  await deleteCreditCardPurchase(installment.purchaseId, userId)

  return {
    purchaseId: installment.purchaseId,
  }
}
