import { describe, expect, it } from 'vitest'
import { formatCalendarDate } from './calendar'
import { DebtError } from './errors'
import { buildAmortizationSchedule } from './price'
import { rankDebtsByRate } from './rate'
import { assessInstallment, summarizeDebt, type SummaryInstallment } from './summary'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const RATES = { lateFeeRate: 0.02, lateInterestMonthlyRate: 0.01 }

function installmentsFor(
  principal: number,
  monthlyRate: number,
  count: number,
  first: string,
  paid = 0,
): SummaryInstallment[] {
  return buildAmortizationSchedule({
    principal,
    monthlyRate,
    installments: count,
    firstDueDate: day(first),
  }).map((row) => ({
    number: row.number,
    dueDate: row.dueDate,
    principalCents: row.principal,
    interestCents: row.interest,
    amountCents: row.amount,
    status: row.number <= paid ? ('PAID' as const) : ('PENDING' as const),
  }))
}

describe('assessInstallment', () => {
  const base: SummaryInstallment = {
    number: 3,
    dueDate: day('2026-10-01'),
    principalCents: 74_560,
    interestCents: 20_000,
    amountCents: 94_560,
    status: 'PENDING',
  }

  it('vencida há 10 dias: encargos e valor devido agora (CA-04, CA-14)', () => {
    const assessed = assessInstallment(base, RATES, new Date('2026-10-11T15:00:00.000Z'))
    expect(assessed.status).toBe('OVERDUE')
    expect(assessed.lateCharges).toEqual({ fee: 1891, interest: 315, total: 2206, days: 10 })
    expect(assessed.amountDueNow).toBe(96_766)
  })

  it('a vencer ou vencendo hoje: sem encargos; paga ou ignorada: nada devido', () => {
    const now = new Date('2026-10-01T15:00:00.000Z')
    expect(assessInstallment(base, RATES, now)).toMatchObject({
      status: 'PENDING',
      amountDueNow: 94_560,
    })
    expect(assessInstallment({ ...base, status: 'PAID' }, RATES, now)).toMatchObject({
      status: 'PAID',
      amountDueNow: 0,
    })
    expect(assessInstallment({ ...base, status: 'SKIPPED' }, RATES, now)).toMatchObject({
      status: 'SKIPPED',
      amountDueNow: 0,
    })
  })
})

describe('summarizeDebt: parcelado', () => {
  const now = new Date('2026-12-20T15:00:00.000Z')

  it('consignado: saldo, custo mensal, próxima parcela, parcelas restantes e quitação', () => {
    const installments = installmentsFor(1_000_000, 0.02, 12, '2026-11-05', 3)
    const summary = summarizeDebt(
      {
        id: 'l1',
        kind: 'CONSIGNADO',
        name: 'Consignado fictício',
        monthlyRate: 0.02,
        installments,
        ...RATES,
      },
      now,
    )
    const outstanding = installments.slice(3).reduce((sum, item) => sum + item.principalCents, 0)
    expect(summary.outstanding).toBe(outstanding)
    expect(summary.monthlyInterestCost).toBe(Math.round(outstanding * 0.02))
    expect(summary.annualRate).toBeCloseTo(0.2682, 4)
    expect(summary.installmentsLeft).toBe(9)
    expect(summary.nextInstallment).toMatchObject({
      number: 4,
      amount: 94_560,
      status: 'PENDING',
      amountDueNow: 94_560,
    })
    expect(formatCalendarDate(summary.nextInstallment!.dueDate)).toBe('2027-02-05')
    expect(formatCalendarDate(summary.payoffDate!)).toBe('2027-10-05')
    expect(summary.overdueCount).toBe(0)
    expect(summary.overdueAmount).toBe(0)
    expect(summary.assumptions.length).toBeGreaterThanOrEqual(2)
  })

  it('parcelas atrasadas entram com o valor corrigido (RN-09)', () => {
    // Hoje 20/12: parcelas 1 e 2 (05/11 e 05/12) vencidas e não pagas.
    const installments = installmentsFor(1_000_000, 0.02, 12, '2026-11-05')
    const summary = summarizeDebt(
      { id: 'l1', kind: 'CONSIGNADO', name: 'x', monthlyRate: 0.02, installments, ...RATES },
      now,
    )
    expect(summary.overdueCount).toBe(2)
    const first = assessInstallment(installments[0], RATES, now)
    const second = assessInstallment(installments[1], RATES, now)
    expect(first.lateCharges.days).toBe(45)
    expect(second.lateCharges.days).toBe(15)
    expect(summary.overdueAmount).toBe(first.amountDueNow + second.amountDueNow)
    expect(summary.overdueAmount).toBeGreaterThan(
      installments[0].amountCents + installments[1].amountCents,
    )
    expect(summary.nextInstallment).toMatchObject({ number: 1, status: 'OVERDUE' })
    expect(summary.assumptions.some((line) => line.includes('mora'))).toBe(true)
  })

  it('quitado e lista vazia: saldo 0, sem próxima parcela nem data', () => {
    const paid = installmentsFor(300_000, 0.02, 3, '2026-01-05', 3)
    const summary = summarizeDebt(
      { id: 'p', kind: 'PIX_CREDIT', name: 'x', monthlyRate: 0.07, installments: paid, ...RATES },
      now,
    )
    expect(summary).toMatchObject({
      outstanding: 0,
      monthlyInterestCost: 0,
      installmentsLeft: 0,
      payoffDate: null,
    })
    expect(summary.nextInstallment).toBeUndefined()
    expect(
      summarizeDebt({ id: 'e', kind: 'PERSONAL', name: 'x', monthlyRate: 0.03, ...RATES }, now)
        .outstanding,
    ).toBe(0)
  })

  it('parcelas ignoradas (SKIPPED) não contam como devidas e a ordem de entrada não importa', () => {
    const installments = installmentsFor(300_000, 0.02, 3, '2027-01-05')
    installments[0] = { ...installments[0], status: 'SKIPPED' }
    const summary = summarizeDebt(
      {
        id: 'p',
        kind: 'PERSONAL',
        name: 'x',
        monthlyRate: 0.02,
        installments: [...installments].reverse(),
        ...RATES,
      },
      now,
    )
    expect(summary.installmentsLeft).toBe(2)
    expect(summary.nextInstallment?.number).toBe(2)
  })
})

describe('summarizeDebt: cheque especial e rotativo', () => {
  const now = new Date('2026-10-07T15:00:00.000Z')

  it('cheque especial: saldo = uso do ledger, custo = uso x taxa (CA-05, CA-13)', () => {
    const summary = summarizeDebt(
      {
        id: 'c',
        kind: 'OVERDRAFT',
        name: 'Cheque especial',
        monthlyRate: 0.08,
        overdraft: { used: 50_000, excess: 7000, limit: 100_000 },
        ...RATES,
      },
      now,
    )
    expect(summary).toMatchObject({
      outstanding: 50_000,
      monthlyInterestCost: 4000,
      installmentsLeft: 0,
      payoffDate: null,
      limitExcess: 7000,
    })
    expect(summary.nextInstallment).toBeUndefined()
  })

  it('cheque especial com pagamento planejado calcula a data de quitação; sem cobrir os juros, null', () => {
    const planned = summarizeDebt(
      {
        id: 'c',
        kind: 'OVERDRAFT',
        name: 'x',
        monthlyRate: 0.08,
        overdraft: { used: 50_000, plannedMonthlyPayment: 10_000 },
        ...RATES,
      },
      now,
    )
    expect(planned.payoffDate).not.toBeNull()
    const never = summarizeDebt(
      {
        id: 'c',
        kind: 'OVERDRAFT',
        name: 'x',
        monthlyRate: 0.08,
        overdraft: { used: 50_000, plannedMonthlyPayment: 4000 },
        ...RATES,
      },
      now,
    )
    expect(never.payoffDate).toBeNull()
  })

  it('cheque especial sem uso: custo 0', () => {
    const summary = summarizeDebt(
      {
        id: 'c',
        kind: 'OVERDRAFT',
        name: 'x',
        monthlyRate: 0.08,
        overdraft: { used: 0 },
        ...RATES,
      },
      now,
    )
    expect(summary).toMatchObject({ outstanding: 0, monthlyInterestCost: 0 })
  })

  it('rotativo: custo respeita o teto e sinaliza', () => {
    const free = summarizeDebt(
      {
        id: 'r',
        kind: 'CARD_REVOLVING',
        name: 'x',
        monthlyRate: 0.12,
        revolving: { unpaid: 100_000 },
        ...RATES,
      },
      now,
    )
    expect(free).toMatchObject({
      outstanding: 100_000,
      monthlyInterestCost: 12_000,
      revolvingCapped: false,
    })
    const capped = summarizeDebt(
      {
        id: 'r',
        kind: 'CARD_REVOLVING',
        name: 'x',
        monthlyRate: 0.12,
        revolving: { unpaid: 100_000, originalPrincipal: 100_000, interestAlreadyCharged: 95_000 },
        ...RATES,
      },
      now,
    )
    expect(capped).toMatchObject({ monthlyInterestCost: 5000, revolvingCapped: true })
  })

  it('exige os dados de uso por tipo', () => {
    expect(() =>
      summarizeDebt({ id: 'c', kind: 'OVERDRAFT', name: 'x', monthlyRate: 0.08, ...RATES }, now),
    ).toThrow(DebtError)
    expect(() =>
      summarizeDebt(
        { id: 'r', kind: 'CARD_REVOLVING', name: 'x', monthlyRate: 0.12, ...RATES },
        now,
      ),
    ).toThrow(DebtError)
  })
})

describe('ranking dos quatro tipos típicos (CA-13)', () => {
  it('rotativo > cheque especial > Pix no crédito > consignado, a partir dos resumos', () => {
    const now = new Date('2026-10-07T15:00:00.000Z')
    const summaries = [
      summarizeDebt(
        {
          id: 'consig',
          kind: 'CONSIGNADO',
          name: 'a',
          monthlyRate: 0.019,
          installments: installmentsFor(1_000_000, 0.019, 12, '2026-11-05'),
          ...RATES,
        },
        now,
      ),
      summarizeDebt(
        {
          id: 'pix',
          kind: 'PIX_CREDIT',
          name: 'b',
          monthlyRate: 0.07,
          installments: installmentsFor(200_000, 0.07, 6, '2026-11-05'),
          ...RATES,
        },
        now,
      ),
      summarizeDebt(
        {
          id: 'rot',
          kind: 'CARD_REVOLVING',
          name: 'c',
          monthlyRate: 0.12,
          revolving: { unpaid: 100_000 },
          ...RATES,
        },
        now,
      ),
      summarizeDebt(
        {
          id: 'ch',
          kind: 'OVERDRAFT',
          name: 'd',
          monthlyRate: 0.08,
          overdraft: { used: 50_000 },
          ...RATES,
        },
        now,
      ),
    ]
    const ranked = rankDebtsByRate(
      summaries.map((s) => ({
        id: s.id,
        monthlyRate: s.monthlyRate,
        monthlyCost: s.monthlyInterestCost,
        outstanding: s.outstanding,
      })),
    )
    expect(ranked.map((s) => s.id)).toEqual(['rot', 'ch', 'pix', 'consig'])
  })
})
