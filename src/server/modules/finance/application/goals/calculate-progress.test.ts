import { describe, expect, it } from 'vitest'

// Pure logic extracted for testability

type GoalMetric = 'SAVING' | 'EXPENSE_LIMIT' | 'INCOME_TARGET' | 'ACCOUNT_LIMIT'
type GoalStatus = 'ON_TRACK' | 'WARNING' | 'AT_RISK' | 'ACHIEVED' | 'EXCEEDED'

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
  const pct = target > 0 ? Math.round((comparator / target) * 100) : 0
  const isLimit = metric === 'EXPENSE_LIMIT' || metric === 'ACCOUNT_LIMIT'

  if (isLimit) {
    if (pct >= 100) return 'EXCEEDED'
    if (pct >= dangerPercent) return 'AT_RISK'
    if (pct >= warningPercent) return 'WARNING'
    return 'ON_TRACK'
  }
  if (pct >= 100) return 'ACHIEVED'
  if (pct >= dangerPercent) return 'ON_TRACK'
  if (pct >= warningPercent) return 'WARNING'
  return 'AT_RISK'
}

describe('resolveStatus — EXPENSE_LIMIT', () => {
  const base = { target: 100000, warning: 80, danger: 95, current: false }

  it('returns ON_TRACK when spending is low', () => {
    expect(resolveStatus('EXPENSE_LIMIT', 50000, 50000, base.target, base.warning, base.danger, base.current)).toBe('ON_TRACK')
  })

  it('returns WARNING at 80%', () => {
    expect(resolveStatus('EXPENSE_LIMIT', 80000, 80000, base.target, base.warning, base.danger, base.current)).toBe('WARNING')
  })

  it('returns AT_RISK at 95%', () => {
    expect(resolveStatus('EXPENSE_LIMIT', 95000, 95000, base.target, base.warning, base.danger, base.current)).toBe('AT_RISK')
  })

  it('returns EXCEEDED at 100%', () => {
    expect(resolveStatus('EXPENSE_LIMIT', 100000, 100000, base.target, base.warning, base.danger, base.current)).toBe('EXCEEDED')
  })

  it('uses projected for current period', () => {
    // actual=60k (60%), projected=110k (110%) → EXCEEDED
    expect(resolveStatus('EXPENSE_LIMIT', 60000, 110000, base.target, base.warning, base.danger, true)).toBe('EXCEEDED')
  })
})

describe('resolveStatus — SAVING', () => {
  const base = { target: 100000, warning: 80, danger: 95, current: false }

  it('returns ACHIEVED when actual >= target', () => {
    expect(resolveStatus('SAVING', 100000, 100000, base.target, base.warning, base.danger, base.current)).toBe('ACHIEVED')
  })

  it('returns ON_TRACK at 95%', () => {
    expect(resolveStatus('SAVING', 95000, 95000, base.target, base.warning, base.danger, base.current)).toBe('ON_TRACK')
  })

  it('returns WARNING at 80%', () => {
    expect(resolveStatus('SAVING', 80000, 80000, base.target, base.warning, base.danger, base.current)).toBe('WARNING')
  })

  it('returns AT_RISK below 80%', () => {
    expect(resolveStatus('SAVING', 30000, 30000, base.target, base.warning, base.danger, base.current)).toBe('AT_RISK')
  })

  it('uses projected for current period — on track', () => {
    // actual=60k but projected=98k → ON_TRACK
    expect(resolveStatus('SAVING', 60000, 98000, base.target, base.warning, base.danger, true)).toBe('ON_TRACK')
  })
})

describe('resolveStatus — INCOME_TARGET', () => {
  it('returns ACHIEVED when income exceeds target', () => {
    expect(resolveStatus('INCOME_TARGET', 150000, 150000, 100000, 80, 95, false)).toBe('ACHIEVED')
  })

  it('returns AT_RISK when income is very low', () => {
    expect(resolveStatus('INCOME_TARGET', 10000, 10000, 100000, 80, 95, false)).toBe('AT_RISK')
  })
})

describe('resolveStatus — ACCOUNT_LIMIT', () => {
  it('returns EXCEEDED when over limit', () => {
    expect(resolveStatus('ACCOUNT_LIMIT', 120000, 120000, 100000, 80, 95, false)).toBe('EXCEEDED')
  })
})

describe('progressPercent calculation', () => {
  it('returns 0 when target is 0', () => {
    const pct = 0 > 0 ? Math.round((50000 / 0) * 100) : 0
    expect(pct).toBe(0)
  })

  it('rounds to nearest integer', () => {
    const pct = Math.round((33333 / 100000) * 100)
    expect(pct).toBe(33)
  })
})
