import { describe, expect, it } from 'vitest'
import { isValidMonthParam, resolveMonthPeriod } from './period'

describe('analytics/period', () => {
  it('valida month param no formato esperado', () => {
    expect(isValidMonthParam('2026-04')).toBe(true)
    expect(isValidMonthParam('2026-4')).toBe(false)
    expect(isValidMonthParam('abril-2026')).toBe(false)
    expect(isValidMonthParam(null)).toBe(false)
  })

  it('resolve periodo explicito com intervalo atual e anterior', () => {
    const period = resolveMonthPeriod('2026-04')

    expect(period.year).toBe(2026)
    expect(period.month).toBe(4)
    expect(period.monthKey).toBe('2026-04')
    expect(period.from).toEqual(new Date(2026, 3, 1))
    expect(period.to).toEqual(new Date(2026, 4, 0, 23, 59, 59, 999))
    expect(period.prevFrom).toEqual(new Date(2026, 2, 1))
    expect(period.prevTo).toEqual(new Date(2026, 3, 0, 23, 59, 59, 999))
  })

  it('usa a data de referencia quando o month param nao existe', () => {
    const referenceDate = new Date(2026, 7, 18, 10, 30, 0)
    const period = resolveMonthPeriod(undefined, referenceDate)

    expect(period.year).toBe(2026)
    expect(period.month).toBe(8)
    expect(period.monthKey).toBe('2026-08')
    expect(period.from).toEqual(new Date(2026, 7, 1))
    expect(period.to).toEqual(new Date(2026, 8, 0, 23, 59, 59, 999))
  })
})
