import { beforeEach, describe, expect, it } from 'vitest'
import { calendarDate, makeAccount, makeCard, makeLoan, makeTxn, resetFactories } from './factories'

describe('factories', () => {
  beforeEach(() => resetFactories())

  it('ids são determinísticos e reiniciam com resetFactories', () => {
    expect(makeAccount().id).toBe('acc-0001')
    expect(makeAccount().id).toBe('acc-0002')
    resetFactories()
    expect(makeAccount().id).toBe('acc-0001')
  })

  it('overrides têm precedência', () => {
    expect(makeAccount({ name: 'X', overdraftLimitCents: 5000 })).toMatchObject({
      name: 'X',
      overdraftLimitCents: 5000,
    })
    expect(makeCard({ closingDay: 31 }).closingDay).toBe(31)
    expect(makeLoan({ installments: 24 }).installments).toBe(24)
  })

  it('transação deriva o tipo do sinal e usa meio-dia UTC', () => {
    expect(makeTxn({ amountCents: -500 }).kind).toBe('EXPENSE')
    expect(makeTxn({ amountCents: 500 }).kind).toBe('INCOME')
    expect(makeTxn().date.toISOString()).toBe('2026-10-05T12:00:00.000Z')
  })

  it('valores monetários são centavos inteiros', () => {
    const values = [
      makeTxn().amountCents,
      makeCard().limitCents,
      makeLoan().principalCents,
      makeAccount().initialBalanceCents,
    ]
    for (const v of values) expect(Number.isInteger(v)).toBe(true)
  })

  it('calendarDate valida o formato e fixa meio-dia UTC (dias 29/30/31)', () => {
    expect(calendarDate('2026-12-31').toISOString()).toBe('2026-12-31T12:00:00.000Z')
    expect(() => calendarDate('31/12/2026')).toThrow()
  })
})
