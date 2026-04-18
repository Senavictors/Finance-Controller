import { formatCurrency } from '@/lib/format'
import type { InsightMetrics } from './build-metrics'
import type { InsightCandidate } from './types'

const CATEGORY_SPIKE_PCT = 20
const CATEGORY_SPIKE_ABSOLUTE_CENTS = 10_000
const CATEGORY_CONCENTRATION_PCT = 40
const CATEGORY_CONCENTRATION_MIN_TOTAL_CENTS = 50_000
const CREDIT_UTILIZATION_HIGH_PCT = 70
const STATEMENT_DUE_SOON_DAYS = 7

function fingerprint(parts: Array<string | number | null | undefined>): string {
  return parts.map((p) => (p == null ? '~' : String(p))).join('|')
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded.toString().replace('.0', '')}%`
}

export function detectCategorySpikes(metrics: InsightMetrics): InsightCandidate[] {
  const results: InsightCandidate[] = []
  for (const cat of metrics.expensesByCategory) {
    if (!cat.categoryId) continue
    if (cat.previous <= 0) continue
    if (cat.deltaAbsolute < CATEGORY_SPIKE_ABSOLUTE_CENTS) continue
    if (cat.deltaPercent < CATEGORY_SPIKE_PCT) continue

    results.push({
      key: 'category_spike',
      title: `Gasto em ${cat.name} cresceu ${formatPct(cat.deltaPercent)}`,
      body: `Voce gastou ${formatCurrency(cat.current)} em ${cat.name} neste mes, ${formatCurrency(cat.deltaAbsolute)} a mais que no mes anterior.`,
      severity: cat.deltaPercent >= 50 ? 'CRITICAL' : 'WARNING',
      scopeType: 'category',
      scopeId: cat.categoryId,
      cta: {
        label: 'Ver categoria',
        action: 'open-category',
        href: `/transactions?category=${cat.categoryId}`,
      },
      payload: {
        current: cat.current,
        previous: cat.previous,
        deltaPercent: cat.deltaPercent,
        deltaAbsolute: cat.deltaAbsolute,
      },
      fingerprint: fingerprint(['category_spike', cat.categoryId]),
      priority: cat.deltaPercent >= 50 ? 70 : 50,
    })
  }
  return results
}

export function detectCategoryConcentration(metrics: InsightMetrics): InsightCandidate[] {
  if (metrics.totalExpenses < CATEGORY_CONCENTRATION_MIN_TOTAL_CENTS) return []
  const top = metrics.expensesByCategory[0]
  if (!top || !top.categoryId) return []
  if (top.sharePercent < CATEGORY_CONCENTRATION_PCT) return []

  return [
    {
      key: 'category_concentration',
      title: `${top.name} concentra ${formatPct(top.sharePercent)} das despesas`,
      body: `Uma unica categoria responde por ${formatPct(top.sharePercent)} dos seus gastos do mes. Diversificar ou revisar essa categoria pode liberar caixa.`,
      severity: top.sharePercent >= 60 ? 'CRITICAL' : 'WARNING',
      scopeType: 'category',
      scopeId: top.categoryId,
      cta: {
        label: 'Ver categoria',
        action: 'open-category',
        href: `/transactions?category=${top.categoryId}`,
      },
      payload: { sharePercent: top.sharePercent, total: top.current },
      fingerprint: fingerprint(['category_concentration', top.categoryId]),
      priority: 60,
    },
  ]
}

export function detectGoalAtRisk(metrics: InsightMetrics): InsightCandidate[] {
  const results: InsightCandidate[] = []
  for (const goal of metrics.goals) {
    if (goal.status === 'AT_RISK' || goal.status === 'EXCEEDED') {
      const isLimit = goal.metric === 'EXPENSE_LIMIT' || goal.metric === 'ACCOUNT_LIMIT'
      const title =
        goal.status === 'EXCEEDED'
          ? `Meta "${goal.name}" foi ultrapassada`
          : `Meta "${goal.name}" em risco`
      const body = isLimit
        ? `Voce ja usou ${formatCurrency(goal.actualAmount)} de ${formatCurrency(goal.targetAmount)} (${goal.progressPercent}%).`
        : `Progresso atual ${formatCurrency(goal.actualAmount)} de ${formatCurrency(goal.targetAmount)} (${goal.progressPercent}%). Ajuste o ritmo para alcancar a meta.`
      results.push({
        key: 'goal_at_risk',
        title,
        body,
        severity: goal.status === 'EXCEEDED' ? 'CRITICAL' : 'WARNING',
        scopeType: 'goal',
        scopeId: goal.goalId,
        cta: { label: 'Abrir metas', action: 'open-goals', href: '/goals' },
        payload: {
          status: goal.status,
          progressPercent: goal.progressPercent,
          actualAmount: goal.actualAmount,
          targetAmount: goal.targetAmount,
        },
        fingerprint: fingerprint(['goal_at_risk', goal.goalId]),
        priority: goal.status === 'EXCEEDED' ? 80 : 55,
      })
    }
  }
  return results
}

export function detectForecastNegative(metrics: InsightMetrics): InsightCandidate[] {
  const { forecast } = metrics
  if (forecast.predictedBalance >= 0) return []

  return [
    {
      key: 'forecast_negative',
      title: 'Saldo pode fechar o mes no negativo',
      body: `Mantendo o ritmo atual, a previsao de fechamento e ${formatCurrency(forecast.predictedBalance)}. Revise gastos variaveis ou adie compromissos nao essenciais.`,
      severity: 'CRITICAL',
      scopeType: 'forecast',
      cta: { label: 'Ver previsao', action: 'open-forecast', href: '/dashboard' },
      payload: {
        predictedBalance: forecast.predictedBalance,
        riskLevel: forecast.riskLevel,
      },
      fingerprint: fingerprint(['forecast_negative']),
      priority: 90,
    },
  ]
}

export function detectStatementDueSoon(metrics: InsightMetrics): InsightCandidate[] {
  const results: InsightCandidate[] = []
  for (const stmt of metrics.openStatements) {
    if (stmt.daysUntilDue > STATEMENT_DUE_SOON_DAYS) continue
    if (stmt.daysUntilDue < 0) {
      results.push({
        key: 'statement_overdue',
        title: `Fatura ${stmt.accountName} vencida`,
        body: `A fatura de ${formatCurrency(stmt.outstanding)} venceu em ${stmt.dueDate.toLocaleDateString('pt-BR')}. Regularize para evitar juros e impacto no score.`,
        severity: 'CRITICAL',
        scopeType: 'statement',
        scopeId: stmt.id,
        cta: {
          label: 'Abrir cartao',
          action: 'open-credit-card',
          href: `/credit-cards/${stmt.id}`,
        },
        payload: {
          outstanding: stmt.outstanding,
          daysUntilDue: stmt.daysUntilDue,
          dueDate: stmt.dueDate.toISOString(),
        },
        fingerprint: fingerprint(['statement_overdue', stmt.id]),
        priority: 95,
      })
      continue
    }
    results.push({
      key: 'statement_due_soon',
      title: `Fatura ${stmt.accountName} vence em ${stmt.daysUntilDue} dia(s)`,
      body: `Saldo em aberto de ${formatCurrency(stmt.outstanding)} com vencimento em ${stmt.dueDate.toLocaleDateString('pt-BR')}.`,
      severity: stmt.daysUntilDue <= 2 ? 'WARNING' : 'INFO',
      scopeType: 'statement',
      scopeId: stmt.id,
      cta: {
        label: 'Abrir cartao',
        action: 'open-credit-card',
        href: `/credit-cards/${stmt.id}`,
      },
      payload: {
        outstanding: stmt.outstanding,
        daysUntilDue: stmt.daysUntilDue,
        dueDate: stmt.dueDate.toISOString(),
      },
      fingerprint: fingerprint(['statement_due_soon', stmt.id]),
      priority: stmt.daysUntilDue <= 2 ? 65 : 40,
    })
  }
  return results
}

export function detectCreditUtilizationHigh(metrics: InsightMetrics): InsightCandidate[] {
  if (metrics.totalCreditLimit <= 0) return []
  const utilization = (metrics.totalCreditOutstanding / metrics.totalCreditLimit) * 100
  if (utilization < CREDIT_UTILIZATION_HIGH_PCT) return []

  return [
    {
      key: 'credit_utilization_high',
      title: `Cartao com utilizacao de ${formatPct(utilization)}`,
      body: `Voce esta usando ${formatCurrency(metrics.totalCreditOutstanding)} de ${formatCurrency(metrics.totalCreditLimit)} em limite de cartao. Utilizacao alta compromete o score e reduz folga em emergencias.`,
      severity: utilization >= 90 ? 'CRITICAL' : 'WARNING',
      scopeType: 'global',
      cta: { label: 'Ver cartoes', action: 'open-credit-card', href: '/credit-cards' },
      payload: {
        utilization,
        outstanding: metrics.totalCreditOutstanding,
        limit: metrics.totalCreditLimit,
      },
      fingerprint: fingerprint(['credit_utilization_high']),
      priority: utilization >= 90 ? 75 : 55,
    },
  ]
}

export const INSIGHT_RULES = [
  detectCategorySpikes,
  detectCategoryConcentration,
  detectGoalAtRisk,
  detectForecastNegative,
  detectStatementDueSoon,
  detectCreditUtilizationHigh,
] as const

export function runInsightRules(metrics: InsightMetrics): InsightCandidate[] {
  return INSIGHT_RULES.flatMap((rule) => rule(metrics))
}

export function dedupeInsights(candidates: InsightCandidate[]): InsightCandidate[] {
  const seen = new Map<string, InsightCandidate>()
  for (const candidate of candidates) {
    const existing = seen.get(candidate.fingerprint)
    if (!existing || candidate.priority > existing.priority) {
      seen.set(candidate.fingerprint, candidate)
    }
  }
  return [...seen.values()].sort((a, b) => b.priority - a.priority)
}
