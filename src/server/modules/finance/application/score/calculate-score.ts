import { prisma } from '@/server/db'
import type { FinancialScoreStatus } from '@/generated/prisma/client'
import { resolveMonthPeriod } from '../analytics/period'
import { listGoalsWithProgress } from '../goals'
import type { FinancialScoreResult, ScoreFactor, ScoreFactorKey, ScoreInsight } from './types'

const WEIGHTS: Record<ScoreFactorKey, number> = {
  savings_rate: 30,
  spend_stability: 20,
  income_consistency: 15,
  credit_card: 15,
  goals: 20,
}

const HISTORICAL_MONTHS = 3

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function round(value: number): number {
  return Math.round(value)
}

export function statusFromScore(score: number): FinancialScoreStatus {
  if (score >= 80) return 'EXCELLENT'
  if (score >= 60) return 'GOOD'
  if (score >= 40) return 'ATTENTION'
  return 'CRITICAL'
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const avg = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

type MonthBucket = { year: number; month: number; income: number; expense: number }

function bucketByMonth(
  transactions: Array<{ type: string; amount: number; date: Date }>,
  months: { year: number; month: number }[],
): MonthBucket[] {
  const buckets = months.map((m) => ({ ...m, income: 0, expense: 0 }))
  for (const tx of transactions) {
    if (tx.type !== 'INCOME' && tx.type !== 'EXPENSE') continue
    const y = tx.date.getFullYear()
    const m = tx.date.getMonth() + 1
    const bucket = buckets.find((b) => b.year === y && b.month === m)
    if (!bucket) continue
    if (tx.type === 'INCOME') bucket.income += tx.amount
    else bucket.expense += tx.amount
  }
  return buckets
}

export function buildSavingsRateFactor(income: number, expenses: number): ScoreFactor {
  if (income <= 0) {
    return {
      key: 'savings_rate',
      label: 'Taxa de economia',
      weight: WEIGHTS.savings_rate,
      points: 0,
      reason: 'Sem receita registrada no periodo',
    }
  }
  const saved = income - expenses
  const rate = saved / income
  const points = round(clamp(rate / 0.2, 0, 1) * WEIGHTS.savings_rate)
  const pct = Math.round(rate * 100)
  const reason =
    rate >= 0.2
      ? `Voce poupou ${pct}% da sua renda no mes`
      : rate > 0
        ? `Voce poupou ${pct}% da sua renda (meta saudavel: 20%)`
        : `Gastos superaram receita em ${Math.abs(pct)}%`
  return {
    key: 'savings_rate',
    label: 'Taxa de economia',
    weight: WEIGHTS.savings_rate,
    points,
    reason,
  }
}

export function buildSpendStabilityFactor(currentExpense: number, history: number[]): ScoreFactor {
  if (history.length === 0 || mean(history) === 0) {
    return {
      key: 'spend_stability',
      label: 'Estabilidade de gastos',
      weight: WEIGHTS.spend_stability,
      points: round(WEIGHTS.spend_stability * 0.6),
      reason: 'Sem historico suficiente para medir estabilidade',
      neutral: true,
    }
  }
  const avg = mean(history)
  const deviation = Math.abs(currentExpense - avg) / avg
  const normalized = 1 - clamp((deviation - 0.05) / 0.45, 0, 1)
  const points = round(WEIGHTS.spend_stability * normalized)
  const devPct = Math.round(deviation * 100)
  const reason =
    deviation <= 0.05
      ? `Gastos em linha com a media dos ultimos ${history.length} meses`
      : currentExpense > avg
        ? `Gastos ${devPct}% acima da media recente`
        : `Gastos ${devPct}% abaixo da media recente`
  return {
    key: 'spend_stability',
    label: 'Estabilidade de gastos',
    weight: WEIGHTS.spend_stability,
    points,
    reason,
  }
}

export function buildIncomeConsistencyFactor(history: number[]): ScoreFactor {
  const active = history.filter((v) => v > 0)
  if (active.length < 2) {
    return {
      key: 'income_consistency',
      label: 'Consistencia de renda',
      weight: WEIGHTS.income_consistency,
      points: round(WEIGHTS.income_consistency * 0.6),
      reason: 'Sem historico suficiente para medir consistencia',
      neutral: true,
    }
  }
  const avg = mean(active)
  if (avg === 0) {
    return {
      key: 'income_consistency',
      label: 'Consistencia de renda',
      weight: WEIGHTS.income_consistency,
      points: 0,
      reason: 'Nenhuma receita nos ultimos meses',
    }
  }
  const cv = stddev(active) / avg
  const normalized = 1 - clamp((cv - 0.1) / 0.4, 0, 1)
  const points = round(WEIGHTS.income_consistency * normalized)
  const cvPct = Math.round(cv * 100)
  const reason =
    cv <= 0.1 ? 'Renda estavel nos ultimos meses' : `Variacao de ${cvPct}% na renda mensal recente`
  return {
    key: 'income_consistency',
    label: 'Consistencia de renda',
    weight: WEIGHTS.income_consistency,
    points,
    reason,
  }
}

type CreditCardContext = {
  limit: number
  outstanding: number
  overdueCount: number
  cardsCount: number
}

export function buildCreditCardFactor(ctx: CreditCardContext): ScoreFactor {
  if (ctx.cardsCount === 0) {
    return {
      key: 'credit_card',
      label: 'Uso de cartao de credito',
      weight: 0,
      points: 0,
      reason: 'Nenhum cartao de credito configurado',
      neutral: true,
    }
  }

  let utilizationPoints = 10
  const utilization = ctx.limit > 0 ? ctx.outstanding / ctx.limit : 0
  if (ctx.limit === 0) utilizationPoints = 5
  else if (utilization <= 0.3) utilizationPoints = 10
  else if (utilization <= 0.5) utilizationPoints = 7
  else if (utilization <= 0.8) utilizationPoints = 3
  else utilizationPoints = 0

  const paymentPoints = ctx.overdueCount > 0 ? 0 : 5
  const points = utilizationPoints + paymentPoints

  const utilPct = Math.round(utilization * 100)
  let reason: string
  if (ctx.overdueCount > 0) {
    reason = `${ctx.overdueCount} fatura(s) em atraso comprometem a pontuacao`
  } else if (ctx.limit === 0) {
    reason = 'Cartao sem limite configurado; pagamentos em dia'
  } else if (utilization <= 0.3) {
    reason = `Utilizacao saudavel de ${utilPct}% do limite`
  } else if (utilization <= 0.5) {
    reason = `Utilizacao moderada de ${utilPct}% do limite`
  } else if (utilization <= 0.8) {
    reason = `Utilizacao elevada de ${utilPct}% do limite`
  } else {
    reason = `Utilizacao critica de ${utilPct}% do limite`
  }

  return {
    key: 'credit_card',
    label: 'Uso de cartao de credito',
    weight: WEIGHTS.credit_card,
    points,
    reason,
  }
}

type GoalSummary = {
  count: number
  avgPercent: number
  atRisk: number
}

export function buildGoalsFactor(summary: GoalSummary): ScoreFactor {
  if (summary.count === 0) {
    return {
      key: 'goals',
      label: 'Cumprimento de metas',
      weight: 0,
      points: 0,
      reason: 'Nenhuma meta ativa configurada',
      neutral: true,
    }
  }
  const normalized = clamp(summary.avgPercent / 100, 0, 1)
  const points = round(WEIGHTS.goals * normalized)
  const pct = Math.round(summary.avgPercent)
  const reason =
    summary.atRisk > 0
      ? `${summary.atRisk} de ${summary.count} meta(s) em risco; progresso medio ${pct}%`
      : `Progresso medio de ${pct}% em ${summary.count} meta(s)`
  return {
    key: 'goals',
    label: 'Cumprimento de metas',
    weight: WEIGHTS.goals,
    points,
    reason,
  }
}

function goalProgressPointsPercent(metric: string, actual: number, target: number): number {
  if (target <= 0) return 0
  if (metric === 'EXPENSE_LIMIT' || metric === 'ACCOUNT_LIMIT') {
    const usage = actual / target
    if (usage >= 1) return 0
    if (usage <= 0.5) return 100
    return round(((1 - usage) / 0.5) * 100)
  }
  return clamp(round((actual / target) * 100), 0, 100)
}

function buildInsights(factors: ScoreFactor[]): ScoreInsight[] {
  const insights: ScoreInsight[] = []
  const active = factors.filter((f) => f.weight > 0)
  if (active.length === 0) {
    return [{ tone: 'info', message: 'Cadastre transacoes para comecar a pontuar' }]
  }

  const sorted = [...active].sort((a, b) => a.points / a.weight - b.points / b.weight)
  const worst = sorted[0]
  const best = sorted[sorted.length - 1]

  if (worst.points / worst.weight < 0.5) {
    insights.push({ tone: 'negative', message: `Fator mais fraco: ${worst.label.toLowerCase()}` })
  }
  if (best.points / best.weight >= 0.8) {
    insights.push({ tone: 'positive', message: `${best.label} esta acima da meta` })
  }

  const savings = factors.find((f) => f.key === 'savings_rate')
  if (savings && savings.weight > 0 && savings.points < savings.weight * 0.5) {
    insights.push({
      tone: 'warning',
      message: 'Aumentar a taxa de economia pode elevar a pontuacao rapidamente',
    })
  }

  const cc = factors.find((f) => f.key === 'credit_card')
  if (cc && cc.weight > 0 && cc.points < cc.weight * 0.5) {
    insights.push({
      tone: 'warning',
      message: 'Reduzir utilizacao do cartao ou quitar faturas em atraso',
    })
  }

  const goals = factors.find((f) => f.key === 'goals')
  if (goals && goals.weight === 0) {
    insights.push({
      tone: 'info',
      message: 'Configurar metas pode adicionar ate 20 pontos',
    })
  }

  return insights.slice(0, 4)
}

export async function calculateFinancialScore(
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<FinancialScoreResult> {
  const period = resolveMonthPeriod(monthParam, now)
  const { from: periodStart, to: periodEnd } = period

  const historyStart = new Date(
    periodStart.getFullYear(),
    periodStart.getMonth() - HISTORICAL_MONTHS,
    1,
  )
  const historyEnd = new Date(periodStart.getTime() - 1)

  const [currentTxs, historyTxs, creditCards, goalsProgress, prevSnapshot] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        type: { in: ['INCOME', 'EXPENSE'] },
        date: { gte: periodStart, lte: periodEnd },
      },
      select: { type: true, amount: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: { in: ['INCOME', 'EXPENSE'] },
        date: { gte: historyStart, lte: historyEnd },
      },
      select: { type: true, amount: true, date: true },
    }),
    prisma.account.findMany({
      where: { userId, type: 'CREDIT_CARD', isArchived: false },
      select: {
        id: true,
        creditLimit: true,
        creditCardStatements: {
          where: {
            OR: [
              { status: { not: 'PAID' }, dueDate: { gte: periodStart, lte: periodEnd } },
              { status: 'OVERDUE' },
            ],
          },
          select: {
            status: true,
            totalAmount: true,
            paidAmount: true,
            dueDate: true,
          },
        },
      },
    }),
    listGoalsWithProgress(userId, monthParam).catch(() => [] as const),
    prisma.financialScoreSnapshot.findFirst({
      where: { userId, periodStart: { lt: periodStart } },
      orderBy: { periodStart: 'desc' },
      select: { score: true },
    }),
  ])

  let currentIncome = 0
  let currentExpense = 0
  for (const tx of currentTxs) {
    if (tx.type === 'INCOME') currentIncome += tx.amount
    else if (tx.type === 'EXPENSE') currentExpense += tx.amount
  }

  const historyMonths: { year: number; month: number }[] = []
  for (let i = HISTORICAL_MONTHS; i >= 1; i--) {
    const d = new Date(periodStart.getFullYear(), periodStart.getMonth() - i, 1)
    historyMonths.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  const buckets = bucketByMonth(historyTxs, historyMonths)
  const historicalExpenses = buckets.map((b) => b.expense)
  const historicalIncomes = buckets.map((b) => b.income)

  let totalLimit = 0
  let totalOutstanding = 0
  let overdueCount = 0
  for (const card of creditCards) {
    totalLimit += card.creditLimit ?? 0
    for (const stmt of card.creditCardStatements) {
      if (stmt.status === 'OVERDUE') overdueCount += 1
      if (stmt.status !== 'PAID' && stmt.dueDate >= periodStart && stmt.dueDate <= periodEnd) {
        totalOutstanding += Math.max(stmt.totalAmount - stmt.paidAmount, 0)
      }
    }
  }

  const activeGoals = goalsProgress.filter((g) => g.targetAmount > 0)
  const goalSummary: GoalSummary = {
    count: activeGoals.length,
    avgPercent:
      activeGoals.length > 0
        ? activeGoals.reduce(
            (sum, g) => sum + goalProgressPointsPercent(g.metric, g.actualAmount, g.targetAmount),
            0,
          ) / activeGoals.length
        : 0,
    atRisk: activeGoals.filter((g) => g.status === 'AT_RISK' || g.status === 'EXCEEDED').length,
  }

  const factors: ScoreFactor[] = [
    buildSavingsRateFactor(currentIncome, currentExpense),
    buildSpendStabilityFactor(currentExpense, historicalExpenses),
    buildIncomeConsistencyFactor(historicalIncomes),
    buildCreditCardFactor({
      limit: totalLimit,
      outstanding: totalOutstanding,
      overdueCount,
      cardsCount: creditCards.length,
    }),
    buildGoalsFactor(goalSummary),
  ]

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
  const totalPoints = factors.reduce((sum, f) => sum + f.points, 0)
  const score = totalWeight > 0 ? round((totalPoints / totalWeight) * 100) : 0
  const clampedScore = clamp(score, 0, 100)
  const status = statusFromScore(clampedScore)
  const insights = buildInsights(factors)

  const previousScore = prevSnapshot?.score ?? null
  const delta = previousScore !== null ? clampedScore - previousScore : null

  return {
    periodStart,
    periodEnd,
    score: clampedScore,
    status,
    factors,
    insights,
    previousScore,
    delta,
  }
}

export async function refreshFinancialScoreSnapshot(
  userId: string,
  monthParam?: string | null,
  now = new Date(),
): Promise<FinancialScoreResult> {
  const result = await calculateFinancialScore(userId, monthParam, now)

  await prisma.financialScoreSnapshot.upsert({
    where: { userId_periodStart: { userId, periodStart: result.periodStart } },
    create: {
      userId,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      score: result.score,
      status: result.status,
      factors: result.factors,
      insights: result.insights,
    },
    update: {
      periodEnd: result.periodEnd,
      score: result.score,
      status: result.status,
      factors: result.factors,
      insights: result.insights,
      calculatedAt: new Date(),
      staleAt: null,
    },
  })

  return result
}

export async function getFinancialScoreHistory(userId: string, limit = 12) {
  const snapshots = await prisma.financialScoreSnapshot.findMany({
    where: { userId },
    orderBy: { periodStart: 'desc' },
    take: limit,
    select: {
      periodStart: true,
      periodEnd: true,
      score: true,
      status: true,
      calculatedAt: true,
    },
  })
  return snapshots.reverse()
}
