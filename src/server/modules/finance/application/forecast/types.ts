import type { ForecastRiskLevel } from '@/generated/prisma/client'

export type ForecastAssumption = {
  label: string
  amount: number
  kind: 'actual' | 'recurring' | 'variable' | 'statement'
}

export type ForecastResult = {
  periodStart: Date
  periodEnd: Date
  referenceDate: Date
  actualIncome: number
  actualExpenses: number
  projectedRecurringIncome: number
  projectedRecurringExpenses: number
  projectedVariableIncome: number
  projectedVariableExpenses: number
  predictedBalance: number
  riskLevel: ForecastRiskLevel
  assumptions: ForecastAssumption[]
}
