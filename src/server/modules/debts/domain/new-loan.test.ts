import { describe, expect, it } from 'vitest'
import { formatCalendarDate } from './calendar'
import { DebtError } from './errors'
import {
  assertNoLongDigits,
  assertPercentPrecision,
  planNewLoan,
  roundRateForStorage,
} from './new-loan'
import { simulateAmortization } from './payoff'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const base = {
  kind: 'CONSIGNADO' as const,
  name: 'Consignado fictício',
  principalCents: 1_000_000,
  monthlyRate: 0.02,
  installmentCount: 12,
  firstDueDate: day('2026-11-05'),
}

describe('planNewLoan', () => {
  it('parcelado: plano com cronograma, saldo e padrões de atraso', () => {
    const plan = planNewLoan(base)
    expect(plan.installments).toHaveLength(12)
    expect(plan.loan).toMatchObject({
      principalCents: 1_000_000,
      monthlyRate: 0.02,
      installmentAmountCents: 94_560,
      outstandingCents: 1_000_000,
      lateFeeRate: 0.02,
      lateInterestMonthlyRate: 0.01,
      rateInferred: false,
      accountId: null,
      contractedAt: null,
    })
    expect(formatCalendarDate(plan.installments[11].dueDate)).toBe('2027-10-05')
    expect(plan.installments.reduce((sum, i) => sum + i.principalCents, 0)).toBe(1_000_000)
  })

  it('já pagas: paidAt = vencimento, paidAmount = parcela, saldo do cronograma', () => {
    const plan = planNewLoan({ ...base, alreadyPaidInstallments: 2 })
    expect(
      plan.installments
        .slice(0, 2)
        .every((i) => i.status === 'PAID' && i.paidAmountCents === i.amountCents),
    ).toBe(true)
    expect(plan.loan.outstandingCents).toBe(
      plan.installments.slice(2).reduce((sum, i) => sum + i.principalCents, 0),
    )
  })

  it('normaliza datas para meio-dia UTC e limpa textos', () => {
    const plan = planNewLoan({
      ...base,
      name: '  Pessoal  ',
      lenderName: '   ',
      notes: '  obs  ',
      firstDueDate: new Date('2026-11-05T03:00:00.000Z'),
      contractedAt: new Date('2026-10-01T22:00:00.000Z'),
    })
    expect(plan.loan.name).toBe('Pessoal')
    expect(plan.loan.lenderName).toBeNull()
    expect(plan.loan.notes).toBe('obs')
    expect(plan.loan.firstDueDate!.toISOString()).toBe('2026-11-05T12:00:00.000Z')
    expect(plan.loan.contractedAt!.toISOString()).toBe('2026-10-01T12:00:00.000Z')
  })

  it('taxa 0%: parcelas iguais ao principal / n e juros zero', () => {
    const plan = planNewLoan({ ...base, monthlyRate: 0 })
    expect(plan.installments.every((i) => i.interestCents === 0)).toBe(true)
    expect(plan.loan.installmentAmountCents).toBe(83_333)
  })

  it('taxa inferida com 6 casas; parcela x n igual ao principal infere 0', () => {
    const inferred = planNewLoan({
      ...base,
      monthlyRate: undefined,
      installmentAmountCents: 94_560,
    })
    expect(inferred.loan.rateInferred).toBe(true)
    expect(inferred.loan.monthlyRate).toBe(roundRateForStorage(inferred.loan.monthlyRate))
    const zero = planNewLoan({
      ...base,
      monthlyRate: undefined,
      principalCents: 1_200_000,
      installmentAmountCents: 100_000,
    })
    expect(zero.loan.monthlyRate).toBe(0)
    expect(zero.installments.every((i) => i.amountCents === 100_000)).toBe(true)
  })

  it('o plano tem a mesma simulação que o cronograma (consistência com simulatePayoff)', () => {
    const plan = planNewLoan({ ...base, monthlyRate: undefined, installmentAmountCents: 94_560 })
    const sim = simulateAmortization({
      balance: plan.loan.outstandingCents,
      monthlyRate: plan.loan.monthlyRate,
      monthlyPayment: 94_560,
      forcePayoffAtMonth: 12,
    })
    expect(sim.months).toBe(12)
    expect(sim.totalInterest).toBe(plan.installments.reduce((sum, i) => sum + i.interestCents, 0))
    expect(sim.lastPayment).toBe(plan.installments[11].amountCents)
  })

  it('parcela única e 120 parcelas (limites)', () => {
    expect(planNewLoan({ ...base, installmentCount: 1 }).installments).toHaveLength(1)
    expect(planNewLoan({ ...base, installmentCount: 120 }).installments).toHaveLength(120)
  })

  it('cheque especial e rotativo: sem cronograma, principal 0, exigem conta e taxa', () => {
    const plan = planNewLoan({
      kind: 'OVERDRAFT',
      name: 'Cheque',
      accountId: 'acc-a',
      monthlyRate: 0.08,
    })
    expect(plan.installments).toEqual([])
    expect(plan.loan).toMatchObject({
      principalCents: 0,
      outstandingCents: 0,
      installmentCount: null,
      firstDueDate: null,
    })
    expect(() => planNewLoan({ kind: 'CARD_REVOLVING', name: 'x', monthlyRate: 0.1 })).toThrow(
      DebtError,
    )
    expect(() => planNewLoan({ kind: 'CARD_REVOLVING', name: 'x', accountId: 'c' })).toThrow(
      DebtError,
    )
    expect(() =>
      planNewLoan({ kind: 'CARD_REVOLVING', name: 'x', accountId: 'c', monthlyRate: 0.31 }),
    ).toThrow(DebtError)
  })

  it('rejeita multa/mora fora de 0..1, taxa negativa e nome vazio', () => {
    expect(() => planNewLoan({ ...base, lateFeeRate: 2 })).toThrow(DebtError)
    expect(() => planNewLoan({ ...base, lateInterestMonthlyRate: -0.1 })).toThrow(DebtError)
    expect(() => planNewLoan({ ...base, monthlyRate: -0.01 })).toThrow(DebtError)
    expect(() => planNewLoan({ ...base, name: '' })).toThrow(DebtError)
    expect(() => planNewLoan({ ...base, name: 'x'.repeat(81) })).toThrow(DebtError)
    expect(() => planNewLoan({ ...base, firstDueDate: new Date('x') })).toThrow(DebtError)
    expect(() => planNewLoan({ ...base, installmentAmountCents: 0 })).toThrow(DebtError)
  })
})

describe('precisão de multa e mora (FC2-F1-10, CA-04)', () => {
  it('recusa percentual com 3 casas (mora 1,275%) com mensagem clara e o campo', () => {
    let error: unknown
    try {
      planNewLoan({ ...base, lateInterestMonthlyRate: 0.01275 })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(DebtError)
    expect(error).toMatchObject({
      code: 'DEBT_INVALID_INPUT',
      details: { field: 'lateInterestMonthlyRate' },
    })
    expect((error as Error).message).toMatch(/2 casas decimais/)
    expect(() => planNewLoan({ ...base, lateFeeRate: 0.02001 })).toThrow(DebtError)
    expect(() => planNewLoan({ ...base, lateFeeRate: 0.000049 })).toThrow(DebtError)
  })

  it('aceita até 2 casas no percentual (sem falso positivo de ponto flutuante)', () => {
    for (const rate of [0, 0.0001, 0.0125, 0.0199, 0.0275, 0.0333, 0.07, 0.1234, 1]) {
      expect(() => assertPercentPrecision(rate, 'x')).not.toThrow()
      expect(() => planNewLoan({ ...base, lateFeeRate: rate })).not.toThrow()
    }
  })

  it('recusa valor não finito', () => {
    expect(() => assertPercentPrecision(Number.NaN, 'x')).toThrow(DebtError)
  })
})

describe('assertNoLongDigits', () => {
  it('rejeita 11+ dígitos, mesmo com pontuação (CPF, CNPJ, conta)', () => {
    expect(() => assertNoLongDigits('12345678901', 'x')).toThrow(DebtError)
    expect(() => assertNoLongDigits('1.1.1.1.1-1.1.1.1.1.1', 'x')).toThrow(DebtError)
    expect(() => assertNoLongDigits('11/11/11/1111-11', 'x')).toThrow(DebtError)
    expect(() => assertNoLongDigits('Ref 1111 11111-111', 'x')).toThrow(DebtError)
  })

  it('aceita números curtos (ano, parcelas, número do contrato curto)', () => {
    expect(() => assertNoLongDigits('Consignado 2026', 'x')).not.toThrow()
    expect(() => assertNoLongDigits('Contrato 1234567890', 'x')).not.toThrow()
  })
})

describe('roundRateForStorage', () => {
  it('arredonda a 6 casas (Decimal(9,6))', () => {
    expect(roundRateForStorage(0.0199)).toBe(0.0199)
    expect(roundRateForStorage(0.0200007)).toBe(0.020001)
    expect(roundRateForStorage(0.0199994)).toBe(0.019999)
  })
})
