import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  prismaMock,
  txMock,
  invalidateAnalyticsSnapshotsMock,
  syncCreditCardTransactionStatementMock,
  refreshCreditCardStatementMock,
} = vi.hoisted(() => {
  const txMock = {
    creditCardPurchase: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    creditCardPurchaseInstallment: {
      create: vi.fn(),
      update: vi.fn(),
    },
    creditCardInstallmentAdvance: {
      create: vi.fn(),
    },
    wishlistItem: {
      update: vi.fn(),
    },
  }

  return {
    txMock,
    prismaMock: {
      account: {
        findFirst: vi.fn(),
      },
      category: {
        findFirst: vi.fn(),
      },
      creditCardPurchase: {
        findFirst: vi.fn(),
      },
      creditCardPurchaseInstallment: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    invalidateAnalyticsSnapshotsMock: vi.fn(),
    syncCreditCardTransactionStatementMock: vi.fn(),
    refreshCreditCardStatementMock: vi.fn(),
  }
})

vi.mock('@/server/db', () => ({
  prisma: prismaMock,
}))

vi.mock('../analytics', () => ({
  ANALYTICS_MUTATION_MODULES: {
    transaction: ['summary', 'goals', 'forecast', 'score', 'insights', 'credit-card'],
  },
  invalidateAnalyticsSnapshots: invalidateAnalyticsSnapshotsMock,
}))

vi.mock('../credit-card/billing', () => ({
  refreshCreditCardStatement: refreshCreditCardStatementMock,
  syncCreditCardTransactionStatement: syncCreditCardTransactionStatementMock,
}))

import {
  advanceCreditCardPurchaseInstallments,
  buildInstallmentSchedule,
  createCreditCardPurchase,
  splitAmountIntoInstallments,
} from './use-cases'

function makeLedgerTransaction(
  overrides: Partial<{
    id: string
    userId: string
    accountId: string
    categoryId: string | null
    creditCardStatementId: string | null
    type: 'EXPENSE'
    amount: number
    description: string
    notes: string | null
    date: Date
    transferId: string | null
    createdAt: Date
    updatedAt: Date
  }> = {},
) {
  const date = overrides.date ?? new Date(2026, 3, 21, 12, 0, 0, 0)

  return {
    id: overrides.id ?? 'tx-1',
    userId: overrides.userId ?? 'user-1',
    accountId: overrides.accountId ?? 'acc-card',
    categoryId: overrides.categoryId ?? 'cat-1',
    creditCardStatementId: overrides.creditCardStatementId ?? 'statement-1',
    type: 'EXPENSE' as const,
    amount: overrides.amount ?? 10_000,
    description: overrides.description ?? 'Compra parcelada',
    notes: overrides.notes ?? null,
    date,
    transferId: overrides.transferId ?? null,
    createdAt: overrides.createdAt ?? date,
    updatedAt: overrides.updatedAt ?? date,
  }
}

function makePurchasePayload(
  installments: Array<{
    id: string
    installmentNumber: number
    originalAmount: number
    originalDate: Date
    currentAmount?: number
    currentDate?: Date
    advance?: {
      id: string
      advancedAt: Date
      totalOriginalAmount: number
      totalPaidAmount: number
      totalDiscountAmount: number
    } | null
  }>,
) {
  return {
    id: 'purchase-1',
    userId: 'user-1',
    accountId: 'acc-card',
    categoryId: 'cat-1',
    wishlistItemId: null,
    description: 'Notebook',
    notes: 'Compra demo',
    purchaseDate: new Date('2026-04-21T12:00:00.000Z'),
    totalAmount: installments.reduce((sum, installment) => sum + installment.originalAmount, 0),
    installmentCount: installments.length,
    source: 'MANUAL',
    createdAt: new Date('2026-04-21T12:00:00.000Z'),
    updatedAt: new Date('2026-04-21T12:00:00.000Z'),
    account: {
      id: 'acc-card',
      name: 'Cartao Nubank',
      color: '#8b5cf6',
      icon: 'nubank',
      networkBrandKey: 'mastercard',
    },
    category: {
      id: 'cat-1',
      name: 'Tecnologia',
      color: '#3b82f6',
      icon: 'laptop',
    },
    wishlistItem: null,
    advances: Array.from(
      new Map(
        installments
          .map((installment) => installment.advance)
          .filter((advance): advance is NonNullable<typeof advance> => advance != null)
          .map((advance) => [
            advance.id,
            {
              ...advance,
              notes: 'Antecipado manualmente',
            },
          ]),
      ).values(),
    ),
    installments: installments.map((installment) => ({
      id: installment.id,
      installmentNumber: installment.installmentNumber,
      originalAmount: installment.originalAmount,
      originalDate: installment.originalDate,
      advance: installment.advance ?? null,
      ledgerTransaction: {
        id: `tx-${installment.installmentNumber}`,
        amount: installment.currentAmount ?? installment.originalAmount,
        date: installment.currentDate ?? installment.originalDate,
        creditCardStatementId: `statement-${installment.installmentNumber}`,
        creditCardStatement: {
          id: `statement-${installment.installmentNumber}`,
          dueDate: installment.currentDate ?? installment.originalDate,
          status: 'OPEN',
        },
      },
    })),
  } as const
}

describe('credit-card-purchases/use-cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (callback: typeof txMock) => callback(txMock))
  })

  it('splits cents deterministically across installments', () => {
    expect(splitAmountIntoInstallments(10_001, 3)).toEqual([3_334, 3_334, 3_333])
    expect(buildInstallmentSchedule(10_001, 3, new Date(2026, 3, 21, 12, 0, 0, 0))).toEqual([
      {
        installmentNumber: 1,
        amount: 3_334,
        date: new Date(2026, 3, 21, 12, 0, 0, 0),
      },
      {
        installmentNumber: 2,
        amount: 3_334,
        date: new Date(2026, 4, 21, 12, 0, 0, 0),
      },
      {
        installmentNumber: 3,
        amount: 3_333,
        date: new Date(2026, 5, 21, 12, 0, 0, 0),
      },
    ])
  })

  it('creates one ledger transaction per installment and syncs statements', async () => {
    prismaMock.account.findFirst.mockResolvedValue({
      id: 'acc-card',
      userId: 'user-1',
      type: 'CREDIT_CARD',
    })
    prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-1' })
    txMock.creditCardPurchase.create.mockResolvedValue({ id: 'purchase-1' })
    txMock.transaction.create
      .mockResolvedValueOnce(
        makeLedgerTransaction({
          id: 'tx-1',
          amount: 40_000,
          date: new Date('2026-04-21T12:00:00.000Z'),
        }),
      )
      .mockResolvedValueOnce(
        makeLedgerTransaction({
          id: 'tx-2',
          amount: 40_000,
          date: new Date('2026-05-21T12:00:00.000Z'),
        }),
      )
      .mockResolvedValueOnce(
        makeLedgerTransaction({
          id: 'tx-3',
          amount: 39_999,
          date: new Date('2026-06-21T12:00:00.000Z'),
        }),
      )
    syncCreditCardTransactionStatementMock
      .mockResolvedValueOnce({ id: 'statement-1' })
      .mockResolvedValueOnce({ id: 'statement-2' })
      .mockResolvedValueOnce({ id: 'statement-3' })
    prismaMock.creditCardPurchase.findFirst.mockResolvedValue(
      makePurchasePayload([
        {
          id: 'inst-1',
          installmentNumber: 1,
          originalAmount: 40_000,
          originalDate: new Date('2026-04-21T12:00:00.000Z'),
        },
        {
          id: 'inst-2',
          installmentNumber: 2,
          originalAmount: 40_000,
          originalDate: new Date('2026-05-21T12:00:00.000Z'),
        },
        {
          id: 'inst-3',
          installmentNumber: 3,
          originalAmount: 39_999,
          originalDate: new Date('2026-06-21T12:00:00.000Z'),
        },
      ]),
    )

    const result = await createCreditCardPurchase({
      userId: 'user-1',
      accountId: 'acc-card',
      categoryId: 'cat-1',
      description: 'Notebook',
      notes: 'Compra demo',
      date: new Date('2026-04-21T12:00:00.000Z'),
      amount: 119_999,
      installmentCount: 3,
    })

    expect(txMock.creditCardPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          accountId: 'acc-card',
          categoryId: 'cat-1',
          installmentCount: 3,
          totalAmount: 119_999,
        }),
      }),
    )
    expect(txMock.transaction.create).toHaveBeenCalledTimes(3)
    expect(txMock.creditCardPurchaseInstallment.create).toHaveBeenCalledTimes(3)
    expect(syncCreditCardTransactionStatementMock).toHaveBeenCalledTimes(3)
    expect(invalidateAnalyticsSnapshotsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        accountIds: ['acc-card'],
        categoryIds: ['cat-1'],
        statementIds: ['statement-1', 'statement-2', 'statement-3'],
      }),
    )
    expect(result.purchase.installmentCount).toBe(3)
    expect(result.transactions).toHaveLength(3)
    expect(result.primaryTransaction.id).toBe('tx-1')
  })

  it('records an advance and moves selected installments to the new payment date', async () => {
    const advancedAt = new Date(2026, 3, 20, 12, 0, 0, 0)

    prismaMock.creditCardPurchase.findFirst
      .mockResolvedValueOnce({
        id: 'purchase-1',
        accountId: 'acc-card',
        categoryId: 'cat-1',
        installments: [
          {
            id: 'inst-5',
            advanceId: null,
            originalAmount: 20_000,
            ledgerTransactionId: 'tx-5',
            ledgerTransaction: {
              id: 'tx-5',
              amount: 20_000,
              date: new Date('2026-05-21T12:00:00.000Z'),
              creditCardStatementId: 'statement-5',
            },
          },
          {
            id: 'inst-6',
            advanceId: null,
            originalAmount: 20_000,
            ledgerTransactionId: 'tx-6',
            ledgerTransaction: {
              id: 'tx-6',
              amount: 20_000,
              date: new Date('2026-06-21T12:00:00.000Z'),
              creditCardStatementId: 'statement-6',
            },
          },
        ],
      })
      .mockResolvedValueOnce(
        makePurchasePayload([
          {
            id: 'inst-5',
            installmentNumber: 5,
            originalAmount: 20_000,
            originalDate: new Date('2026-05-21T12:00:00.000Z'),
            currentAmount: 18_500,
            currentDate: advancedAt,
            advance: {
              id: 'advance-1',
              advancedAt,
              totalOriginalAmount: 40_000,
              totalPaidAmount: 36_900,
              totalDiscountAmount: 3_100,
            },
          },
          {
            id: 'inst-6',
            installmentNumber: 6,
            originalAmount: 20_000,
            originalDate: new Date('2026-06-21T12:00:00.000Z'),
            currentAmount: 18_400,
            currentDate: advancedAt,
            advance: {
              id: 'advance-1',
              advancedAt,
              totalOriginalAmount: 40_000,
              totalPaidAmount: 36_900,
              totalDiscountAmount: 3_100,
            },
          },
        ]),
      )
    txMock.creditCardInstallmentAdvance.create.mockResolvedValue({
      id: 'advance-1',
      advancedAt,
      totalOriginalAmount: 40_000,
      totalPaidAmount: 36_900,
      totalDiscountAmount: 3_100,
      notes: 'Desconto no app',
    })
    syncCreditCardTransactionStatementMock
      .mockResolvedValueOnce({ id: 'statement-new-1' })
      .mockResolvedValueOnce({ id: 'statement-new-2' })

    const result = await advanceCreditCardPurchaseInstallments(
      'purchase-1',
      {
        advancedAt,
        notes: 'Desconto no app',
        installments: [
          { installmentId: 'inst-5', paidAmount: 18_500 },
          { installmentId: 'inst-6', paidAmount: 18_400 },
        ],
      },
      'user-1',
    )

    expect(txMock.creditCardInstallmentAdvance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purchaseId: 'purchase-1',
          totalOriginalAmount: 40_000,
          totalPaidAmount: 36_900,
          totalDiscountAmount: 3_100,
        }),
      }),
    )
    expect(txMock.transaction.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'tx-5' },
        data: { amount: 18_500, date: advancedAt },
      }),
    )
    expect(txMock.transaction.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'tx-6' },
        data: { amount: 18_400, date: advancedAt },
      }),
    )
    expect(txMock.creditCardPurchaseInstallment.update).toHaveBeenCalledTimes(2)
    expect(syncCreditCardTransactionStatementMock).toHaveBeenCalledTimes(2)
    expect(invalidateAnalyticsSnapshotsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        accountIds: ['acc-card'],
        categoryIds: ['cat-1'],
      }),
    )
    expect(result.advance.totalDiscountAmount).toBe(3_100)
    expect(result.purchase.installments.every((installment) => installment.advance != null)).toBe(
      true,
    )
  })
})
