import { describe, expect, it } from 'vitest'
import { getCreditCardStatementCycle, isCreditCardBillingConfigured } from './statement-cycle'

describe('credit-card/statement-cycle', () => {
  it('reconhece quando um cartao tem billing configurado', () => {
    expect(
      isCreditCardBillingConfigured({
        id: 'acc-1',
        userId: 'user-1',
        type: 'CREDIT_CARD',
        creditLimit: 500_00,
        statementClosingDay: 10,
        statementDueDay: 17,
      }),
    ).toBe(true)

    expect(
      isCreditCardBillingConfigured({
        id: 'acc-1',
        userId: 'user-1',
        type: 'CREDIT_CARD',
        creditLimit: null,
        statementClosingDay: 10,
        statementDueDay: 17,
      }),
    ).toBe(false)
  })

  it('aloca compra antes do fechamento na fatura do mesmo mes', () => {
    const cycle = getCreditCardStatementCycle({
      transactionDate: new Date('2026-04-08T10:00:00.000Z'),
      closingDay: 10,
      dueDay: 17,
    })

    expect(cycle.periodStart).toEqual(new Date(2026, 2, 11, 0, 0, 0, 0))
    expect(cycle.closingDate).toEqual(new Date(2026, 3, 10, 23, 59, 59, 999))
    expect(cycle.dueDate).toEqual(new Date(2026, 3, 17, 23, 59, 59, 999))
  })

  it('aloca compra apos o fechamento na fatura do mes seguinte', () => {
    const cycle = getCreditCardStatementCycle({
      transactionDate: new Date('2026-04-12T10:00:00.000Z'),
      closingDay: 10,
      dueDay: 17,
    })

    expect(cycle.periodStart).toEqual(new Date(2026, 3, 11, 0, 0, 0, 0))
    expect(cycle.closingDate).toEqual(new Date(2026, 4, 10, 23, 59, 59, 999))
    expect(cycle.dueDate).toEqual(new Date(2026, 4, 17, 23, 59, 59, 999))
  })
})
