import { describe, expect, it } from 'vitest'
import { buildInstallmentSchedule, splitAmountIntoInstallments } from './installments'

describe('cards/domain/installments', () => {
  it('splits cents deterministically across installments', () => {
    expect(splitAmountIntoInstallments(10_001, 3)).toEqual([3_334, 3_334, 3_333])
    expect(buildInstallmentSchedule(10_001, 3, new Date(2026, 3, 21, 12, 0, 0, 0))).toEqual([
      {
        installmentNumber: 1,
        amount: 3_334,
        date: new Date(2026, 3, 21, 12, 0, 0, 0),
      },
      {
        installmentNumber: 2,
        amount: 3_334,
        date: new Date(2026, 4, 21, 12, 0, 0, 0),
      },
      {
        installmentNumber: 3,
        amount: 3_333,
        date: new Date(2026, 5, 21, 12, 0, 0, 0),
      },
    ])
  })

  it('a soma das parcelas é igual ao total', () => {
    for (const [total, count] of [
      [10_001, 3],
      [99_999, 7],
      [1, 4],
      [123_456, 12],
    ] as const) {
      const parts = splitAmountIntoInstallments(total, count)
      expect(parts).toHaveLength(count)
      expect(parts.reduce((sum, value) => sum + value, 0)).toBe(total)
    }
  })

  it('uma parcela devolve o valor total e uma única data', () => {
    expect(splitAmountIntoInstallments(5_000, 1)).toEqual([5_000])
    expect(buildInstallmentSchedule(5_000, 1, new Date(2026, 9, 5, 12, 0, 0, 0))).toEqual([
      { installmentNumber: 1, amount: 5_000, date: new Date(2026, 9, 5, 12, 0, 0, 0) },
    ])
  })

  it('cronograma mensal simples avança um mês por parcela e vira o ano', () => {
    const schedule = buildInstallmentSchedule(30_000, 4, new Date(2026, 10, 10, 12, 0, 0, 0))
    expect(schedule.map((item) => item.date)).toEqual([
      new Date(2026, 10, 10, 12, 0, 0, 0),
      new Date(2026, 11, 10, 12, 0, 0, 0),
      new Date(2027, 0, 10, 12, 0, 0, 0),
      new Date(2027, 1, 10, 12, 0, 0, 0),
    ])
    expect(schedule.map((item) => item.installmentNumber)).toEqual([1, 2, 3, 4])
  })
})
