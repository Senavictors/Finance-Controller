import { describe, expect, it } from 'vitest'
import { formatCalendarDate } from './calendar'
import { DebtError } from './errors'
import { monthsToPayoff, payoffDate, simulateAmortization } from './payoff'
import { annualEquivalent, rankDebtsByRate, type RankableDebt } from './rate'
import { revolvingMonthlyCost, revolvingMonthlyCostDetail } from './revolving'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe('revolvingMonthlyCost (CA-06)', () => {
  it('não pago 100000 a 12% a.m. = 12000', () => {
    expect(revolvingMonthlyCost({ unpaid: 100_000, monthlyRate: 0.12 })).toBe(12_000)
  })

  it('teto de 100% do original: já cobrado 95000 => só 5000 cabem', () => {
    const input = {
      unpaid: 100_000,
      monthlyRate: 0.12,
      originalPrincipal: 100_000,
      interestAlreadyCharged: 95_000,
      capMultiple: 1,
    }
    expect(revolvingMonthlyCost(input)).toBe(5000)
    expect(revolvingMonthlyCostDetail(input)).toEqual({
      cost: 5000,
      uncapped: 12_000,
      capped: true,
      remainingCap: 5000,
    })
  })

  it('teto já atingido => 0; abaixo do teto => custo cheio; capMultiple configurável', () => {
    expect(
      revolvingMonthlyCost({
        unpaid: 100_000,
        monthlyRate: 0.12,
        originalPrincipal: 100_000,
        interestAlreadyCharged: 100_000,
      }),
    ).toBe(0)
    expect(
      revolvingMonthlyCost({
        unpaid: 100_000,
        monthlyRate: 0.12,
        originalPrincipal: 100_000,
        interestAlreadyCharged: 10_000,
      }),
    ).toBe(12_000)
    expect(
      revolvingMonthlyCost({
        unpaid: 100_000,
        monthlyRate: 0.12,
        originalPrincipal: 100_000,
        interestAlreadyCharged: 95_000,
        capMultiple: 2,
      }),
    ).toBe(12_000)
    const detail = revolvingMonthlyCostDetail({
      unpaid: 100_000,
      monthlyRate: 0.12,
      originalPrincipal: 100_000,
      interestAlreadyCharged: 150_000,
    })
    expect(detail).toMatchObject({ cost: 0, capped: true, remainingCap: 0 })
  })

  it('sem originalPrincipal não há teto; não pago 0 = 0; validações', () => {
    expect(revolvingMonthlyCostDetail({ unpaid: 100_000, monthlyRate: 0.12 })).toEqual({
      cost: 12_000,
      uncapped: 12_000,
      capped: false,
    })
    expect(revolvingMonthlyCost({ unpaid: 0, monthlyRate: 0.12 })).toBe(0)
    expect(() => revolvingMonthlyCost({ unpaid: -1, monthlyRate: 0.1 })).toThrow(DebtError)
    expect(() => revolvingMonthlyCost({ unpaid: 1, monthlyRate: -0.1 })).toThrow(DebtError)
    expect(() => revolvingMonthlyCost({ unpaid: 1, monthlyRate: 0.1, capMultiple: -1 })).toThrow(
      DebtError,
    )
    expect(() =>
      revolvingMonthlyCost({ unpaid: 1, monthlyRate: 0.1, originalPrincipal: 1.5 }),
    ).toThrow(DebtError)
    expect(() =>
      revolvingMonthlyCost({
        unpaid: 1,
        monthlyRate: 0.1,
        originalPrincipal: 1,
        interestAlreadyCharged: -1,
      }),
    ).toThrow(DebtError)
  })
})

describe('monthsToPayoff (CA-07)', () => {
  it('100000 a 2% pagando 10000 => 12 meses', () => {
    expect(monthsToPayoff({ balance: 100_000, monthlyRate: 0.02, monthlyPayment: 10_000 })).toBe(12)
  })

  it('pagamento que não cobre os juros => Infinity (inclusive igual aos juros)', () => {
    expect(monthsToPayoff({ balance: 100_000, monthlyRate: 0.02, monthlyPayment: 2000 })).toBe(
      Infinity,
    )
    expect(monthsToPayoff({ balance: 100_000, monthlyRate: 0.02, monthlyPayment: 1500 })).toBe(
      Infinity,
    )
    expect(monthsToPayoff({ balance: 100_000, monthlyRate: 0.02, monthlyPayment: 0 })).toBe(
      Infinity,
    )
  })

  it('taxa zero: ceil(B/P); pagamento maior que o saldo = 1 mês; saldo zero = 0', () => {
    expect(monthsToPayoff({ balance: 100_000, monthlyRate: 0, monthlyPayment: 30_000 })).toBe(4)
    expect(monthsToPayoff({ balance: 100_000, monthlyRate: 0.02, monthlyPayment: 500_000 })).toBe(1)
    expect(monthsToPayoff({ balance: 0, monthlyRate: 0.02, monthlyPayment: 100 })).toBe(0)
    expect(monthsToPayoff({ balance: 100_000, monthlyRate: 0, monthlyPayment: 100_000 })).toBe(1)
  })

  it('cai exatamente num mês inteiro sem arredondar para o seguinte (tolerância de ponto flutuante)', () => {
    // PMT Price de 12x a 2% sobre 1.000.000 ~ 94559,6: 12 meses, não 13.
    expect(monthsToPayoff({ balance: 1_000_000, monthlyRate: 0.02, monthlyPayment: 94_560 })).toBe(
      12,
    )
  })

  it('valida entradas', () => {
    expect(() =>
      monthsToPayoff({ balance: Number.NaN, monthlyRate: 0.02, monthlyPayment: 1 }),
    ).toThrow(DebtError)
    expect(() => monthsToPayoff({ balance: 1, monthlyRate: -0.02, monthlyPayment: 1 })).toThrow(
      DebtError,
    )
  })

  it('payoffDate soma meses com clamp de fim de mês', () => {
    expect(formatCalendarDate(payoffDate(day('2026-10-31'), 4))).toBe('2027-02-28')
    expect(formatCalendarDate(payoffDate(day('2026-10-05'), 0))).toBe('2026-10-05')
    expect(() => payoffDate(day('2026-10-05'), -1)).toThrow(DebtError)
    expect(() => payoffDate(day('2026-10-05'), Infinity)).toThrow(DebtError)
  })
})

describe('simulateAmortization', () => {
  it('simula mês a mês com juros arredondados; soma paga = saldo + juros', () => {
    const result = simulateAmortization({
      balance: 100_000,
      monthlyRate: 0.02,
      monthlyPayment: 10_000,
    })
    expect(result.neverPaysOff).toBe(false)
    expect(result.months).toBe(12)
    expect(result.totalPaid).toBe(100_000 + result.totalInterest)
    expect(result.lastPayment).toBeLessThanOrEqual(10_000)
    // Conferência independente em ponto flutuante (sem arredondar por mês): juros ~ 12.4k
    let balance = 100_000
    let interest = 0
    for (let month = 0; month < 12; month += 1) {
      const i = balance * 0.02
      interest += i
      balance = Math.max(0, balance + i - 10_000)
    }
    expect(Math.abs(result.totalInterest - interest)).toBeLessThanOrEqual(12)
  })

  it('pagamento à vista abate o saldo antes dos juros', () => {
    const base = simulateAmortization({
      balance: 100_000,
      monthlyRate: 0.02,
      monthlyPayment: 10_000,
    })
    const lump = simulateAmortization({
      balance: 100_000,
      monthlyRate: 0.02,
      monthlyPayment: 10_000,
      lumpSum: 50_000,
    })
    expect(lump.months).toBeLessThan(base.months)
    expect(lump.totalInterest).toBeLessThan(base.totalInterest)
    expect(lump.lumpSumApplied).toBe(50_000)
    const all = simulateAmortization({
      balance: 100_000,
      monthlyRate: 0.02,
      monthlyPayment: 10_000,
      lumpSum: 999_999,
    })
    expect(all).toMatchObject({
      months: 0,
      totalInterest: 0,
      lumpSumApplied: 100_000,
      neverPaysOff: false,
    })
  })

  it('nunca quita quando o pagamento não cobre os juros ou estoura o limite de meses', () => {
    expect(
      simulateAmortization({ balance: 100_000, monthlyRate: 0.02, monthlyPayment: 2000 }),
    ).toMatchObject({ months: Infinity, neverPaysOff: true })
    expect(
      simulateAmortization({
        balance: 100_000,
        monthlyRate: 0.02,
        monthlyPayment: 2100,
        maxMonths: 12,
      }),
    ).toMatchObject({ months: Infinity, neverPaysOff: true })
  })

  it('taxa zero e saldo zero', () => {
    expect(
      simulateAmortization({ balance: 100_000, monthlyRate: 0, monthlyPayment: 30_000 }),
    ).toMatchObject({ months: 4, totalInterest: 0, lastPayment: 10_000 })
    expect(
      simulateAmortization({ balance: 0, monthlyRate: 0.02, monthlyPayment: 0 }),
    ).toMatchObject({ months: 0, neverPaysOff: false })
  })

  it('valida entradas', () => {
    expect(() =>
      simulateAmortization({ balance: -1, monthlyRate: 0.02, monthlyPayment: 1 }),
    ).toThrow(DebtError)
    expect(() =>
      simulateAmortization({ balance: 1, monthlyRate: 0.02, monthlyPayment: 1.5 }),
    ).toThrow(DebtError)
    expect(() =>
      simulateAmortization({ balance: 1, monthlyRate: 0.02, monthlyPayment: 1, lumpSum: -1 }),
    ).toThrow(DebtError)
    expect(() => simulateAmortization({ balance: 1, monthlyRate: -1, monthlyPayment: 1 })).toThrow(
      DebtError,
    )
  })
})

describe('annualEquivalent (CA-08)', () => {
  it('2% a.m. ~ 26,82% a.a.; zero = 0', () => {
    expect(annualEquivalent(0.02)).toBeCloseTo(0.2682, 4)
    expect(annualEquivalent(0)).toBe(0)
  })

  it('confere com (1+i)^12 - 1 por potência', () => {
    for (const rate of [0.005, 0.019, 0.07, 0.08, 0.12]) {
      expect(annualEquivalent(rate)).toBeCloseTo((1 + rate) ** 12 - 1, 10)
    }
  })

  it('taxa inválida => NaN', () => {
    expect(annualEquivalent(Number.NaN)).toBeNaN()
    expect(annualEquivalent(-2)).toBeNaN()
  })
})

describe('rankDebtsByRate (CA-09)', () => {
  const debt = (
    id: string,
    monthlyRate: number,
    monthlyCost: number,
    outstanding: number,
  ): RankableDebt => ({ id, monthlyRate, monthlyCost, outstanding })

  it('rotativo 12% > cheque especial 8% > Pix no crédito 7% > consignado 1,9%', () => {
    const ranked = rankDebtsByRate([
      debt('consignado', 0.019, 19_000, 1_000_000),
      debt('pix', 0.07, 14_000, 200_000),
      debt('rotativo', 0.12, 12_000, 100_000),
      debt('cheque', 0.08, 4000, 50_000),
    ])
    expect(ranked.map((item) => item.id)).toEqual(['rotativo', 'cheque', 'pix', 'consignado'])
  })

  it('a ordem vem da taxa, não do tipo ou do saldo', () => {
    const ranked = rankDebtsByRate([debt('a', 0.01, 100_000, 10_000_000), debt('b', 0.09, 1, 1)])
    expect(ranked.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('empate de taxa: custo mensal, depois saldo, depois id', () => {
    const ranked = rankDebtsByRate([
      debt('c', 0.08, 4000, 50_000),
      debt('a', 0.08, 5000, 10_000),
      debt('b', 0.08, 4000, 90_000),
      debt('d', 0.08, 4000, 50_000),
    ])
    expect(ranked.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('lista vazia, 1 item, imutabilidade e preserva campos extras', () => {
    expect(rankDebtsByRate([])).toEqual([])
    const only = { ...debt('x', 0.05, 1, 1), name: 'Único' }
    expect(rankDebtsByRate([only])).toEqual([only])
    const input = [debt('l', 0.01, 1, 1), debt('h', 0.1, 1, 1)]
    const snapshot = structuredClone(input)
    const output = rankDebtsByRate(input)
    expect(input).toEqual(snapshot)
    expect(output).not.toBe(input)
  })

  it('ruído de ponto flutuante na taxa não quebra o empate', () => {
    const ranked = rankDebtsByRate([debt('b', 0.1 + 0.2 - 0.2, 1, 1), debt('a', 0.1, 5, 1)])
    expect(ranked.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
