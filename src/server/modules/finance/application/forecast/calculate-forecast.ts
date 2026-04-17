import { prisma } from '@/server/db'
import type { ForecastRiskLevel } from '@/generated/prisma/client'
import { resolveMonthPeriod } from '../analytics/period'
import { listProjectedRecurringDates } from './project-recurrences'
import type { ForecastAssumption, ForecastResult } from './types'

const MS_PER_DAY = 86_400_000
const HISTORICAL_MONTHS = 2

function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY) + 1)
}

function classifyRisk(predictedBalance: number): ForecastRiskLevel {
  if (predictedBalance < 0) return 'HIGH'
  if (predictedBalance < 50_000) return 'MEDIUM'
  return 'LOW'
}

function clampReferenceToPeriod(periodStart: Date, periodEnd: Date, referenceDate: Date): Date {
  if (referenceDate < periodStart) return periodStart
  if (referenceDate > periodEnd) return periodEnd
  return referenceDate
}

export async function calculateForecast(
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<ForecastResult> {
  const period = resolveMonthPeriod(monthParam, now)
  const { from: periodStart, to: periodEnd } = period
  const referenceDate = clampReferenceToPeriod(periodStart, periodEnd, now)

  const historicalStart = new Date(
    periodStart.getFullYear(),
    periodStart.getMonth() - HISTORICAL_MONTHS,
    1,
  )
  const historicalEnd = new Date(periodStart.getTime() - 1)

  const [actualTransactions, historicalTransactions, recurringRules, openStatements] =
    await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId,
          type: { in: ['INCOME', 'EXPENSE'] },
          date: { gte: periodStart, lte: referenceDate },
        },
        select: { type: true, amount: true },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: 'EXPENSE',
          date: { gte: historicalStart, lte: historicalEnd },
        },
        select: { amount: true, date: true, categoryId: true },
      }),
      prisma.recurringRule.findMany({
        where: { userId, isActive: true },
      }),
      prisma.creditCardStatement.findMany({
        where: {
          userId,
          status: { not: 'PAID' },
          dueDate: { gte: periodStart, lte: periodEnd },
        },
        include: { account: { select: { name: true } } },
      }),
    ])

  const assumptions: ForecastAssumption[] = []

  let actualIncome = 0
  let actualExpenses = 0
  for (const tx of actualTransactions) {
    if (tx.type === 'INCOME') actualIncome += tx.amount
    else if (tx.type === 'EXPENSE') actualExpenses += tx.amount
  }
  assumptions.push({ label: 'Receitas realizadas', amount: actualIncome, kind: 'actual' })
  assumptions.push({ label: 'Despesas realizadas', amount: actualExpenses, kind: 'actual' })

  let projectedRecurringIncome = 0
  let projectedRecurringExpenses = 0
  for (const rule of recurringRules) {
    const dates = listProjectedRecurringDates(rule, periodStart, periodEnd, referenceDate)
    if (dates.length === 0) continue
    const total = rule.amount * dates.length
    if (rule.type === 'INCOME') projectedRecurringIncome += total
    else if (rule.type === 'EXPENSE') projectedRecurringExpenses += total
  }
  if (projectedRecurringIncome > 0) {
    assumptions.push({
      label: 'Receitas recorrentes futuras',
      amount: projectedRecurringIncome,
      kind: 'recurring',
    })
  }
  if (projectedRecurringExpenses > 0) {
    assumptions.push({
      label: 'Despesas recorrentes futuras',
      amount: projectedRecurringExpenses,
      kind: 'recurring',
    })
  }

  const historicalDays = daysBetween(historicalStart, historicalEnd)
  const historicalTotalExpense = historicalTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const dailyVariableAvg = historicalDays > 0 ? historicalTotalExpense / historicalDays : 0

  const remainingDays = Math.max(
    0,
    Math.ceil((periodEnd.getTime() - referenceDate.getTime()) / MS_PER_DAY),
  )
  const projectedVariableExpenses = Math.round(dailyVariableAvg * remainingDays)
  const projectedVariableIncome = 0

  if (projectedVariableExpenses > 0) {
    assumptions.push({
      label: `Despesas variaveis projetadas (media de ${HISTORICAL_MONTHS} meses)`,
      amount: projectedVariableExpenses,
      kind: 'variable',
    })
  }

  for (const statement of openStatements) {
    const outstanding = Math.max(statement.totalAmount - statement.paidAmount, 0)
    if (outstanding <= 0) continue
    assumptions.push({
      label: `Fatura ${statement.account.name} venc. ${statement.dueDate.toLocaleDateString('pt-BR')}`,
      amount: outstanding,
      kind: 'statement',
    })
  }

  const predictedBalance =
    actualIncome +
    projectedRecurringIncome +
    projectedVariableIncome -
    actualExpenses -
    projectedRecurringExpenses -
    projectedVariableExpenses

  const riskLevel = classifyRisk(predictedBalance)

  return {
    periodStart,
    periodEnd,
    referenceDate,
    actualIncome,
    actualExpenses,
    projectedRecurringIncome,
    projectedRecurringExpenses,
    projectedVariableIncome,
    projectedVariableExpenses,
    predictedBalance,
    riskLevel,
    assumptions,
  }
}

export async function refreshForecastSnapshot(
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<ForecastResult> {
  const result = await calculateForecast(userId, monthParam, now)

  await prisma.forecastSnapshot.upsert({
    where: { userId_periodStart: { userId, periodStart: result.periodStart } },
    create: {
      userId,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      referenceDate: result.referenceDate,
      actualIncome: result.actualIncome,
      actualExpenses: result.actualExpenses,
      projectedRecurringIncome: result.projectedRecurringIncome,
      projectedRecurringExpenses: result.projectedRecurringExpenses,
      projectedVariableIncome: result.projectedVariableIncome,
      projectedVariableExpenses: result.projectedVariableExpenses,
      predictedBalance: result.predictedBalance,
      riskLevel: result.riskLevel,
      assumptions: result.assumptions,
    },
    update: {
      periodEnd: result.periodEnd,
      referenceDate: result.referenceDate,
      actualIncome: result.actualIncome,
      actualExpenses: result.actualExpenses,
      projectedRecurringIncome: result.projectedRecurringIncome,
      projectedRecurringExpenses: result.projectedRecurringExpenses,
      projectedVariableIncome: result.projectedVariableIncome,
      projectedVariableExpenses: result.projectedVariableExpenses,
      predictedBalance: result.predictedBalance,
      riskLevel: result.riskLevel,
      assumptions: result.assumptions,
      calculatedAt: new Date(),
      staleAt: null,
    },
  })

  return result
}
