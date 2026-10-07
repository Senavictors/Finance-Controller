import { describe, expect, it } from 'vitest'
import { DebtError } from './errors'
import { daysLate, installmentStatus, lateCharges } from './late-charges'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe('daysLate', () => {
  it('0 no vencimento e antes; dias de calendário depois', () => {
    expect(daysLate(day('2026-10-01'), day('2026-10-01'))).toBe(0)
    expect(daysLate(day('2026-10-01'), day('2026-09-20'))).toBe(0)
    expect(daysLate(day('2026-10-01'), day('2026-10-02'))).toBe(1)
    expect(daysLate(day('2026-10-01'), day('2026-10-11'))).toBe(10)
    expect(daysLate(day('2026-12-30'), day('2027-01-02'))).toBe(3)
  })
})

describe('lateCharges (CA-04)', () => {
  it('parcela 94560, 10 dias, 2% + 1% a.m.: fee 1891, interest 315, total 2206', () => {
    expect(
      lateCharges({ amount: 94_560, dueDate: day('2026-10-01'), payDate: day('2026-10-11') }),
    ).toEqual({ fee: 1891, interest: 315, total: 2206, days: 10 })
  })

  it('valor devido = parcela + encargos = 96766', () => {
    const charges = lateCharges({
      amount: 94_560,
      dueDate: day('2026-10-01'),
      payDate: day('2026-10-11'),
    })
    expect(94_560 + charges.total).toBe(96_766)
  })

  it('no vencimento ou antes: tudo zero', () => {
    const zero = { fee: 0, interest: 0, total: 0, days: 0 }
    expect(
      lateCharges({ amount: 94_560, dueDate: day('2026-10-01'), payDate: day('2026-10-01') }),
    ).toEqual(zero)
    expect(
      lateCharges({ amount: 94_560, dueDate: day('2026-10-01'), payDate: day('2026-09-15') }),
    ).toEqual(zero)
  })

  it('1 dia: multa cheia e mora de 1/30 do mês', () => {
    expect(
      lateCharges({ amount: 100_000, dueDate: day('2026-10-01'), payDate: day('2026-10-02') }),
    ).toEqual({
      fee: 2000,
      interest: 33,
      total: 2033,
      days: 1,
    })
  })

  it('a multa é única: 30 e 365 dias só crescem na mora (pro rata em base 30)', () => {
    const base = { amount: 100_000, dueDate: day('2026-01-01') }
    const d30 = lateCharges({ ...base, payDate: day('2026-01-31') })
    expect(d30).toEqual({ fee: 2000, interest: 1000, total: 3000, days: 30 })
    const d365 = lateCharges({ ...base, payDate: day('2027-01-01') })
    expect(d365.fee).toBe(2000)
    expect(d365.days).toBe(365)
    expect(d365.interest).toBe(Math.round((100_000 * 0.01 * 365) / 30))
  })

  it('mês de 28 ou 31 dias não altera a conta (sempre base 30)', () => {
    const feb = lateCharges({
      amount: 90_000,
      dueDate: day('2026-02-01'),
      payDate: day('2026-02-11'),
    })
    const jan = lateCharges({
      amount: 90_000,
      dueDate: day('2026-01-01'),
      payDate: day('2026-01-11'),
    })
    expect(feb).toEqual(jan)
    expect(feb.interest).toBe(300)
  })

  it('multa e mora personalizadas por contrato', () => {
    expect(
      lateCharges({
        amount: 100_000,
        dueDate: day('2026-10-01'),
        payDate: day('2026-10-16'),
        lateFeePct: 0.05,
        lateInterestMonthly: 0.03,
      }),
    ).toEqual({ fee: 5000, interest: 1500, total: 6500, days: 15 })
    expect(
      lateCharges({
        amount: 100_000,
        dueDate: day('2026-10-01'),
        payDate: day('2026-10-16'),
        lateFeePct: 0,
        lateInterestMonthly: 0,
      }),
    ).toEqual({ fee: 0, interest: 0, total: 0, days: 15 })
  })

  it('cruza a virada de ano e valida entradas', () => {
    expect(
      lateCharges({ amount: 30_000, dueDate: day('2026-12-28'), payDate: day('2027-01-07') }).days,
    ).toBe(10)
    expect(() =>
      lateCharges({ amount: -1, dueDate: day('2026-10-01'), payDate: day('2026-10-02') }),
    ).toThrow(DebtError)
    expect(() =>
      lateCharges({ amount: 10.5, dueDate: day('2026-10-01'), payDate: day('2026-10-02') }),
    ).toThrow(DebtError)
    expect(() =>
      lateCharges({
        amount: 100,
        dueDate: day('2026-10-01'),
        payDate: day('2026-10-02'),
        lateFeePct: -0.1,
      }),
    ).toThrow(DebtError)
  })
})

describe('installmentStatus', () => {
  // 15:00 UTC = 12:00 em São Paulo.
  const now = new Date('2026-10-10T15:00:00.000Z')

  it('paga e ignorada mantêm o status', () => {
    expect(installmentStatus({ status: 'PAID', dueDate: day('2026-01-01') }, now)).toBe('PAID')
    expect(installmentStatus({ status: 'SKIPPED', dueDate: day('2026-01-01') }, now)).toBe(
      'SKIPPED',
    )
  })

  it('vencida antes de hoje = OVERDUE; vence hoje ou depois = PENDING', () => {
    expect(installmentStatus({ status: 'PENDING', dueDate: day('2026-10-09') }, now)).toBe(
      'OVERDUE',
    )
    expect(installmentStatus({ status: 'PENDING', dueDate: day('2026-10-10') }, now)).toBe(
      'PENDING',
    )
    expect(installmentStatus({ status: 'PENDING', dueDate: day('2026-10-11') }, now)).toBe(
      'PENDING',
    )
  })

  it('usa o dia de São Paulo: 01:00 UTC ainda é o dia anterior no Brasil', () => {
    const lateNightUtc = new Date('2026-10-11T01:00:00.000Z') // 22:00 de 10/10 em São Paulo
    expect(installmentStatus({ status: 'PENDING', dueDate: day('2026-10-10') }, lateNightUtc)).toBe(
      'PENDING',
    )
    const nextMorning = new Date('2026-10-11T04:00:00.000Z') // 01:00 de 11/10 em São Paulo
    expect(installmentStatus({ status: 'PENDING', dueDate: day('2026-10-10') }, nextMorning)).toBe(
      'OVERDUE',
    )
  })
})
