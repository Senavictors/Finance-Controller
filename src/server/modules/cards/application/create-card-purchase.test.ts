import { describe, expect, it } from 'vitest'
import { day, errorCodeOf, makeCardsEnv, OTHER_USER } from './test-helpers'

const iso = (date: Date) => date.toISOString().slice(0, 10)

describe('createCardPurchase', () => {
  it('CA-03: R$ 600,00 em 3x, fecha dia 10 / vence dia 17, comprada em 2026-10-05', async () => {
    const env = makeCardsEnv()
    const result = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 60_000,
      installmentCount: 3,
      date: day('2026-10-05'),
      description: 'Compra sintetica',
    })

    expect(result.transactions.map((t) => t.amount)).toEqual([-20_000, -20_000, -20_000])
    expect(result.transactions.map((t) => iso(t.date))).toEqual([
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
    ])
    expect(result.transactions.every((t) => t.kind === 'EXPENSE')).toBe(true)
    expect(result.transactions.map((t) => t.statementKey)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ])
    expect(result.transactions.map((t) => t.description)).toEqual([
      'Compra sintetica (1/3)',
      'Compra sintetica (2/3)',
      'Compra sintetica (3/3)',
    ])
    // primeira parcela PENDING, demais PLANNED
    expect(result.transactions.map((t) => t.status)).toEqual(['PENDING', 'PLANNED', 'PLANNED'])
    // três CardInstallment 1:1 com o lançamento
    const installments = [...env.cardsRepo.installments.values()]
    expect(installments).toHaveLength(3)
    expect(new Set(installments.map((i) => i.ledgerTransactionId))).toEqual(
      new Set(result.transactions.map((t) => t.id)),
    )
    expect(installments.map((i) => i.originalAmount)).toEqual([20_000, 20_000, 20_000])
    // faturas 2026-10, 2026-11, 2026-12, cada uma com 20000 e ligadas aos lançamentos
    expect(result.statements.map((s) => [s.statementKey, s.total, s.open])).toEqual([
      ['2026-10', 20_000, 20_000],
      ['2026-11', 20_000, 20_000],
      ['2026-12', 20_000, 20_000],
    ])
    expect(result.transactions.map((t) => t.statementId)).toEqual(
      result.statements.map((s) => s.id),
    )
    // saldo do cartão no ledger: -60000 (20000 pendente + 40000 previsto); uso do limite 60000
    expect(result.position.projected).toBe(-60_000)
    expect(result.position.current).toBe(-20_000)
    expect(result.position.usage.used).toBe(60_000)
    expect(result.position.usage.available).toBe(440_000)
    expect(result.limitWarning).toBeUndefined()
    expect(result.purchase).toMatchObject({
      accountId: 'card',
      totalAmount: 60_000,
      installmentCount: 3,
      userId: env.ctx.userId,
    })
    env.expectConsistent()
  })

  it('compra à vista (padrão 1x): um lançamento sem sufixo de parcela', async () => {
    const env = makeCardsEnv()
    const result = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 12_345,
      date: day('2026-10-05'),
      description: 'Mercado sintetico',
      categoryId: 'cat-1',
    })
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]).toMatchObject({
      amount: -12_345,
      description: 'Mercado sintetico',
      categoryId: 'cat-1',
      excludeFromBudget: false,
    })
    expect(env.cardsRepo.installments.size).toBe(1)
    env.expectConsistent()
  })

  it('compra no dia do fechamento entra na fatura que fecha; no dia seguinte, na próxima', async () => {
    const env = makeCardsEnv()
    const onClosing = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 1_000,
      date: day('2026-10-10'),
      description: 'No fechamento',
    })
    const after = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 1_000,
      date: day('2026-10-11'),
      description: 'Depois do fechamento',
    })
    expect(onClosing.statements[0]!.statementKey).toBe('2026-10')
    expect(after.statements[0]!.statementKey).toBe('2026-11')
    // reaproveita a fatura existente (mesmo id) em compras seguintes
    const again = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 500,
      date: day('2026-10-09'),
      description: 'Outra',
    })
    expect(again.statements[0]!.id).toBe(onClosing.statements[0]!.id)
    expect(again.statements[0]!.total).toBe(1_500)
    expect(env.statementsOf('card')).toHaveLength(2)
    env.expectConsistent()
  })

  it('parcelas no dia 31: 31/01, 28/02, 31/03 nas faturas 2026-02, 2026-03 e 2026-04', async () => {
    const env = makeCardsEnv({ today: '2026-01-31' })
    const result = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 30_000,
      installmentCount: 3,
      date: day('2026-01-31'),
      description: 'Dia 31',
    })
    expect(result.transactions.map((t) => iso(t.date))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ])
    expect(result.transactions.map((t) => t.statementKey)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
    ])
    env.expectConsistent()
  })

  it('virada de ano: compra em 20/12 com fechamento 10 vence em janeiro e as parcelas seguem', async () => {
    const env = makeCardsEnv({ today: '2026-12-20' })
    const result = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 20_000,
      installmentCount: 2,
      date: day('2026-12-20'),
      description: 'Fim de ano',
    })
    expect(result.transactions.map((t) => t.statementKey)).toEqual(['2027-01', '2027-02'])
    env.expectConsistent()
  })

  it('compra em fatura já fechada nasce CLEARED; futura nasce PLANNED', async () => {
    const env = makeCardsEnv({ today: '2026-10-20' })
    const result = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 20_000,
      installmentCount: 2,
      date: day('2026-10-05'),
      description: 'Retroativa',
    })
    expect(result.transactions.map((t) => t.status)).toEqual(['CLEARED', 'PLANNED'])
    env.expectConsistent()
  })

  it('CA-12: passa do limite: grava e devolve limitWarning LIMIT_EXCEEDED (não bloqueia)', async () => {
    const env = makeCardsEnv()
    const result = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 600_000,
      date: day('2026-10-05'),
      description: 'Grande',
    })
    expect(result.limitWarning).toBe('LIMIT_EXCEEDED')
    expect(result.position.usage.excess).toBe(100_000)
    expect(env.txnsOf('card')).toHaveLength(1)
    env.expectConsistent()
  })

  it('o uso do limite considera as parcelas futuras (RN-09)', async () => {
    const env = makeCardsEnv()
    await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 400_000,
      installmentCount: 4,
      date: day('2026-10-05'),
      description: 'Parcelado',
    })
    const second = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 150_000,
      date: day('2026-10-05'),
      description: 'Outra',
    })
    expect(second.limitWarning).toBe('LIMIT_EXCEEDED')
  })

  it('atomicidade: falha na parcela 2 no ledger desfaz compra, parcelas, faturas e saldo', async () => {
    const env = makeCardsEnv()
    env.ledgerRepo.failOn('insertTxn', 2)
    await expect(
      env.svc.createCardPurchase(env.ctx, {
        accountId: 'card',
        amount: 30_000,
        installmentCount: 3,
        date: day('2026-10-05'),
        description: 'Vai falhar',
      }),
    ).rejects.toThrow(/falha injetada/)
    expect(env.ledgerRepo.txns.size).toBe(0)
    expect(env.cardsRepo.purchases.size).toBe(0)
    expect(env.cardsRepo.installments.size).toBe(0)
    expect(env.cardsRepo.statements.size).toBe(0)
    env.expectConsistent()
  })

  it('atomicidade: falha ao gravar a parcela 2 no módulo desfaz também o ledger', async () => {
    const env = makeCardsEnv()
    env.cardsRepo.failOn('insertInstallment', 2)
    await expect(
      env.svc.createCardPurchase(env.ctx, {
        accountId: 'card',
        amount: 30_000,
        installmentCount: 3,
        date: day('2026-10-05'),
        description: 'Vai falhar',
      }),
    ).rejects.toThrow(/falha injetada/)
    expect(env.ledgerRepo.txns.size).toBe(0)
    expect(env.cardsRepo.purchases.size).toBe(0)
    expect(env.cardsRepo.installments.size).toBe(0)
    expect(env.cardsRepo.statements.size).toBe(0)
    expect(
      [...env.ledgerRepo.balances.values()].every(
        (b) => b.balancePlanned === 0 && b.balancePending === 0,
      ),
    ).toBe(true)
  })

  it('validações: valor, parcelas, cartão sem ciclo, conta que não é cartão, cartão de outro usuário', async () => {
    const env = makeCardsEnv()
    const base = { amount: 10_000, date: day('2026-10-05'), description: 'x' }
    expect(
      await errorCodeOf(() =>
        env.svc.createCardPurchase(env.ctx, { ...base, accountId: 'card', amount: 0 }),
      ),
    ).toBe('INVALID_AMOUNT')
    expect(
      await errorCodeOf(() =>
        env.svc.createCardPurchase(env.ctx, { ...base, accountId: 'card', installmentCount: 25 }),
      ),
    ).toBe('INVALID_INSTALLMENT_COUNT')
    expect(
      await errorCodeOf(() =>
        env.svc.createCardPurchase(env.ctx, {
          ...base,
          accountId: 'card',
          amount: 2,
          installmentCount: 3,
        }),
      ),
    ).toBe('INSTALLMENT_TOO_SMALL')
    expect(
      await errorCodeOf(() => env.svc.createCardPurchase(env.ctx, { ...base, accountId: 'loose' })),
    ).toBe('CARD_NOT_CONFIGURED')
    expect(
      await errorCodeOf(() => env.svc.createCardPurchase(env.ctx, { ...base, accountId: 'chk' })),
    ).toBe('CARD_NOT_FOUND')
    expect(
      await errorCodeOf(() =>
        env.svc.createCardPurchase(env.ctx, { ...base, accountId: 'other-card' }),
      ),
    ).toBe('CARD_NOT_FOUND')
    expect(
      await errorCodeOf(() =>
        env.svc.createCardPurchase(env.ctx, { ...base, accountId: 'nao-existe' }),
      ),
    ).toBe('CARD_NOT_FOUND')
    expect(env.ledgerRepo.txns.size).toBe(0)
    expect(env.cardsRepo.statements.size).toBe(0)
  })

  it('24 parcelas é aceito e a última vence 23 meses depois', async () => {
    const env = makeCardsEnv()
    const result = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 240_000,
      installmentCount: 24,
      date: day('2026-10-05'),
      description: 'Longo',
    })
    expect(result.transactions).toHaveLength(24)
    expect(iso(result.transactions[23]!.date)).toBe('2028-09-05')
    expect(result.statements).toHaveLength(24)
    env.expectConsistent()
  })

  it('o usuário de outro dono não enxerga nem usa as faturas (escopo por userId)', async () => {
    const env = makeCardsEnv()
    await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 1_000,
      date: day('2026-10-05'),
      description: 'x',
    })
    const other = { userId: OTHER_USER }
    expect(await errorCodeOf(() => env.svc.listStatements(other, 'card'))).toBe('CARD_NOT_FOUND')
    expect(
      await errorCodeOf(() =>
        env.svc.createCardPurchase(other, {
          accountId: 'card',
          amount: 100,
          date: day('2026-10-05'),
          description: 'x',
        }),
      ),
    ).toBe('CARD_NOT_FOUND')
  })
})
