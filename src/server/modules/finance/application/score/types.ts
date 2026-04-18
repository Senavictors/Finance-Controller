import type { FinancialScoreStatus } from '@/generated/prisma/client'

export type ScoreFactorKey =
  | 'savings_rate'
  | 'spend_stability'
  | 'income_consistency'
  | 'credit_card'
  | 'goals'

export type ScoreFactor = {
  key: ScoreFactorKey
  label: string
  weight: number
  points: number
  reason: string
  neutral?: boolean
}

export type ScoreInsight = {
  tone: 'positive' | 'warning' | 'negative' | 'info'
  message: string
}

export type FinancialScoreResult = {
  periodStart: Date
  periodEnd: Date
  score: number
  status: FinancialScoreStatus
  factors: ScoreFactor[]
  insights: ScoreInsight[]
  previousScore: number | null
  delta: number | null
}
