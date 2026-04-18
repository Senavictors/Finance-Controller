import { describe, expect, it } from 'vitest'
import {
  buildCreditCardFactor,
  buildGoalsFactor,
  buildIncomeConsistencyFactor,
  buildSavingsRateFactor,
  buildSpendStabilityFactor,
  statusFromScore,
} from './calculate-score'

describe('statusFromScore', () => {
  it('returns CRITICAL below 40', () => {
    expect(statusFromScore(0)).toBe('CRITICAL')
    expect(statusFromScore(39)).toBe('CRITICAL')
  })
  it('returns ATTENTION between 40 and 59', () => {
    expect(statusFromScore(40)).toBe('ATTENTION')
    expect(statusFromScore(59)).toBe('ATTENTION')
  })
  it('returns GOOD between 60 and 79', () => {
    expect(statusFromScore(60)).toBe('GOOD')
    expect(statusFromScore(79)).toBe('GOOD')
  })
  it('returns EXCELLENT at 80+', () => {
    expect(statusFromScore(80)).toBe('EXCELLENT')
    expect(statusFromScore(100)).toBe('EXCELLENT')
  })
})

describe('buildSavingsRateFactor', () => {
  it('awards full weight at 20% savings rate', () => {
    const f = buildSavingsRateFactor(10_000_00, 8_000_00)
    expect(f.points).toBe(30)
  })
  it('awards partial at 10% savings', () => {
    const f = buildSavingsRateFactor(10_000_00, 9_000_00)
    expect(f.points).toBe(15)
  })
  it('returns zero when expenses exceed income', () => {
    const f = buildSavingsRateFactor(10_000_00, 12_000_00)
    expect(f.points).toBe(0)
  })
  it('returns zero with no income', () => {
    const f = buildSavingsRateFactor(0, 5_000_00)
    expect(f.points).toBe(0)
    expect(f.weight).toBe(30)
  })
})

describe('buildSpendStabilityFactor', () => {
  it('flags as neutral without history', () => {
    const f = buildSpendStabilityFactor(1000, [])
    expect(f.neutral).toBe(true)
  })
  it('awards full weight when deviation under 5%', () => {
    const f = buildSpendStabilityFactor(100, [100, 102, 98])
    expect(f.points).toBe(20)
  })
  it('reduces points with larger deviation', () => {
    const f = buildSpendStabilityFactor(200, [100, 100, 100])
    expect(f.points).toBeLessThan(10)
  })
})

describe('buildIncomeConsistencyFactor', () => {
  it('is neutral with fewer than 2 active months', () => {
    const f = buildIncomeConsistencyFactor([0, 0, 5000])
    expect(f.neutral).toBe(true)
  })
  it('awards full weight when income is stable', () => {
    const f = buildIncomeConsistencyFactor([5000, 5000, 5000])
    expect(f.points).toBe(15)
  })
  it('penalizes high variation', () => {
    const f = buildIncomeConsistencyFactor([1000, 5000, 10000])
    expect(f.points).toBeLessThan(10)
  })
})

describe('buildCreditCardFactor', () => {
  it('is neutral and weightless when no cards', () => {
    const f = buildCreditCardFactor({ cardsCount: 0, limit: 0, outstanding: 0, overdueCount: 0 })
    expect(f.weight).toBe(0)
    expect(f.neutral).toBe(true)
  })
  it('awards full 15 when utilization <=30% and no overdue', () => {
    const f = buildCreditCardFactor({
      cardsCount: 1,
      limit: 1_000_000,
      outstanding: 200_000,
      overdueCount: 0,
    })
    expect(f.points).toBe(15)
  })
  it('zeroes payment portion when overdue', () => {
    const f = buildCreditCardFactor({
      cardsCount: 1,
      limit: 1_000_000,
      outstanding: 200_000,
      overdueCount: 1,
    })
    expect(f.points).toBe(10)
  })
  it('penalizes critical utilization', () => {
    const f = buildCreditCardFactor({
      cardsCount: 1,
      limit: 1_000_000,
      outstanding: 900_000,
      overdueCount: 0,
    })
    expect(f.points).toBe(5)
  })
})

describe('buildGoalsFactor', () => {
  it('is weightless when no goals', () => {
    const f = buildGoalsFactor({ count: 0, avgPercent: 0, atRisk: 0 })
    expect(f.weight).toBe(0)
  })
  it('scales points from average percent', () => {
    const full = buildGoalsFactor({ count: 2, avgPercent: 100, atRisk: 0 })
    const half = buildGoalsFactor({ count: 2, avgPercent: 50, atRisk: 0 })
    expect(full.points).toBe(20)
    expect(half.points).toBe(10)
  })
})
