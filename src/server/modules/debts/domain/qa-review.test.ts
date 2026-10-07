import { describe, expect, it } from 'vitest'
import { DebtError } from './errors'
import { lateCharges } from './late-charges'
import { planNewLoan } from './new-loan'
import { monthsToPayoff } from './payoff'
import { buildAmortizationSchedule, impliedMonthlyRate, priceInstallment } from './price'
import { assessInstallment } from './summary'

/**
 * Revisão de QA (FC2-F1-05): conferência INDEPENDENTE dos números do módulo. As fórmulas aqui são
 * reimplementadas de forma textual (Math.pow, laço mês a mês) e não reutilizam `exactPmt`.
 */
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const textbookPmt = (p: number, i: number, n: number) =>
  i === 0 ? Math.round(p / n) : Math.round((p * i) / (1 - Math.pow(1 + i, -n)))

// Gerador determinístico (LCG) para fuzz reproduzível.
function lcg(seed: number) {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

describe('QA F1-05: Price contra a fórmula do livro-texto', () => {
  const table: [number, number, number, number][] = [
    [1_000_000, 0.02, 12, 94_560],
    [2_500_000, 0.0199, 48, 81_339],
    [350_000, 0.0349, 24, 21_773],
    [100_000, 0.07, 6, 20_980],
    [12_345_678, 0.0159, 120, 231_106],
  ]
  it.each(table)('PMT(%i, %f, %i) = %i', (principal, monthlyRate, installments, expected) => {
    expect(textbookPmt(principal, monthlyRate, installments)).toBe(expected)
    expect(priceInstallment({ principal, monthlyRate, installments })).toBe(expected)
  })

  it('fuzz: Σ amortizações = principal, saldo final 0, juros = round(saldo·i), nunca negativo', () => {
    const rand = lcg(20_261_007)
    for (let run = 0; run < 400; run += 1) {
      const principal = 1 + Math.floor(rand() * 5_000_000)
      const monthlyRate = Math.round(rand() * 0.12 * 1e6) / 1e6
      const installments = 1 + Math.floor(rand() * 120)
      const schedule = buildAmortizationSchedule({
        principal,
        monthlyRate,
        installments,
        firstDueDate: day('2026-01-31'),
      })
      expect(schedule).toHaveLength(installments)
      expect(schedule.reduce((sum, row) => sum + row.principal, 0)).toBe(principal)
      expect(schedule[installments - 1].balanceAfter).toBe(0)
      let balance = principal
      for (const row of schedule) {
        expect(row.interest).toBe(Math.round(balance * monthlyRate))
        expect(row.principal).toBeGreaterThanOrEqual(0)
        expect(row.amount).toBe(row.principal + row.interest)
        balance -= row.principal
        expect(row.balanceAfter).toBe(balance)
      }
    }
  })

  it('só a última parcela difere (resíduo) e fica dentro de ~0,5 centavo por parcela acumulada', () => {
    const schedule = buildAmortizationSchedule({
      principal: 1_000_000,
      monthlyRate: 0.02,
      installments: 12,
      firstDueDate: day('2026-11-05'),
    })
    expect(new Set(schedule.slice(0, 11).map((row) => row.amount)).size).toBe(1)
    expect(Math.abs(schedule[11].amount - schedule[0].amount)).toBeLessThanOrEqual(12)
  })
})

describe('QA F1-05: taxa implícita', () => {
  it.each([0.005, 0.019, 0.02, 0.07, 0.12])(
    'idas e voltas %f (erro < 1e-5, PMT em centavos)',
    (rate) => {
      const principal = 5_000_000
      const installments = 24
      const installmentAmount = textbookPmt(principal, rate, installments)
      const implied = impliedMonthlyRate({ principal, installmentAmount, installments })
      expect(Math.abs(implied - rate)).toBeLessThan(1e-5)
    },
  )

  it('parcela absurda não trava nem devolve NaN; o cadastro recusa com erro de domínio', () => {
    const implied = impliedMonthlyRate({
      principal: 1_000,
      installmentAmount: 1_000_000_000,
      installments: 12,
    })
    expect(Number.isFinite(implied)).toBe(true)
    let caught: unknown
    try {
      planNewLoan({
        kind: 'CONSIGNADO',
        name: 'Contrato fictício',
        principalCents: 1_000,
        installmentAmountCents: 1_000_000_000,
        installmentCount: 12,
        firstDueDate: day('2026-11-05'),
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(DebtError)
  })

  it('contrato de 120 parcelas em valores grandes fecha o principal e o saldo em zero', () => {
    const principal = 100_000_000
    const installmentAmount = textbookPmt(principal, 0.0199, 120)
    const plan = planNewLoan({
      kind: 'CONSIGNADO',
      name: 'Contrato fictício',
      principalCents: principal,
      installmentAmountCents: installmentAmount,
      installmentCount: 120,
      firstDueDate: day('2026-11-05'),
    })
    expect(plan.installments.reduce((sum, item) => sum + item.principalCents, 0)).toBe(principal)
    expect(plan.loan.monthlyRate).toBeCloseTo(0.0199, 5)
  })
})

describe('QA F1-05: atraso e fuso America/Sao_Paulo', () => {
  const rates = { lateFeeRate: 0.02, lateInterestMonthlyRate: 0.01 }
  const installment = {
    number: 1,
    dueDate: day('2026-10-01'),
    principalCents: 80_000,
    interestCents: 14_560,
    amountCents: 94_560,
    status: 'PENDING' as const,
  }

  it('02:00Z de 11/out ainda é 10/out em São Paulo: 9 dias, mora 284', () => {
    const assessed = assessInstallment(installment, rates, new Date('2026-10-11T02:00:00Z'))
    expect(assessed.lateCharges).toEqual({ fee: 1_891, interest: 284, total: 2_175, days: 9 })
    expect(assessed.amountDueNow).toBe(94_560 + 2_175)
  })

  it('04:00Z de 11/out já é 11/out em São Paulo: 10 dias, total 2206', () => {
    const assessed = assessInstallment(installment, rates, new Date('2026-10-11T04:00:00Z'))
    expect(assessed.lateCharges).toEqual({ fee: 1_891, interest: 315, total: 2_206, days: 10 })
    expect(assessed.amountDueNow).toBe(96_766)
  })

  it('vence hoje (23:30 em SP, já dia seguinte em UTC) continua PENDING, sem encargos', () => {
    const assessed = assessInstallment(
      { ...installment, dueDate: day('2026-10-05') },
      rates,
      new Date('2026-10-06T02:30:00Z'),
    )
    expect(assessed.status).toBe('PENDING')
    expect(assessed.lateCharges.total).toBe(0)
  })

  it('mora pro rata em base 30 independe do tamanho do mês (fev/jan)', () => {
    const fev = lateCharges({
      amount: 300_000,
      dueDate: day('2027-02-01'),
      payDate: day('2027-02-11'),
    })
    const jan = lateCharges({
      amount: 300_000,
      dueDate: day('2027-01-01'),
      payDate: day('2027-01-11'),
    })
    expect(fev.interest).toBe(1_000)
    expect(jan.interest).toBe(fev.interest)
  })
})

describe('QA F1-05: prazo de quitação contra simulação mês a mês', () => {
  it.each([
    [100_000, 0.02, 10_000],
    [250_000, 0.08, 30_000],
    [80_000, 0.07, 9_000],
    [1_000_000, 0.019, 94_560],
  ])('fórmula fechada = laço (saldo %i, taxa %f, pagamento %i)', (balance, rate, payment) => {
    let remaining = balance
    let months = 0
    while (remaining > 0 && months < 2_000) {
      remaining = Math.round(remaining * (1 + rate)) - payment
      months += 1
    }
    expect(monthsToPayoff({ balance, monthlyRate: rate, monthlyPayment: payment })).toBe(months)
  })
})
