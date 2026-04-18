import { describe, expect, it } from 'vitest'
import { buildMonthlyAnalyticsSummarySnapshot } from './summary-snapshot'
import type { MonthlyAnalyticsSummary } from './types'

describe('analytics/summary-snapshot', () => {
  it('serializa o resumo mensal para um snapshot seguro para cache', () => {
    const input: MonthlyAnalyticsSummary = {
      period: {
        year: 2026,
        month: 4,
        monthKey: '2026-04',
        from: new Date('2026-04-01T00:00:00.000Z'),
        to: new Date('2026-04-30T23:59:59.999Z'),
        prevFrom: new Date('2026-03-01T00:00:00.000Z'),
        prevTo: new Date('2026-03-31T23:59:59.999Z'),
      },
      totalIncome: 500_00,
      totalExpenses: 250_00,
      balance: 250_00,
      incomeVariation: 25,
      expenseVariation: 150,
      transactionCount: 4,
      balanceByAccount: [
        {
          id: 'acc-checking',
          name: 'Conta Principal',
          color: '#3b82f6',
          icon: 'nubank',
          type: 'CHECKING',
          balance: 1_300_00,
        },
      ],
      expensesByCategory: [
        {
          id: 'cat-food',
          name: 'Alimentacao',
          color: '#ef4444',
          icon: null,
          total: 200_00,
        },
      ],
      recentTransactions: [
        {
          id: 'tx-1',
          description: 'Mercado',
          amount: 200_00,
          type: 'EXPENSE',
          date: new Date('2026-04-18T12:00:00.000Z'),
          account: { name: 'Conta Principal', color: '#3b82f6', icon: 'nubank' },
          category: { name: 'Alimentacao', color: '#ef4444', icon: null },
        },
      ],
    }

    expect(buildMonthlyAnalyticsSummarySnapshot(input)).toEqual({
      monthKey: '2026-04',
      totalIncome: 500_00,
      totalExpenses: 250_00,
      balance: 250_00,
      incomeVariation: 25,
      expenseVariation: 150,
      transactionCount: 4,
      balanceByAccount: [
        {
          id: 'acc-checking',
          name: 'Conta Principal',
          color: '#3b82f6',
          icon: 'nubank',
          type: 'CHECKING',
          balance: 1_300_00,
        },
      ],
      expensesByCategory: [
        {
          id: 'cat-food',
          name: 'Alimentacao',
          color: '#ef4444',
          icon: null,
          total: 200_00,
        },
      ],
      recentTransactions: [
        {
          id: 'tx-1',
          description: 'Mercado',
          amount: 200_00,
          type: 'EXPENSE',
          date: '2026-04-18T12:00:00.000Z',
          account: { name: 'Conta Principal', color: '#3b82f6', icon: 'nubank' },
          category: { name: 'Alimentacao', color: '#ef4444', icon: null },
        },
      ],
    })
  })
})
