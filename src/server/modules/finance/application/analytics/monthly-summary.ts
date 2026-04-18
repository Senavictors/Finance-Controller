import { prisma } from '@/server/db'
import type { MonthlyAnalyticsSummary } from './types'
import { resolveMonthPeriod } from './period'

export type GetMonthlyAnalyticsSummaryInput = {
  userId: string
  monthParam?: string | null
  recentTransactionsLimit?: number
}

function sumTransactionsByType(
  transactions: Array<{ type: string; amount: number }>,
  type: 'INCOME' | 'EXPENSE',
) {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + transaction.amount, 0)
}

function roundVariation(current: number, previous: number) {
  if (previous <= 0) return 0
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

export async function getMonthlyAnalyticsSummary({
  userId,
  monthParam,
  recentTransactionsLimit = 5,
}: GetMonthlyAnalyticsSummaryInput): Promise<MonthlyAnalyticsSummary> {
  const period = resolveMonthPeriod(monthParam)

  const [transactions, previousTransactions, accounts, categories, recentTransactions] =
    await Promise.all([
      prisma.transaction.findMany({
        where: { userId, date: { gte: period.from, lte: period.to } },
        select: { type: true, amount: true, categoryId: true, accountId: true },
      }),
      prisma.transaction.findMany({
        where: { userId, date: { gte: period.prevFrom, lte: period.prevTo } },
        select: { type: true, amount: true },
      }),
      prisma.account.findMany({
        where: { userId, isArchived: false },
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          initialBalance: true,
          type: true,
        },
      }),
      prisma.category.findMany({
        where: { userId, type: 'EXPENSE' },
        select: { id: true, name: true, color: true, icon: true },
      }),
      recentTransactionsLimit > 0
        ? prisma.transaction.findMany({
            where: { userId },
            include: {
              account: { select: { name: true, color: true, icon: true } },
              category: { select: { name: true, color: true, icon: true } },
            },
            orderBy: { date: 'desc' },
            take: recentTransactionsLimit,
          })
        : Promise.resolve([]),
    ])

  const totalIncome = sumTransactionsByType(transactions, 'INCOME')
  const totalExpenses = sumTransactionsByType(transactions, 'EXPENSE')
  const previousIncome = sumTransactionsByType(previousTransactions, 'INCOME')
  const previousExpenses = sumTransactionsByType(previousTransactions, 'EXPENSE')

  const expensesByCategory = categories
    .map((category) => {
      const total = transactions
        .filter(
          (transaction) => transaction.categoryId === category.id && transaction.type === 'EXPENSE',
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0)

      return {
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        total,
      }
    })
    .filter((category) => category.total > 0)
    .sort((left, right) => right.total - left.total)

  const balanceByAccount = accounts.map((account) => {
    const accountTransactions = transactions.filter(
      (transaction) => transaction.accountId === account.id,
    )
    const income = sumTransactionsByType(accountTransactions, 'INCOME')
    const expenses = sumTransactionsByType(accountTransactions, 'EXPENSE')

    return {
      id: account.id,
      name: account.name,
      color: account.color,
      icon: account.icon,
      type: account.type,
      balance: account.initialBalance + income - expenses,
    }
  })

  return {
    period,
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    incomeVariation: roundVariation(totalIncome, previousIncome),
    expenseVariation: roundVariation(totalExpenses, previousExpenses),
    transactionCount: transactions.length,
    balanceByAccount,
    expensesByCategory,
    recentTransactions,
  }
}
