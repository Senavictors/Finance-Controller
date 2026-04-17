import { unstable_cache } from 'next/cache'
import {
  getAnalyticsModuleTag,
  getAnalyticsMonthTag,
  getAnalyticsRootTag,
  getAnalyticsUserTag,
} from './snapshot-tags'
import { getMonthlyAnalyticsSummary, type GetMonthlyAnalyticsSummaryInput } from './monthly-summary'
import type { MonthlyAnalyticsSummary } from './types'
import { resolveMonthPeriod } from './period'

export type MonthlyAnalyticsSummarySnapshot = Omit<
  MonthlyAnalyticsSummary,
  'period' | 'recentTransactions'
> & {
  monthKey: string
  recentTransactions: Array<
    Omit<MonthlyAnalyticsSummary['recentTransactions'][number], 'date'> & {
      date: string
    }
  >
}

export function buildMonthlyAnalyticsSummarySnapshot(
  summary: MonthlyAnalyticsSummary,
): MonthlyAnalyticsSummarySnapshot {
  return {
    monthKey: summary.period.monthKey,
    totalIncome: summary.totalIncome,
    totalExpenses: summary.totalExpenses,
    balance: summary.balance,
    incomeVariation: summary.incomeVariation,
    expenseVariation: summary.expenseVariation,
    transactionCount: summary.transactionCount,
    balanceByAccount: summary.balanceByAccount,
    expensesByCategory: summary.expensesByCategory,
    recentTransactions: summary.recentTransactions.map((transaction) => ({
      ...transaction,
      date: transaction.date.toISOString(),
    })),
  }
}

export async function getCachedMonthlyAnalyticsSummarySnapshot({
  userId,
  monthParam,
  recentTransactionsLimit = 5,
}: GetMonthlyAnalyticsSummaryInput): Promise<MonthlyAnalyticsSummarySnapshot> {
  const period = resolveMonthPeriod(monthParam)

  const loadSnapshot = unstable_cache(
    async () =>
      buildMonthlyAnalyticsSummarySnapshot(
        await getMonthlyAnalyticsSummary({
          userId,
          monthParam: period.monthKey,
          recentTransactionsLimit,
        }),
      ),
    ['analytics-summary-snapshot', userId, period.monthKey, String(recentTransactionsLimit)],
    {
      tags: [
        getAnalyticsRootTag(),
        getAnalyticsUserTag(userId),
        getAnalyticsModuleTag({ userId, module: 'summary' }),
        getAnalyticsMonthTag({ userId, module: 'summary', monthKey: period.monthKey }),
      ],
    },
  )

  return loadSnapshot()
}
