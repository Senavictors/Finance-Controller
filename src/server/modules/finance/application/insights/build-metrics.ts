import { prisma } from '@/server/db'
import { resolveObservationWindow } from '../analytics/observation-window'
import { resolveMonthPeriod } from '../analytics/period'
import { calculateForecast } from '../forecast'
import { listGoalsWithProgress } from '../goals'
import type { ForecastResult } from '../forecast'
import type { GoalProgressResult } from '../goals/types'

export type CategoryMetric = {
  categoryId: string | null
  name: string
  current: number
  previous: number
  deltaPercent: number
  deltaAbsolute: number
  sharePercent: number
}

export type OpenStatementMetric = {
  id: string
  accountId: string
  accountName: string
  dueDate: Date
  daysUntilDue: number
  outstanding: number
  creditLimit: number
  utilizationPercent: number
}

export type InsightMetrics = {
  periodStart: Date
  periodEnd: Date
  previousPeriodStart: Date
  previousPeriodEnd: Date
  totalIncome: number
  totalExpenses: number
  previousTotalIncome: number
  previousTotalExpenses: number
  expensesByCategory: CategoryMetric[]
  forecast: ForecastResult
  goals: GoalProgressResult[]
  openStatements: OpenStatementMetric[]
  totalCreditLimit: number
  totalCreditOutstanding: number
}

function pct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function daysUntil(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY)
}

export async function buildInsightMetrics(
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<InsightMetrics> {
  const period = resolveMonthPeriod(monthParam, now)
  const { from: periodStart, to: periodEnd, prevFrom, prevTo } = period
  const observation = resolveObservationWindow(periodStart, periodEnd, now)

  const [currentTxs, previousTxs, categories, creditCards, forecast, goals] = await Promise.all([
    observation.actualRange
      ? prisma.transaction.findMany({
          where: {
            userId,
            type: { in: ['INCOME', 'EXPENSE'] },
            date: { gte: observation.actualRange.from, lte: observation.actualRange.to },
          },
          select: { type: true, amount: true, categoryId: true },
        })
      : Promise.resolve([]),
    prisma.transaction.findMany({
      where: {
        userId,
        type: { in: ['INCOME', 'EXPENSE'] },
        date: { gte: prevFrom, lte: prevTo },
      },
      select: { type: true, amount: true, categoryId: true },
    }),
    prisma.category.findMany({
      where: { userId, type: 'EXPENSE' },
      select: { id: true, name: true },
    }),
    prisma.account.findMany({
      where: { userId, type: 'CREDIT_CARD', isArchived: false },
      select: {
        id: true,
        name: true,
        creditLimit: true,
        creditCardStatements: {
          where: {
            status: { not: 'PAID' },
            dueDate: { gte: periodStart },
          },
          select: {
            id: true,
            dueDate: true,
            totalAmount: true,
            paidAmount: true,
          },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
      },
    }),
    calculateForecast(userId, monthParam, now),
    listGoalsWithProgress(userId, monthParam, now).catch(() => [] as GoalProgressResult[]),
  ])

  let totalIncome = 0
  let totalExpenses = 0
  const currentByCategory = new Map<string | null, number>()
  for (const tx of currentTxs) {
    if (tx.type === 'INCOME') totalIncome += tx.amount
    else if (tx.type === 'EXPENSE') {
      totalExpenses += tx.amount
      currentByCategory.set(tx.categoryId, (currentByCategory.get(tx.categoryId) ?? 0) + tx.amount)
    }
  }

  let previousTotalIncome = 0
  let previousTotalExpenses = 0
  const previousByCategory = new Map<string | null, number>()
  for (const tx of previousTxs) {
    if (tx.type === 'INCOME') previousTotalIncome += tx.amount
    else if (tx.type === 'EXPENSE') {
      previousTotalExpenses += tx.amount
      previousByCategory.set(
        tx.categoryId,
        (previousByCategory.get(tx.categoryId) ?? 0) + tx.amount,
      )
    }
  }

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]))
  const categoryKeys = new Set<string | null>([
    ...currentByCategory.keys(),
    ...previousByCategory.keys(),
  ])
  const expensesByCategory: CategoryMetric[] = []
  for (const key of categoryKeys) {
    const current = currentByCategory.get(key) ?? 0
    const previous = previousByCategory.get(key) ?? 0
    const name = key ? (categoryNames.get(key) ?? 'Sem categoria') : 'Sem categoria'
    const share = totalExpenses > 0 ? Math.round((current / totalExpenses) * 1000) / 10 : 0
    expensesByCategory.push({
      categoryId: key,
      name,
      current,
      previous,
      deltaPercent: pct(current, previous),
      deltaAbsolute: current - previous,
      sharePercent: share,
    })
  }
  expensesByCategory.sort((a, b) => b.current - a.current)

  let totalCreditLimit = 0
  let totalCreditOutstanding = 0
  const openStatements: OpenStatementMetric[] = []
  for (const card of creditCards) {
    const limit = card.creditLimit ?? 0
    totalCreditLimit += limit
    for (const stmt of card.creditCardStatements) {
      const outstanding = Math.max(stmt.totalAmount - stmt.paidAmount, 0)
      if (outstanding <= 0) continue
      if (stmt.dueDate <= periodEnd) totalCreditOutstanding += outstanding
      openStatements.push({
        id: stmt.id,
        accountId: card.id,
        accountName: card.name,
        dueDate: stmt.dueDate,
        daysUntilDue: daysUntil(now, stmt.dueDate),
        outstanding,
        creditLimit: limit,
        utilizationPercent: limit > 0 ? Math.round((outstanding / limit) * 1000) / 10 : 0,
      })
    }
  }

  return {
    periodStart,
    periodEnd,
    previousPeriodStart: prevFrom,
    previousPeriodEnd: prevTo,
    totalIncome,
    totalExpenses,
    previousTotalIncome,
    previousTotalExpenses,
    expensesByCategory,
    forecast,
    goals,
    openStatements,
    totalCreditLimit,
    totalCreditOutstanding,
  }
}
