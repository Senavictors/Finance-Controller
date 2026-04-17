import { prisma } from '@/server/db'
import type { GoalMetric, GoalStatus } from '@/generated/prisma/client'
import { resolveMonthPeriod } from '../analytics/period'
import type { GoalProgressResult } from './types'

function isLimitMetric(metric: GoalMetric) {
  return metric === 'EXPENSE_LIMIT' || metric === 'ACCOUNT_LIMIT'
}

function resolveStatus(
  metric: GoalMetric,
  actual: number,
  projected: number,
  target: number,
  warningPercent: number,
  dangerPercent: number,
  isCurrentPeriod: boolean,
): GoalStatus {
  const comparator = isCurrentPeriod ? projected : actual
  const ratio = target > 0 ? comparator / target : 0
  const pct = Math.round(ratio * 100)

  if (isLimitMetric(metric)) {
    if (pct >= 100) return 'EXCEEDED'
    if (pct >= dangerPercent) return 'AT_RISK'
    if (pct >= warningPercent) return 'WARNING'
    return 'ON_TRACK'
  }

  // SAVING / INCOME_TARGET — higher is better
  if (pct >= 100) return 'ACHIEVED'
  if (pct >= dangerPercent) return 'ON_TRACK'
  if (pct >= warningPercent) return 'WARNING'
  return 'AT_RISK'
}

function buildAlerts(
  metric: GoalMetric,
  status: GoalStatus,
  actualAmount: number,
  targetAmount: number,
): string[] {
  const alerts: string[] = []
  const remaining = targetAmount - actualAmount

  if (metric === 'EXPENSE_LIMIT' || metric === 'ACCOUNT_LIMIT') {
    if (status === 'EXCEEDED') alerts.push('Limite de gasto ultrapassado')
    else if (status === 'AT_RISK') alerts.push('Gasto muito proximo do limite')
    else if (status === 'WARNING') alerts.push('Gasto acima de 80% do limite')
  } else {
    if (status === 'ACHIEVED') alerts.push('Meta atingida!')
    else if (status === 'AT_RISK') alerts.push(`Faltam R$ ${(remaining / 100).toFixed(2)} para atingir a meta`)
    else if (status === 'WARNING') alerts.push('Progresso pode nao ser suficiente para atingir a meta')
  }

  return alerts
}

function computeProjected(actual: number, from: Date, to: Date, now: Date): number {
  if (now >= to) return actual

  const totalMs = to.getTime() - from.getTime()
  const elapsedMs = now.getTime() - from.getTime()
  const elapsed = Math.max(elapsedMs / totalMs, 0.01)

  return Math.round(actual / elapsed)
}

async function collectDescendantCategoryIds(
  userId: string,
  categoryId: string,
): Promise<string[]> {
  const all = await prisma.category.findMany({
    where: { userId },
    select: { id: true, parentId: true },
  })

  const ids = new Set<string>()
  const queue = [categoryId]

  while (queue.length > 0) {
    const current = queue.shift()!
    ids.add(current)
    all.filter((c) => c.parentId === current).forEach((c) => queue.push(c.id))
  }

  return Array.from(ids)
}

export async function calculateGoalProgress(
  goalId: string,
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<GoalProgressResult> {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    include: { account: { select: { id: true, type: true, creditLimit: true } } },
  })

  if (!goal) throw new Error('Meta nao encontrada')

  const period = resolveMonthPeriod(monthParam, now)
  const { from, to } = period
  const isCurrentPeriod = now >= from && now <= to

  let actualAmount = 0

  if (goal.metric === 'ACCOUNT_LIMIT' && goal.accountId) {
    const account = goal.account
    if (account?.type === 'CREDIT_CARD') {
      const openStatement = await prisma.creditCardStatement.findFirst({
        where: {
          userId,
          accountId: goal.accountId,
          status: { not: 'PAID' },
          dueDate: { gte: from },
        },
        orderBy: { dueDate: 'asc' },
      })
      actualAmount = openStatement
        ? Math.max(openStatement.totalAmount - openStatement.paidAmount, 0)
        : 0
    } else {
      const txs = await prisma.transaction.findMany({
        where: { userId, accountId: goal.accountId, type: 'EXPENSE', date: { gte: from, lte: to } },
        select: { amount: true },
      })
      actualAmount = txs.reduce((s, t) => s + t.amount, 0)
    }
  } else if (goal.metric === 'EXPENSE_LIMIT') {
    const categoryIds =
      goal.scopeType === 'CATEGORY' && goal.categoryId
        ? await collectDescendantCategoryIds(userId, goal.categoryId)
        : null

    const txs = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        date: { gte: from, lte: to },
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
        ...(goal.scopeType === 'ACCOUNT' && goal.accountId
          ? { accountId: goal.accountId }
          : {}),
      },
      select: { amount: true },
    })
    actualAmount = txs.reduce((s, t) => s + t.amount, 0)
  } else if (goal.metric === 'INCOME_TARGET') {
    const categoryIds =
      goal.scopeType === 'CATEGORY' && goal.categoryId
        ? await collectDescendantCategoryIds(userId, goal.categoryId)
        : null

    const txs = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'INCOME',
        date: { gte: from, lte: to },
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
        ...(goal.scopeType === 'ACCOUNT' && goal.accountId
          ? { accountId: goal.accountId }
          : {}),
      },
      select: { amount: true },
    })
    actualAmount = txs.reduce((s, t) => s + t.amount, 0)
  } else if (goal.metric === 'SAVING') {
    const txs = await prisma.transaction.findMany({
      where: { userId, type: { in: ['INCOME', 'EXPENSE'] }, date: { gte: from, lte: to } },
      select: { type: true, amount: true },
    })
    const income = txs.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0)
    actualAmount = Math.max(income - expense, 0)
  }

  const projectedAmount = computeProjected(actualAmount, from, to, now)
  const progressPercent = goal.targetAmount > 0
    ? Math.round((actualAmount / goal.targetAmount) * 100)
    : 0
  const status = resolveStatus(
    goal.metric,
    actualAmount,
    projectedAmount,
    goal.targetAmount,
    goal.warningPercent,
    goal.dangerPercent,
    isCurrentPeriod,
  )
  const alerts = buildAlerts(goal.metric, status, actualAmount, goal.targetAmount)

  return {
    goalId: goal.id,
    name: goal.name,
    description: goal.description,
    metric: goal.metric,
    scopeType: goal.scopeType,
    period: goal.period,
    targetAmount: goal.targetAmount,
    actualAmount,
    projectedAmount,
    progressPercent,
    status,
    alerts,
    periodStart: from,
    periodEnd: to,
  }
}

export async function refreshGoalSnapshot(
  goalId: string,
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<GoalProgressResult> {
  const result = await calculateGoalProgress(goalId, userId, monthParam, now)

  await prisma.goalSnapshot.upsert({
    where: { goalId_periodStart: { goalId, periodStart: result.periodStart } },
    create: {
      goalId,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      actualAmount: result.actualAmount,
      projectedAmount: result.projectedAmount,
      progressPercent: result.progressPercent,
      status: result.status,
    },
    update: {
      periodEnd: result.periodEnd,
      actualAmount: result.actualAmount,
      projectedAmount: result.projectedAmount,
      progressPercent: result.progressPercent,
      status: result.status,
      calculatedAt: new Date(),
    },
  })

  return result
}
