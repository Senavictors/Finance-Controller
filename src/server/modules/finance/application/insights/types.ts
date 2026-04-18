import type { InsightSeverity } from '@/generated/prisma/client'

export type InsightCtaAction = 'open-category' | 'open-goals' | 'open-forecast' | 'open-credit-card'

export type InsightCta = {
  label: string
  action: InsightCtaAction
  href?: string
}

export type InsightScopeType =
  | 'global'
  | 'category'
  | 'account'
  | 'goal'
  | 'forecast'
  | 'statement'

export type InsightCandidate = {
  key: string
  title: string
  body: string
  severity: InsightSeverity
  scopeType: InsightScopeType
  scopeId?: string | null
  cta?: InsightCta
  payload: Record<string, unknown>
  fingerprint: string
  priority: number
}

export type InsightRecord = InsightCandidate & {
  id: string
  isDismissed: boolean
  periodStart: Date
  periodEnd: Date
  createdAt: Date
}
