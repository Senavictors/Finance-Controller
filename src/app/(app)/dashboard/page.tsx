import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import {
  getMonthlyAnalyticsSummary,
  isValidMonthParam,
} from '@/server/modules/finance/application/analytics'
import { listGoalsWithProgress } from '@/server/modules/finance/application/goals'
import { calculateForecast } from '@/server/modules/finance/application/forecast'
import { redirect } from 'next/navigation'
import { DashboardClient } from './dashboard-client'
import { DEFAULT_WIDGETS } from './widgets/registry'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DashboardPage({ searchParams }: Props) {
  const session = await validateSession()
  if (!session) redirect('/login')
  const params = await searchParams

  const monthParam =
    typeof params.month === 'string' && isValidMonthParam(params.month) ? params.month : null

  const [user, analytics, dashboard, goals, forecast] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true },
    }),
    getMonthlyAnalyticsSummary({
      userId: session.userId,
      monthParam,
    }),
    prisma.dashboard.findUnique({
      where: { userId: session.userId },
      include: { widgets: { orderBy: { createdAt: 'asc' } } },
    }),
    listGoalsWithProgress(session.userId, monthParam),
    calculateForecast(session.userId, monthParam),
  ])

  const widgets =
    dashboard?.widgets.map((w) => ({
      id: w.id,
      type: w.type,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
    })) ?? DEFAULT_WIDGETS.map((w, i) => ({ id: `default-${i}`, ...w }))

  return (
    <DashboardClient
      data={{
        userName: user?.name ?? 'Usuario',
        totalIncome: analytics.totalIncome,
        totalExpenses: analytics.totalExpenses,
        incomeVariation: analytics.incomeVariation,
        expenseVariation: analytics.expenseVariation,
        transactionCount: analytics.transactionCount,
        expensesByCategory: analytics.expensesByCategory.map((category) => ({
          name: category.name,
          color: category.color ?? '#94a3b8',
          value: category.total,
        })),
        balanceByAccount: analytics.balanceByAccount.map((account) => ({
          name: account.name,
          color: account.color ?? '#3b82f6',
          balance: account.balance,
        })),
        recentTransactions: analytics.recentTransactions.map((tx) => ({
          id: tx.id,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          date: tx.date.toISOString(),
          account: tx.account,
          category: tx.category,
        })),
        goals: goals.map((goal) => ({
          id: goal.goalId,
          name: goal.name,
          metric: goal.metric,
          status: goal.status,
          progressPercent: goal.progressPercent,
          actualAmount: goal.actualAmount,
          targetAmount: goal.targetAmount,
        })),
        forecast: {
          predictedBalance: forecast.predictedBalance,
          riskLevel: forecast.riskLevel,
          actualIncome: forecast.actualIncome,
          actualExpenses: forecast.actualExpenses,
          projectedRecurringIncome: forecast.projectedRecurringIncome,
          projectedRecurringExpenses: forecast.projectedRecurringExpenses,
          projectedVariableExpenses: forecast.projectedVariableExpenses,
          assumptions: forecast.assumptions,
        },
      }}
      widgets={widgets}
    />
  )
}
