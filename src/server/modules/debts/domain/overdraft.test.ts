import { describe, expect, it } from 'vitest'
import { addCalendarDays } from './calendar'
import { buildDailyBalanceSeries } from './balance-series'
import { DebtError } from './errors'
import { estimateOverdraftCostFromSeries, overdraftMonthlyCost } from './overdraft'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

function flatSeries(start: string, days: number, balance: number) {
  return Array.from({ length: days }, (_, i) => ({ date: addCalendarDays(day(start), i), balance }))
}

describe('overdraftMonthlyCost (CA-05)', () => {
  it('uso 50000 a 8% a.m. = 4000 (R$ 40,00)', () => {
    expect(overdraftMonthlyCost({ used: 50_000, monthlyRate: 0.08 })).toBe(4000)
  })

  it('uso zero = 0; IOF opcional soma na taxa', () => {
    expect(overdraftMonthlyCost({ used: 0, monthlyRate: 0.08 })).toBe(0)
    expect(overdraftMonthlyCost({ used: 50_000, monthlyRate: 0.08, iofMonthly: 0.005 })).toBe(4250)
  })

  it('arredonda meio para cima e valida entradas', () => {
    expect(overdraftMonthlyCost({ used: 125, monthlyRate: 0.04 })).toBe(5)
    expect(overdraftMonthlyCost({ used: 1, monthlyRate: 0.5 })).toBe(1)
    expect(() => overdraftMonthlyCost({ used: -1, monthlyRate: 0.08 })).toThrow(DebtError)
    expect(() => overdraftMonthlyCost({ used: 100, monthlyRate: -0.08 })).toThrow(DebtError)
    expect(() => overdraftMonthlyCost({ used: 100, monthlyRate: 0.08, iofMonthly: -1 })).toThrow(
      DebtError,
    )
  })
})

describe('estimateOverdraftCostFromSeries (CA-05)', () => {
  it('saldo -50000 por 30 dias a 8% a.m. = 4000 (estimativa)', () => {
    const result = estimateOverdraftCostFromSeries({
      dailyBalances: flatSeries('2026-09-01', 30, -50_000),
      overdraftLimit: 100_000,
      monthlyRate: 0.08,
    })
    expect(Math.abs(result.costCents - 4000)).toBeLessThanOrEqual(1)
    expect(result).toMatchObject({
      days: 30,
      daysInOverdraft: 30,
      exposureCentsDays: 1_500_000,
      averageUsed: 50_000,
      maxUsed: 50_000,
      excessCentsDays: 0,
    })
  })

  it('saldo positivo = 0', () => {
    const result = estimateOverdraftCostFromSeries({
      dailyBalances: flatSeries('2026-09-01', 30, 10_000),
      overdraftLimit: 100_000,
      monthlyRate: 0.08,
    })
    expect(result.costCents).toBe(0)
    expect(result.daysInOverdraft).toBe(0)
  })

  it('o excedente além do limite fica fora da estimativa e é reportado à parte', () => {
    const result = estimateOverdraftCostFromSeries({
      dailyBalances: flatSeries('2026-09-01', 30, -130_000),
      overdraftLimit: 100_000,
      monthlyRate: 0.09,
    })
    // Só o uso dentro do limite (100000) gera custo: 100000 * 9% = 9000.
    expect(result.costCents).toBe(9000)
    expect(result.maxUsed).toBe(100_000)
    expect(result.maxExcess).toBe(30_000)
    expect(result.excessCentsDays).toBe(900_000)
  })

  it('uso igual ao limite e limite zero', () => {
    const atLimit = estimateOverdraftCostFromSeries({
      dailyBalances: flatSeries('2026-09-01', 30, -100_000),
      overdraftLimit: 100_000,
      monthlyRate: 0.1,
    })
    expect(atLimit.costCents).toBe(10_000)
    expect(atLimit.maxExcess).toBe(0)
    const noLimit = estimateOverdraftCostFromSeries({
      dailyBalances: flatSeries('2026-09-01', 30, -50_000),
      overdraftLimit: 0,
      monthlyRate: 0.1,
    })
    expect(noLimit.costCents).toBe(0)
    expect(noLimit.maxExcess).toBe(50_000)
  })

  it('alternância positivo/negativo conta só os dias no vermelho', () => {
    const balances = [-30_000, 20_000, -60_000, 0, -30_000, 10_000]
    const result = estimateOverdraftCostFromSeries({
      dailyBalances: balances.map((balance, i) => ({
        date: addCalendarDays(day('2026-09-01'), i),
        balance,
      })),
      overdraftLimit: 100_000,
      monthlyRate: 0.06,
    })
    expect(result.daysInOverdraft).toBe(3)
    expect(result.exposureCentsDays).toBe(120_000)
    expect(result.costCents).toBe(Math.round((120_000 * 0.06) / 30)) // 240
    expect(result.costCents).toBe(240)
    expect(result.averageUsed).toBe(20_000)
  })

  it('série vazia, IOF e validações', () => {
    expect(
      estimateOverdraftCostFromSeries({
        dailyBalances: [],
        overdraftLimit: 1000,
        monthlyRate: 0.08,
      }),
    ).toMatchObject({
      costCents: 0,
      days: 0,
      averageUsed: 0,
    })
    const withIof = estimateOverdraftCostFromSeries({
      dailyBalances: flatSeries('2026-09-01', 30, -50_000),
      overdraftLimit: 100_000,
      monthlyRate: 0.08,
      iofMonthly: 0.01,
    })
    expect(withIof.costCents).toBe(4500)
    expect(withIof.dailyRate).toBeCloseTo(0.09 / 30, 12)
    expect(() =>
      estimateOverdraftCostFromSeries({ dailyBalances: [], overdraftLimit: -1, monthlyRate: 0.08 }),
    ).toThrow(DebtError)
    expect(() =>
      estimateOverdraftCostFromSeries({ dailyBalances: [], overdraftLimit: 0, monthlyRate: -0.1 }),
    ).toThrow(DebtError)
  })
})

describe('buildDailyBalanceSeries', () => {
  it('reconstrói o saldo do fim de cada dia a partir da posição atual e dos lançamentos', () => {
    // Saldo atual -20000 em 10/10. Dia 05: +100000 (saldo inicial); dia 07: -150000; dia 09: +30000.
    const series = buildDailyBalanceSeries({
      currentBalance: -20_000,
      asOf: day('2026-10-10'),
      from: day('2026-10-04'),
      to: day('2026-10-10'),
      transactions: [
        { date: day('2026-10-05'), amount: 100_000 },
        { date: day('2026-10-07'), amount: -150_000 },
        { date: day('2026-10-09'), amount: 30_000 },
      ],
    })
    expect(series.map((row) => row.balance)).toEqual([
      0, // 04: antes do depósito
      100_000, // 05
      100_000, // 06
      -50_000, // 07
      -50_000, // 08
      -20_000, // 09
      -20_000, // 10
    ])
    expect(series[0].date.toISOString()).toBe('2026-10-04T12:00:00.000Z')
    expect(series[6].date.toISOString()).toBe('2026-10-10T12:00:00.000Z')
  })

  it('limita ao dia de referência, ignora ordem de entrada e cobre a virada de ano', () => {
    const series = buildDailyBalanceSeries({
      currentBalance: 5000,
      asOf: day('2027-01-02'),
      from: day('2026-12-30'),
      to: day('2027-01-31'),
      transactions: [
        { date: day('2027-01-02'), amount: 3000 },
        { date: day('2026-12-31'), amount: -2000 },
      ],
    })
    expect(series.map((row) => row.balance)).toEqual([4000, 2000, 2000, 5000])
    expect(series).toHaveLength(4)
  })

  it('período vazio e saldo atual inválido', () => {
    expect(
      buildDailyBalanceSeries({
        currentBalance: 0,
        asOf: day('2026-10-01'),
        from: day('2026-10-05'),
        to: day('2026-10-10'),
        transactions: [],
      }),
    ).toEqual([])
    expect(() =>
      buildDailyBalanceSeries({
        currentBalance: 1.5,
        asOf: day('2026-10-01'),
        from: day('2026-10-01'),
        to: day('2026-10-01'),
        transactions: [],
      }),
    ).toThrow(DebtError)
  })

  it('lançamento futuro (depois de asOf) é desfeito do saldo atual', () => {
    const series = buildDailyBalanceSeries({
      currentBalance: 1000,
      asOf: day('2026-10-10'),
      from: day('2026-10-09'),
      to: day('2026-10-10'),
      transactions: [{ date: day('2026-10-11'), amount: 400 }],
    })
    expect(series.map((row) => row.balance)).toEqual([600, 600])
  })
})
