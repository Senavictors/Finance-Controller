import { describe, expect, it } from 'vitest'
import { day, makeCardsEnv } from './test-helpers'

/** Revisão QA da FC2-F1-03: dinheiro e datas ponta a ponta (dados sintéticos). */
describe('QA: compra 12x com centavos e dia 31', () => {
  it('soma das parcelas = total, saldo do cartão = -total, uma fatura por mês e chaves consecutivas', async () => {
    const env = makeCardsEnv()
    const result = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 100_001,
      installmentCount: 12,
      date: day('2026-01-31'),
      description: 'sintetico-12x',
    })
    const amounts = result.transactions.map((t) => t.amount)
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(-100_001)
    expect(amounts.slice(0, 5)).toEqual([-8334, -8334, -8334, -8334, -8334])
    expect(amounts.slice(5)).toEqual(Array(7).fill(-8333))
    expect(result.transactions.map((t) => t.date.toISOString().slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ])
    // fechamento 10 / vencimento 17: compra dia 31 e dia 28/30 caem sempre na fatura do mês seguinte
    expect(result.installments.map((i) => i.statementKey)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
    ])
    expect(new Set(result.installments.map((i) => i.statementId)).size).toBe(12)
    expect(result.position.projected).toBe(-100_001)
    // cache das faturas bate com o total (soma das faturas = total da compra)
    expect(result.statements.reduce((sum, s) => sum + s.total, 0)).toBe(100_001)
    env.expectConsistent({ checkStatus: false })
  })

  it('pagar a fatura não duplica a despesa: a soma de EXPENSE continua sendo só a compra', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 500_000)
    const created = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 45_000,
      date: day('2026-10-05'),
      description: 'sintetico-despesa-unica',
    })
    env.setNow('2026-10-12')
    await env.svc.payStatement(env.ctx, {
      statementId: created.statements[0]!.id,
      sourceAccountId: 'chk',
      amount: 45_000,
      date: day('2026-10-12'),
    })
    const all = [...env.txnsOf('card'), ...env.txnsOf('chk')]
    const expenses = all.filter((t) => t.kind === 'EXPENSE')
    expect(expenses.map((t) => t.amount)).toEqual([-45_000])
    const payments = all.filter((t) => t.kind === 'CARD_PAYMENT')
    expect(payments).toHaveLength(2)
    expect(payments.every((t) => t.excludeFromBudget)).toBe(true)
    expect(payments.reduce((sum, t) => sum + t.amount, 0)).toBe(0)
    // cartão zerado depois do pagamento total
    const position = await env.ledger.getAccountPosition(env.ctx, 'card')
    expect(position.current).toBe(0)
    env.expectConsistent()
  })
})
