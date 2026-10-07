import { describe, expect, it } from 'vitest'
import {
  advanceSchema,
  createPurchaseSchema,
  moveStatementSchema,
  payStatementSchema,
  refundSchema,
} from './schemas'

describe('cards/http/schemas', () => {
  it('createPurchaseSchema: converte a data para meio-dia UTC e aplica limites', () => {
    const parsed = createPurchaseSchema.parse({
      amount: 60_000,
      installmentCount: 3,
      date: '2026-10-05',
      description: ' Compra ',
    })
    expect(parsed.date).toEqual(new Date('2026-10-05T12:00:00.000Z'))
    expect(parsed.description).toBe('Compra')
    expect(
      createPurchaseSchema.safeParse({
        amount: 100,
        date: '2026-10-05',
        description: 'x',
        installmentCount: 25,
      }).success,
    ).toBe(false)
    expect(
      createPurchaseSchema.safeParse({ amount: 0, date: '2026-10-05', description: 'x' }).success,
    ).toBe(false)
    expect(
      createPurchaseSchema.safeParse({ amount: 10.5, date: '2026-10-05', description: 'x' })
        .success,
    ).toBe(false)
    expect(
      createPurchaseSchema.safeParse({ amount: 100, date: '2026-02-30', description: 'x' }).success,
    ).toBe(false)
    expect(
      createPurchaseSchema.safeParse({ amount: 100, date: '2026-10-05', description: '' }).success,
    ).toBe(false)
    expect(
      createPurchaseSchema.safeParse({
        amount: 100,
        date: '2026-10-05',
        description: 'x',
        userId: 'outro',
      }).success,
    ).toBe(false)
  })

  it('payStatementSchema exige origem, valor e data', () => {
    expect(
      payStatementSchema.safeParse({ sourceAccountId: 'a', amount: 100, date: '2026-10-12' })
        .success,
    ).toBe(true)
    expect(payStatementSchema.safeParse({ amount: 100, date: '2026-10-12' }).success).toBe(false)
    expect(
      payStatementSchema.safeParse({ sourceAccountId: 'a', amount: -5, date: '2026-10-12' })
        .success,
    ).toBe(false)
  })

  it('moveStatementSchema exige chave ou id e valida o formato AAAA-MM', () => {
    expect(moveStatementSchema.safeParse({ targetStatementKey: '2026-11' }).success).toBe(true)
    expect(moveStatementSchema.safeParse({ targetStatementId: 'abc' }).success).toBe(true)
    expect(moveStatementSchema.safeParse({}).success).toBe(false)
    expect(moveStatementSchema.safeParse({ targetStatementKey: '2026-13' }).success).toBe(false)
    expect(moveStatementSchema.safeParse({ targetStatementKey: '26-11' }).success).toBe(false)
  })

  it('refundSchema: statementKey opcional', () => {
    expect(refundSchema.safeParse({ amount: 100, date: '2026-10-05' }).success).toBe(true)
    expect(
      refundSchema.safeParse({ amount: 100, date: '2026-10-05', statementKey: '2026-10' }).success,
    ).toBe(true)
    expect(refundSchema.safeParse({ amount: 0, date: '2026-10-05' }).success).toBe(false)
  })

  it('advanceSchema: desconto padrão 0, parcelas 1..24 e ao menos uma', () => {
    const parsed = advanceSchema.parse({ installmentNumbers: [2, 3], date: '2026-10-06' })
    expect(parsed.discountAmount).toBe(0)
    expect(advanceSchema.safeParse({ installmentNumbers: [], date: '2026-10-06' }).success).toBe(
      false,
    )
    expect(advanceSchema.safeParse({ installmentNumbers: [0], date: '2026-10-06' }).success).toBe(
      false,
    )
    expect(
      advanceSchema.safeParse({ installmentNumbers: [2], date: '2026-10-06', discountAmount: -1 })
        .success,
    ).toBe(false)
  })
})
