import type { GoalMetric, GoalScopeType, GoalPeriod, GoalStatus } from '@/generated/prisma/client'

export type GoalProgressResult = {
  goalId: string
  name: string
  description: string | null
  metric: GoalMetric
  scopeType: GoalScopeType
  period: GoalPeriod
  targetAmount: number
  actualAmount: number
  projectedAmount: number
  progressPercent: number
  status: GoalStatus
  alerts: string[]
  periodStart: Date
  periodEnd: Date
}
