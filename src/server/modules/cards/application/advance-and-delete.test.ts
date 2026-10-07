import { describe, expect, it } from 'vitest'
import { day, errorCodeOf, makeCardsEnv, OTHER_USER, type CardsEnv } from './test-helpers'

/** R$ 600,00 em 3x de R$ 200,00 no cartão (faturas 2026-10, 2026-11, 2026-12). */
async function threeInstallments(env: CardsEnv) {
  return env.svc.createCardPurchase(env.ctx, {
    accountId: 'card',
    amount: 60_000,
    installmentCount: 3,
    date: day('2026-10-05'),
    description: 'Compra sintetica',
    categoryId: 'cat-1',
  })
}

describe('advanceInstallments', () => {
  it('CA-10: 2 parcelas de R$ 200,00 pagas por R$ 380,00 => desconto de R$ 20,00 como crédito', async () => {
    const env = makeCardsEnv()
    const bought = await threeInstallments(env)
    env.setNow('2026-10-06')

    const result = await env.svc.advanceInstallments(env.ctx, {
      purchaseId: bought.purchase.id,
      installmentNumbers: [2, 3],
      date: day('2026-10-06'),
      discountAmount: 2_000,
      notes: 'Adiantei',
    })

    expect(result.advance).toMatchObject({
      purchaseId: bought.purchase.id,
      totalOriginalAmount: 40_000,
      totalPaidAmount: 38_000,
      totalDiscountAmount: 2_000,
      advancedAt: day('2026-10-06'),
      notes: 'Adiantei',
    })
    // as duas parcelas foram para a fatura corrente (ciclo de 06/10 => 2026-10) na data da antecipação
    for (const index of [1, 2]) {
      expect(env.ledgerRepo.txns.get(bought.transactions[index]!.id)).toMatchObject({
        date: day('2026-10-06'),
        statementKey: '2026-10',
        statementId: bought.statements[0]!.id,
        amount: -20_000,
        status: 'PENDING',
      })
    }
    // o desconto é um crédito (INCOME) na mesma fatura, ligado à primeira parcela antecipada
    expect(result.discountTransaction).toMatchObject({
      kind: 'INCOME',
      amount: 2_000,
      statementKey: '2026-10',
      refundOfId: bought.transactions[1]!.id,
      categoryId: 'cat-1',
      occurrenceKey: `advance:${result.advance.id}`,
    })
    const october = result.statements.find((s) => s.statementKey === '2026-10')!
    expect(october).toMatchObject({ total: 20_000 + 40_000 - 2_000 }) // 58000
    expect(result.statements.find((s) => s.statementKey === '2026-11')!.total).toBe(0)
    expect(result.statements.find((s) => s.statementKey === '2026-12')!.total).toBe(0)
    // CardInstallment marcadas
    const installments = [...env.cardsRepo.installments.values()]
    expect(
      installments
        .filter((i) => i.advanceId === result.advance.id)
        .map((i) => i.installmentNumber)
        .sort(),
    ).toEqual([2, 3])
    expect(installments.find((i) => i.installmentNumber === 2)!.originalAmount).toBe(20_000)
    // saldo do cartão: -60000 + 2000 de crédito
    expect(env.ledgerRepo.balances.get('card')!.balancePending).toBe(-58_000)
    env.expectConsistent()
  })

  it('sem desconto não cria crédito; com data futura as parcelas ficam PLANNED', async () => {
    const env = makeCardsEnv()
    const bought = await threeInstallments(env)
    const result = await env.svc.advanceInstallments(env.ctx, {
      purchaseId: bought.purchase.id,
      installmentNumbers: [3],
      date: day('2026-10-08'),
      discountAmount: 0,
    })
    expect(result.discountTransaction).toBeNull()
    expect(env.ledgerRepo.txns.get(bought.transactions[2]!.id)!.status).toBe('PLANNED')
    expect(result.advance.totalDiscountAmount).toBe(0)
    env.expectConsistent()
  })

  it('só parcelas futuras, não antecipadas e existentes; desconto menor que o total', async () => {
    const env = makeCardsEnv()
    const bought = await threeInstallments(env)
    env.setNow('2026-10-06')
    const base = { purchaseId: bought.purchase.id, date: day('2026-10-06'), discountAmount: 0 }
    expect(
      await errorCodeOf(() =>
        env.svc.advanceInstallments(env.ctx, { ...base, installmentNumbers: [1] }),
      ),
    ).toBe('INSTALLMENT_NOT_FUTURE')
    expect(
      await errorCodeOf(() =>
        env.svc.advanceInstallments(env.ctx, { ...base, installmentNumbers: [9] }),
      ),
    ).toBe('INSTALLMENT_NOT_FOUND')
    expect(
      await errorCodeOf(() =>
        env.svc.advanceInstallments(env.ctx, { ...base, installmentNumbers: [] }),
      ),
    ).toBe('INSTALLMENT_NOT_FOUND')
    expect(
      await errorCodeOf(() =>
        env.svc.advanceInstallments(env.ctx, {
          ...base,
          installmentNumbers: [2],
          discountAmount: 20_000,
        }),
      ),
    ).toBe('INVALID_DISCOUNT')
    expect(
      await errorCodeOf(() =>
        env.svc.advanceInstallments(env.ctx, {
          ...base,
          installmentNumbers: [2],
          discountAmount: -1,
        }),
      ),
    ).toBe('INVALID_DISCOUNT')
    await env.svc.advanceInstallments(env.ctx, { ...base, installmentNumbers: [2] })
    expect(
      await errorCodeOf(() =>
        env.svc.advanceInstallments(env.ctx, { ...base, installmentNumbers: [2] }),
      ),
    ).toBe('INSTALLMENT_ALREADY_ADVANCED')
    expect(
      await errorCodeOf(() =>
        env.svc.advanceInstallments({ userId: OTHER_USER }, { ...base, installmentNumbers: [3] }),
      ),
    ).toBe('PURCHASE_NOT_FOUND')
    expect(
      await errorCodeOf(() =>
        env.svc.advanceInstallments(env.ctx, {
          ...base,
          purchaseId: 'nao-existe',
          installmentNumbers: [3],
        }),
      ),
    ).toBe('PURCHASE_NOT_FOUND')
  })

  it('atomicidade: falha ao criar o crédito do desconto desfaz parcelas movidas e a antecipação', async () => {
    const env = makeCardsEnv()
    const bought = await threeInstallments(env)
    env.setNow('2026-10-06')
    const snapshot = JSON.stringify([...env.ledgerRepo.txns.values()])
    // o crédito é o último insertTxn
    env.ledgerRepo.failOn('insertTxn', 1)
    await expect(
      env.svc.advanceInstallments(env.ctx, {
        purchaseId: bought.purchase.id,
        installmentNumbers: [2, 3],
        date: day('2026-10-06'),
        discountAmount: 2_000,
      }),
    ).rejects.toThrow(/falha injetada/)
    expect(JSON.stringify([...env.ledgerRepo.txns.values()])).toBe(snapshot)
    expect(env.cardsRepo.advances.size).toBe(0)
    expect([...env.cardsRepo.installments.values()].every((i) => i.advanceId === null)).toBe(true)
    env.expectConsistent({ checkStatus: false })
  })

  it('fatura paga envolvida bloqueia a antecipação', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const bought = await threeInstallments(env)
    env.setNow('2026-10-12')
    await env.svc.payStatement(env.ctx, {
      statementId: bought.statements[0]!.id,
      sourceAccountId: 'chk',
      amount: 20_000,
      date: day('2026-10-12'),
    })
    // antecipar a parcela 3 para 2026-10-12 cairia na fatura 2026-11 (ciclo de 12/10)
    const ok = await env.svc.advanceInstallments(env.ctx, {
      purchaseId: bought.purchase.id,
      installmentNumbers: [3],
      date: day('2026-10-12'),
      discountAmount: 0,
    })
    expect(ok.statements.find((s) => s.statementKey === '2026-11')!.total).toBe(40_000)
    // e para a fatura PAID (2026-10) bloqueia: antecipar na data 2026-10-09
    env.setNow('2026-10-09')
    expect(
      await errorCodeOf(() =>
        env.svc.advanceInstallments(env.ctx, {
          purchaseId: bought.purchase.id,
          installmentNumbers: [2],
          date: day('2026-10-09'),
          discountAmount: 0,
        }),
      ),
    ).toBe('STATEMENT_PAID')
  })
})

describe('deleteCardPurchase', () => {
  it('CA-11: sem parcela paga, remove compra, parcelas, lançamentos e reverte o saldo', async () => {
    const env = makeCardsEnv()
    const bought = await threeInstallments(env)
    const result = await env.svc.deleteCardPurchase(env.ctx, bought.purchase.id)

    expect(result.deletedTransactionIds.sort()).toEqual(bought.transactions.map((t) => t.id).sort())
    expect(env.cardsRepo.purchases.size).toBe(0)
    expect(env.cardsRepo.installments.size).toBe(0)
    expect(env.txnsOf('card')).toHaveLength(0)
    expect(env.ledgerRepo.balances.get('card')).toMatchObject({
      balanceCleared: 0,
      balancePending: 0,
      balancePlanned: 0,
    })
    expect(result.statements.every((s) => s.total === 0)).toBe(true)
    env.expectConsistent()
  })

  it('CA-11: parcela em fatura PAID => PURCHASE_HAS_PAID_INSTALLMENTS e nada muda', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const bought = await threeInstallments(env)
    env.setNow('2026-10-12')
    await env.svc.payStatement(env.ctx, {
      statementId: bought.statements[0]!.id,
      sourceAccountId: 'chk',
      amount: 20_000,
      date: day('2026-10-12'),
    })
    const txns = JSON.stringify([...env.ledgerRepo.txns.values()])
    const balances = JSON.stringify([...env.ledgerRepo.balances.values()])
    expect(await errorCodeOf(() => env.svc.deleteCardPurchase(env.ctx, bought.purchase.id))).toBe(
      'PURCHASE_HAS_PAID_INSTALLMENTS',
    )
    expect(JSON.stringify([...env.ledgerRepo.txns.values()])).toBe(txns)
    expect(JSON.stringify([...env.ledgerRepo.balances.values()])).toBe(balances)
    expect(env.cardsRepo.purchases.size).toBe(1)
    expect(env.cardsRepo.installments.size).toBe(3)
  })

  it('apaga também o crédito de desconto de antecipações da compra', async () => {
    const env = makeCardsEnv()
    const bought = await threeInstallments(env)
    env.setNow('2026-10-06')
    const advanced = await env.svc.advanceInstallments(env.ctx, {
      purchaseId: bought.purchase.id,
      installmentNumbers: [2, 3],
      date: day('2026-10-06'),
      discountAmount: 2_000,
    })
    const result = await env.svc.deleteCardPurchase(env.ctx, bought.purchase.id)
    expect(result.deletedTransactionIds).toContain(advanced.discountTransaction!.id)
    expect(env.txnsOf('card')).toHaveLength(0)
    expect(env.cardsRepo.advances.size).toBe(0)
    env.expectConsistent()
  })

  it('estorno registrado pelo usuário bloqueia (PURCHASE_HAS_REFUNDS)', async () => {
    const env = makeCardsEnv()
    const bought = await threeInstallments(env)
    await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: bought.transactions[0]!.id,
      amount: 1_000,
      date: day('2026-10-05'),
    })
    expect(await errorCodeOf(() => env.svc.deleteCardPurchase(env.ctx, bought.purchase.id))).toBe(
      'PURCHASE_HAS_REFUNDS',
    )
    expect(env.cardsRepo.purchases.size).toBe(1)
  })

  it('compra inexistente ou de outro usuário => PURCHASE_NOT_FOUND', async () => {
    const env = makeCardsEnv()
    const bought = await threeInstallments(env)
    expect(await errorCodeOf(() => env.svc.deleteCardPurchase(env.ctx, 'nao-existe'))).toBe(
      'PURCHASE_NOT_FOUND',
    )
    expect(
      await errorCodeOf(() =>
        env.svc.deleteCardPurchase({ userId: OTHER_USER }, bought.purchase.id),
      ),
    ).toBe('PURCHASE_NOT_FOUND')
  })

  it('atomicidade: falha ao apagar a compra desfaz a exclusão dos lançamentos', async () => {
    const env = makeCardsEnv()
    const bought = await threeInstallments(env)
    env.cardsRepo.failOn('deletePurchase', 1)
    await expect(env.svc.deleteCardPurchase(env.ctx, bought.purchase.id)).rejects.toThrow(
      /falha injetada/,
    )
    expect(env.txnsOf('card')).toHaveLength(3)
    expect(env.cardsRepo.purchases.size).toBe(1)
    env.expectConsistent()
  })
})
