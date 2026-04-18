import { describe, expect, it } from 'vitest'
import {
  dedupeInsights,
  detectCategoryConcentration,
  detectCategorySpikes,
  detectCreditUtilizationHigh,
  detectForecastNegative,
  detectGoalAtRisk,
  detectStatementDueSoon,
} from './rules'
import type { InsightMetrics } from './build-metrics'
import type { GoalProgressResult } from '../goals/types'

function makeMetrics(partial: Partial<InsightMetrics> = {}): InsightMetrics {
  return {
    periodStart: new Date('2026-04-01'),
    periodEnd: new Date('2026-04-30'),
    previousPeriodStart: new Date('2026-03-01'),
    previousPeriodEnd: new Date('2026-03-31'),
    totalIncome: 10_000_00,
    totalExpenses: 5_000_00,
    previousTotalIncome: 10_000_00,
    previousTotalExpenses: 4_000_00,
    expensesByCategory: [],
    forecast: {
      periodStart: new Date('2026-04-01'),
      periodEnd: new Date('2026-04-30'),
      referenceDate: new Date('2026-04-15'),
      actualIncome: 5_000_00,
      actualExpenses: 3_000_00,
      projectedRecurringIncome: 0,
      projectedRecurringExpenses: 0,
      projectedVariableIncome: 0,
      projectedVariableExpenses: 1_000_00,
      predictedBalance: 1_000_00,
      riskLevel: 'LOW',
      assumptions: [],
    },
    goals: [],
    openStatements: [],
    totalCreditLimit: 0,
    totalCreditOutstanding: 0,
    ...partial,
  }
}

describe('detectCategorySpikes', () => {
  it('flags a category with >=20% growth and absolute delta >= R$100', () => {
    const insights = detectCategorySpikes(
      makeMetrics({
        expensesByCategory: [
          {
            categoryId: 'c1',
            name: 'Alimentacao',
            current: 60_000,
            previous: 40_000,
            deltaPercent: 50,
            deltaAbsolute: 20_000,
            sharePercent: 20,
          },
        ],
      }),
    )
    expect(insights).toHaveLength(1)
    expect(insights[0].severity).toBe('CRITICAL')
    expect(insights[0].scopeId).toBe('c1')
  })

  it('ignores small absolute deltas even with high percentage', () => {
    const insights = detectCategorySpikes(
      makeMetrics({
        expensesByCategory: [
          {
            categoryId: 'c1',
            name: 'Cafe',
            current: 5000,
            previous: 1000,
            deltaPercent: 400,
            deltaAbsolute: 4000,
            sharePercent: 5,
          },
        ],
      }),
    )
    expect(insights).toHaveLength(0)
  })

  it('ignores categories without previous data', () => {
    const insights = detectCategorySpikes(
      makeMetrics({
        expensesByCategory: [
          {
            categoryId: 'c1',
            name: 'Novo',
            current: 50_000,
            previous: 0,
            deltaPercent: 100,
            deltaAbsolute: 50_000,
            sharePercent: 20,
          },
        ],
      }),
    )
    expect(insights).toHaveLength(0)
  })
})

describe('detectCategoryConcentration', () => {
  it('flags when a single category exceeds 40% share', () => {
    const insights = detectCategoryConcentration(
      makeMetrics({
        totalExpenses: 100_000,
        expensesByCategory: [
          {
            categoryId: 'c1',
            name: 'Aluguel',
            current: 60_000,
            previous: 0,
            deltaPercent: 0,
            deltaAbsolute: 0,
            sharePercent: 60,
          },
        ],
      }),
    )
    expect(insights).toHaveLength(1)
    expect(insights[0].severity).toBe('CRITICAL')
  })

  it('ignores small absolute totals', () => {
    const insights = detectCategoryConcentration(
      makeMetrics({
        totalExpenses: 10_000,
        expensesByCategory: [
          {
            categoryId: 'c1',
            name: 'Mini',
            current: 8_000,
            previous: 0,
            deltaPercent: 0,
            deltaAbsolute: 0,
            sharePercent: 80,
          },
        ],
      }),
    )
    expect(insights).toHaveLength(0)
  })
})

function makeGoal(partial: Partial<GoalProgressResult>): GoalProgressResult {
  return {
    goalId: 'g1',
    name: 'Meta',
    description: null,
    metric: 'SAVING',
    scopeType: 'GLOBAL',
    period: 'MONTHLY',
    targetAmount: 100_000,
    actualAmount: 30_000,
    projectedAmount: 30_000,
    progressPercent: 30,
    status: 'AT_RISK',
    alerts: [],
    periodStart: new Date('2026-04-01'),
    periodEnd: new Date('2026-04-30'),
    ...partial,
  }
}

describe('detectGoalAtRisk', () => {
  it('flags AT_RISK goals as WARNING', () => {
    const insights = detectGoalAtRisk(makeMetrics({ goals: [makeGoal({})] }))
    expect(insights[0].severity).toBe('WARNING')
  })
  it('flags EXCEEDED limit goals as CRITICAL', () => {
    const insights = detectGoalAtRisk(
      makeMetrics({
        goals: [
          makeGoal({
            metric: 'EXPENSE_LIMIT',
            status: 'EXCEEDED',
            actualAmount: 120_000,
            progressPercent: 120,
          }),
        ],
      }),
    )
    expect(insights[0].severity).toBe('CRITICAL')
  })
  it('ignores ON_TRACK goals', () => {
    const insights = detectGoalAtRisk(
      makeMetrics({ goals: [makeGoal({ status: 'ON_TRACK' })] }),
    )
    expect(insights).toHaveLength(0)
  })
})

describe('detectForecastNegative', () => {
  it('flags negative predicted balance', () => {
    const insights = detectForecastNegative(
      makeMetrics({
        forecast: {
          periodStart: new Date('2026-04-01'),
          periodEnd: new Date('2026-04-30'),
          referenceDate: new Date('2026-04-15'),
          actualIncome: 1_000,
          actualExpenses: 5_000,
          projectedRecurringIncome: 0,
          projectedRecurringExpenses: 0,
          projectedVariableIncome: 0,
          projectedVariableExpenses: 0,
          predictedBalance: -50_000,
          riskLevel: 'HIGH',
          assumptions: [],
        },
      }),
    )
    expect(insights).toHaveLength(1)
    expect(insights[0].severity).toBe('CRITICAL')
  })
  it('is silent when balance is positive', () => {
    expect(detectForecastNegative(makeMetrics())).toHaveLength(0)
  })
})

describe('detectStatementDueSoon', () => {
  it('flags statements within 7 days', () => {
    const insights = detectStatementDueSoon(
      makeMetrics({
        openStatements: [
          {
            id: 's1',
            accountId: 'a1',
            accountName: 'Cartao X',
            dueDate: new Date('2026-04-20'),
            daysUntilDue: 3,
            outstanding: 80_000,
            creditLimit: 1_000_000,
            utilizationPercent: 8,
          },
        ],
      }),
    )
    expect(insights[0].key).toBe('statement_due_soon')
  })
  it('escalates overdue statements to statement_overdue CRITICAL', () => {
    const insights = detectStatementDueSoon(
      makeMetrics({
        openStatements: [
          {
            id: 's1',
            accountId: 'a1',
            accountName: 'Cartao X',
            dueDate: new Date('2026-04-10'),
            daysUntilDue: -5,
            outstanding: 80_000,
            creditLimit: 1_000_000,
            utilizationPercent: 8,
          },
        ],
      }),
    )
    expect(insights[0].key).toBe('statement_overdue')
    expect(insights[0].severity).toBe('CRITICAL')
  })
})

describe('detectCreditUtilizationHigh', () => {
  it('flags utilization >=70%', () => {
    const insights = detectCreditUtilizationHigh(
      makeMetrics({ totalCreditLimit: 1_000_000, totalCreditOutstanding: 750_000 }),
    )
    expect(insights).toHaveLength(1)
  })
  it('escalates utilization >=90% to CRITICAL', () => {
    const insights = detectCreditUtilizationHigh(
      makeMetrics({ totalCreditLimit: 1_000_000, totalCreditOutstanding: 950_000 }),
    )
    expect(insights[0].severity).toBe('CRITICAL')
  })
  it('is silent with no credit cards', () => {
    expect(detectCreditUtilizationHigh(makeMetrics())).toHaveLength(0)
  })
})

describe('dedupeInsights', () => {
  it('keeps the highest priority candidate per fingerprint', () => {
    const result = dedupeInsights([
      {
        key: 'x',
        title: 'low',
        body: '',
        severity: 'INFO',
        scopeType: 'global',
        payload: {},
        fingerprint: 'fp-1',
        priority: 10,
      },
      {
        key: 'x',
        title: 'high',
        body: '',
        severity: 'WARNING',
        scopeType: 'global',
        payload: {},
        fingerprint: 'fp-1',
        priority: 50,
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('high')
  })

  it('sorts by priority descending', () => {
    const result = dedupeInsights([
      {
        key: 'a',
        title: 'a',
        body: '',
        severity: 'INFO',
        scopeType: 'global',
        payload: {},
        fingerprint: 'a',
        priority: 10,
      },
      {
        key: 'b',
        title: 'b',
        body: '',
        severity: 'CRITICAL',
        scopeType: 'global',
        payload: {},
        fingerprint: 'b',
        priority: 90,
      },
    ])
    expect(result.map((i) => i.title)).toEqual(['b', 'a'])
  })
})
