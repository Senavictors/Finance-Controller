import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    transaction: {
      findMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/server/db', () => ({
  prisma: prismaMock,
}))

import { getMonthlyAnalyticsSummary } from './monthly-summary'

describe('analytics/monthly-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('agrega receitas, despesas, variacao e saldos por conta ignorando transferencias', async () => {
    prismaMock.transaction.findMany
      .mockResolvedValueOnce([
        { type: 'INCOME', amount: 500_00, categoryId: null, accountId: 'acc-checking' },
        { type: 'EXPENSE', amount: 200_00, categoryId: 'cat-food', accountId: 'acc-checking' },
        { type: 'EXPENSE', amount: 50_00, categoryId: 'cat-sub', accountId: 'acc-card' },
        { type: 'TRANSFER', amount: 999_00, categoryId: null, accountId: 'acc-checking' },
      ])
      .mockResolvedValueOnce([
        { type: 'INCOME', amount: 400_00 },
        { type: 'EXPENSE', amount: 100_00 },
      ])
      .mockResolvedValueOnce([
        {
          id: 'tx-1',
          description: 'Mercado',
          amount: 200_00,
          type: 'EXPENSE',
          date: new Date('2026-04-18T12:00:00.000Z'),
          account: { name: 'Conta Principal', color: '#3b82f6', icon: null },
          category: { name: 'Alimentacao', color: '#ef4444', icon: null },
        },
      ])

    prismaMock.account.findMany.mockResolvedValue([
      {
        id: 'acc-checking',
        name: 'Conta Principal',
        color: '#3b82f6',
        icon: 'nubank',
        initialBalance: 1_000_00,
        type: 'CHECKING',
      },
      {
        id: 'acc-card',
        name: 'Cartao',
        color: '#22c55e',
        icon: null,
        initialBalance: 0,
        type: 'CREDIT_CARD',
      },
    ])

    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-food', name: 'Alimentacao', color: '#ef4444', icon: null },
      { id: 'cat-sub', name: 'Assinaturas', color: '#8b5cf6', icon: 'netflix' },
    ])

    const summary = await getMonthlyAnalyticsSummary({
      userId: 'user-1',
      monthParam: '2026-04',
    })

    expect(summary.period.monthKey).toBe('2026-04')
    expect(summary.totalIncome).toBe(500_00)
    expect(summary.totalExpenses).toBe(250_00)
    expect(summary.balance).toBe(250_00)
    expect(summary.transactionCount).toBe(4)
    expect(summary.incomeVariation).toBe(25)
    expect(summary.expenseVariation).toBe(150)
    expect(summary.expensesByCategory).toEqual([
      { id: 'cat-food', name: 'Alimentacao', color: '#ef4444', icon: null, total: 200_00 },
      { id: 'cat-sub', name: 'Assinaturas', color: '#8b5cf6', icon: 'netflix', total: 50_00 },
    ])
    expect(summary.balanceByAccount).toEqual([
      {
        id: 'acc-checking',
        name: 'Conta Principal',
        color: '#3b82f6',
        icon: 'nubank',
        type: 'CHECKING',
        balance: 1_300_00,
      },
      {
        id: 'acc-card',
        name: 'Cartao',
        color: '#22c55e',
        icon: null,
        type: 'CREDIT_CARD',
        balance: -50_00,
      },
    ])
    expect(summary.recentTransactions).toHaveLength(1)
  })

  it('permite desligar a busca de transacoes recentes', async () => {
    prismaMock.transaction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    prismaMock.account.findMany.mockResolvedValue([])
    prismaMock.category.findMany.mockResolvedValue([])

    const summary = await getMonthlyAnalyticsSummary({
      userId: 'user-1',
      monthParam: '2026-04',
      recentTransactionsLimit: 0,
    })

    expect(summary.recentTransactions).toEqual([])
    expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(2)
  })

  it('limita o mes atual ate a data observada para nao contar parcelas futuras como realizadas', async () => {
    const now = new Date('2026-04-22T09:30:00.000Z')

    prismaMock.transaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    prismaMock.account.findMany.mockResolvedValue([])
    prismaMock.category.findMany.mockResolvedValue([])

    await getMonthlyAnalyticsSummary({
      userId: 'user-1',
      monthParam: '2026-04',
      now,
    })

    expect(prismaMock.transaction.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          date: expect.objectContaining({
            gte: new Date(2026, 3, 1),
            lte: now,
          }),
        }),
      }),
    )
  })
})
