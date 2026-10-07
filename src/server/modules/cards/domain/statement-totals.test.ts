import { describe, expect, it } from 'vitest'
import { computeStatementTotals } from './statement-totals'

describe('cards/domain/statement-totals', () => {
  it('fatura vazia: tudo zero', () => {
    expect(computeStatementTotals([])).toMatchObject({
      charges: 0,
      credits: 0,
      net: 0,
      paid: 0,
      open: 0,
      creditBalance: 0,
      itemCount: 0,
    })
  })

  it('soma compras, tarifas, juros e ajuste negativo como cobranças', () => {
    const totals = computeStatementTotals([
      { kind: 'EXPENSE', amount: -30_000 },
      { kind: 'EXPENSE', amount: -15_000 },
      { kind: 'FEE', amount: -1_000 },
      { kind: 'INTEREST', amount: -2_000 },
      { kind: 'ADJUSTMENT', amount: -500 },
    ])
    expect(totals.charges).toBe(48_500)
    expect(totals.net).toBe(48_500)
    expect(totals.open).toBe(48_500)
    expect(totals.breakdown).toMatchObject({
      expenses: 45_000,
      fees: 1_000,
      interest: 2_000,
      adjustmentDebits: 500,
    })
  })

  it('CA-04: estorno abate a fatura (R$ 500,00 - R$ 120,00 = R$ 380,00)', () => {
    const totals = computeStatementTotals([
      { kind: 'EXPENSE', amount: -50_000 },
      { kind: 'INCOME', amount: 12_000 },
    ])
    expect(totals).toMatchObject({ charges: 50_000, credits: 12_000, net: 38_000, open: 38_000 })
    expect(totals.creditBalance).toBe(0)
  })

  it('CA-04: estorno maior que a fatura => open 0 e creditBalance 100,00', () => {
    const totals = computeStatementTotals([
      { kind: 'EXPENSE', amount: -50_000 },
      { kind: 'INCOME', amount: 60_000 },
    ])
    expect(totals.net).toBe(-10_000)
    expect(totals.open).toBe(0)
    expect(totals.creditBalance).toBe(10_000)
  })

  it('pagamento parcial reduz o aberto; pagamento total zera', () => {
    const partial = computeStatementTotals([
      { kind: 'EXPENSE', amount: -38_000 },
      { kind: 'CARD_PAYMENT', amount: 20_000 },
    ])
    expect(partial).toMatchObject({ net: 38_000, paid: 20_000, open: 18_000, creditBalance: 0 })

    const full = computeStatementTotals([
      { kind: 'EXPENSE', amount: -38_000 },
      { kind: 'CARD_PAYMENT', amount: 20_000 },
      { kind: 'CARD_PAYMENT', amount: 18_000 },
    ])
    expect(full).toMatchObject({ paid: 38_000, open: 0, creditBalance: 0 })
  })

  it('pagamento acima da fatura vira crédito a favor', () => {
    const totals = computeStatementTotals([
      { kind: 'EXPENSE', amount: -10_000 },
      { kind: 'CARD_PAYMENT', amount: 12_500 },
    ])
    expect(totals.open).toBe(0)
    expect(totals.creditBalance).toBe(2_500)
  })

  it('ajuste positivo é crédito; perna negativa de pagamento e transferência são ignoradas', () => {
    const totals = computeStatementTotals([
      { kind: 'EXPENSE', amount: -10_000 },
      { kind: 'ADJUSTMENT', amount: 1_000 },
      { kind: 'CARD_PAYMENT', amount: -5_000 },
      { kind: 'TRANSFER', amount: 7_000 },
    ])
    expect(totals).toMatchObject({ charges: 10_000, credits: 1_000, net: 9_000, paid: 0 })
    expect(totals.breakdown.adjustmentCredits).toBe(1_000)
  })

  it('expõe o breakdown completo e a contagem de itens', () => {
    const totals = computeStatementTotals([
      { kind: 'EXPENSE', amount: -10_000 },
      { kind: 'INCOME', amount: 2_000 },
      { kind: 'CARD_PAYMENT', amount: 3_000 },
    ])
    expect(totals.breakdown).toEqual({
      expenses: 10_000,
      fees: 0,
      interest: 0,
      adjustmentDebits: 0,
      refunds: 2_000,
      adjustmentCredits: 0,
      payments: 3_000,
    })
    expect(totals.itemCount).toBe(3)
  })
})
