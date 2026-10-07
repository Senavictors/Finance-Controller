import { describe, expect, it } from 'vitest'
import { day, errorCodeOf, makeCardsEnv, OTHER_USER, type CardsEnv } from './test-helpers'

async function purchase(
  env: CardsEnv,
  amount: number,
  date: string,
  extra: {
    installmentCount?: number
    accountId?: string
    categoryId?: string
    merchantId?: string
  } = {},
) {
  return env.svc.createCardPurchase(env.ctx, {
    accountId: extra.accountId ?? 'card',
    amount,
    installmentCount: extra.installmentCount,
    date: day(date),
    description: 'Compra sintetica',
    categoryId: extra.categoryId,
    merchantId: extra.merchantId,
  })
}

describe('refundCardTransaction', () => {
  it('CA-04: fatura de R$ 500,00 com estorno de R$ 120,00 => net 38000 e open 38000', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 50_000, '2026-10-05', {
      categoryId: 'cat-mercado',
      merchantId: 'm-1',
    })
    const original = bought.transactions[0]!

    const refund = await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: original.id,
      amount: 12_000,
      date: day('2026-10-05'),
    })
    expect(refund.statement).toMatchObject({ total: 38_000, open: 38_000, creditBalance: 0 })
    expect(refund.refundableRemaining).toBe(38_000)
    expect(refund.transaction).toMatchObject({
      kind: 'INCOME',
      amount: 12_000,
      accountId: 'card',
      refundOfId: original.id,
      categoryId: 'cat-mercado',
      merchantId: 'm-1',
      statementId: bought.statements[0]!.id,
      statementKey: '2026-10',
    })
    // o saldo do cartão no ledger reflete o estorno
    expect(env.ledgerRepo.balances.get('card')!.balancePending).toBe(-38_000)
    env.expectConsistent()
  })

  it('CA-04: estorno acima do estornável => REFUND_EXCEEDS_ORIGINAL; o restante é aceito', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 50_000, '2026-10-05')
    const original = bought.transactions[0]!
    await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: original.id,
      amount: 12_000,
      date: day('2026-10-06'),
    })
    expect(
      await errorCodeOf(() =>
        env.svc.refundCardTransaction(env.ctx, {
          originalTransactionId: original.id,
          amount: 38_001,
          date: day('2026-10-06'),
        }),
      ),
    ).toBe('REFUND_EXCEEDS_ORIGINAL')
    const rest = await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: original.id,
      amount: 38_000,
      date: day('2026-10-06'),
    })
    expect(rest.refundableRemaining).toBe(0)
    expect(rest.statement).toMatchObject({ total: 0, open: 0 })
    expect(
      await errorCodeOf(() =>
        env.svc.refundCardTransaction(env.ctx, {
          originalTransactionId: original.id,
          amount: 1,
          date: day('2026-10-06'),
        }),
      ),
    ).toBe('REFUND_EXCEEDS_ORIGINAL')
    env.expectConsistent()
  })

  it('CA-04: estorno de R$ 600,00 sobre fatura de R$ 500,00 => open 0 e creditBalance R$ 100,00', async () => {
    const env = makeCardsEnv()
    const old = await purchase(env, 60_000, '2026-09-05') // fatura 2026-09
    await purchase(env, 50_000, '2026-10-05') // fatura 2026-10: R$ 500,00
    const refund = await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: old.transactions[0]!.id,
      amount: 60_000,
      date: day('2026-10-05'),
      statementKey: '2026-10',
    })
    expect(refund.statement).toMatchObject({
      statementKey: '2026-10',
      total: -10_000,
      open: 0,
      creditBalance: 10_000,
      status: 'OPEN',
    })
    env.expectConsistent()
  })

  it('sem statementKey o estorno cai na fatura do ciclo da data do estorno', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 50_000, '2026-10-05')
    const refund = await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: bought.transactions[0]!.id,
      amount: 10_000,
      date: day('2026-10-12'), // depois do fechamento (10/10) => fatura 2026-11
    })
    expect(refund.statement.statementKey).toBe('2026-11')
    expect(refund.statement.total).toBe(-10_000)
    expect(refund.statement.creditBalance).toBe(10_000)
    env.expectConsistent()
  })

  it('parcela de compra parcelada: estorna só aquela parcela', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 60_000, '2026-10-05', { installmentCount: 3 })
    const second = bought.transactions[1]!
    const refund = await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: second.id,
      amount: 5_000,
      date: day('2026-10-06'),
    })
    expect(refund.refundableRemaining).toBe(15_000)
    expect(
      await errorCodeOf(() =>
        env.svc.refundCardTransaction(env.ctx, {
          originalTransactionId: second.id,
          amount: 20_000,
          date: day('2026-10-06'),
        }),
      ),
    ).toBe('REFUND_EXCEEDS_ORIGINAL')
  })

  it('só saídas do cartão são estornáveis: estorno, pagamento e conta que não é cartão', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const bought = await purchase(env, 50_000, '2026-10-05')
    const refund = await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: bought.transactions[0]!.id,
      amount: 1_000,
      date: day('2026-10-06'),
    })
    expect(
      await errorCodeOf(() =>
        env.svc.refundCardTransaction(env.ctx, {
          originalTransactionId: refund.transaction.id,
          amount: 100,
          date: day('2026-10-06'),
        }),
      ),
    ).toBe('NOT_REFUNDABLE')

    const checking = await env.ledger.createTransaction(env.ctx, {
      accountId: 'chk',
      kind: 'EXPENSE',
      amount: 5_000,
      date: day('2026-10-05'),
      description: 'Debito',
    })
    expect(
      await errorCodeOf(() =>
        env.svc.refundCardTransaction(env.ctx, {
          originalTransactionId: checking.transaction.id,
          amount: 100,
          date: day('2026-10-06'),
        }),
      ),
    ).toBe('NOT_A_CARD_TRANSACTION')
    expect(
      await errorCodeOf(() =>
        env.svc.refundCardTransaction(
          { userId: OTHER_USER },
          {
            originalTransactionId: bought.transactions[0]!.id,
            amount: 100,
            date: day('2026-10-06'),
          },
        ),
      ),
    ).toBe('TRANSACTION_NOT_FOUND')
  })

  it('estorno em fatura já paga exige outra fatura (STATEMENT_PAID); statementKey resolve', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const bought = await purchase(env, 20_000, '2026-10-05')
    env.setNow('2026-10-12')
    await env.svc.payStatement(env.ctx, {
      statementId: bought.statements[0]!.id,
      sourceAccountId: 'chk',
      amount: 20_000,
      date: day('2026-10-12'),
    })
    // data 2026-10-09 cai na fatura 2026-10 (já PAID)
    expect(
      await errorCodeOf(() =>
        env.svc.refundCardTransaction(env.ctx, {
          originalTransactionId: bought.transactions[0]!.id,
          amount: 1_000,
          date: day('2026-10-09'),
        }),
      ),
    ).toBe('STATEMENT_PAID')
    const ok = await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: bought.transactions[0]!.id,
      amount: 1_000,
      date: day('2026-10-12'),
      statementKey: '2026-11',
    })
    expect(ok.statement.statementKey).toBe('2026-11')
    env.expectConsistent()
  })

  it('statementKey de fatura inexistente fora da janela é rejeitada', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 20_000, '2026-10-05')
    expect(
      await errorCodeOf(() =>
        env.svc.refundCardTransaction(env.ctx, {
          originalTransactionId: bought.transactions[0]!.id,
          amount: 1_000,
          date: day('2026-10-06'),
          statementKey: '2027-05',
        }),
      ),
    ).toBe('STATEMENT_TARGET_OUT_OF_RANGE')
  })
})

describe('moveTransactionToStatement', () => {
  it('CA-08: leva a compra de 2026-10 para 2026-11 sem mexer em data nem saldo', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 30_000, '2026-10-05')
    const txn = bought.transactions[0]!
    const positionBefore = await env.ledger.getAccountPosition(env.ctx, 'card')

    const moved = await env.svc.moveTransactionToStatement(env.ctx, {
      transactionId: txn.id,
      targetStatementKey: '2026-11',
    })
    expect(moved.from).toMatchObject({ statementKey: '2026-10', total: 0 })
    expect(moved.to).toMatchObject({ statementKey: '2026-11', total: 30_000 })
    expect(moved.transaction).toMatchObject({
      statementKey: '2026-11',
      date: day('2026-10-05'),
      amount: -30_000,
    })
    expect(moved.transaction.userLocked.statement).toBe(true)
    expect(await env.ledger.getAccountPosition(env.ctx, 'card')).toEqual(positionBefore)
    env.expectConsistent()
  })

  it('CA-08: depois de syncCardStatuses o lançamento permanece na fatura escolhida', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 30_000, '2026-10-05')
    const txn = bought.transactions[0]!
    await env.svc.moveTransactionToStatement(env.ctx, {
      transactionId: txn.id,
      targetStatementKey: '2026-11',
    })
    env.setNow('2026-10-20')
    await env.svc.syncCardStatuses(env.ctx)
    await env.svc.syncCardStatuses(env.ctx)
    expect(env.ledgerRepo.txns.get(txn.id)).toMatchObject({
      statementKey: '2026-11',
      statementId: env.statementByKey('card', '2026-11').id,
    })
    env.expectConsistent()
  })

  it('lançamento movido pelo usuário para fora de qualquer fatura (null) não é revinculado pelo sync', async () => {
    const env = makeCardsEnv()
    const created = await env.ledger.createTransaction(env.ctx, {
      accountId: 'card',
      kind: 'EXPENSE',
      amount: 7_000,
      date: day('2026-10-05'),
      description: 'Lancamento rapido',
      status: 'PENDING',
    })
    await env.ledger.setTransactionLinks(
      env.ctx,
      created.transaction.id,
      { statementId: null, statementKey: null },
      { actor: 'USER' },
    )
    await env.svc.syncCardStatuses(env.ctx)
    expect(env.ledgerRepo.txns.get(created.transaction.id)!.statementId).toBeNull()
  })

  it('mover parcela de compra parcelada move apenas aquela parcela', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 60_000, '2026-10-05', { installmentCount: 3 })
    // parcela 2 (fatura 2026-11) vai para 2026-12
    const moved = await env.svc.moveTransactionToStatement(env.ctx, {
      transactionId: bought.transactions[1]!.id,
      targetStatementKey: '2026-12',
    })
    expect(moved.to).toMatchObject({ statementKey: '2026-12', total: 40_000 })
    expect(moved.from).toMatchObject({ statementKey: '2026-11', total: 0 })
    expect(env.ledgerRepo.txns.get(bought.transactions[0]!.id)!.statementKey).toBe('2026-10')
    expect(env.ledgerRepo.txns.get(bought.transactions[2]!.id)!.statementKey).toBe('2026-12')
    // data da parcela e vínculo com CardInstallment intactos
    expect(env.ledgerRepo.txns.get(bought.transactions[1]!.id)!.date).toEqual(day('2026-11-05'))
    expect([...env.cardsRepo.installments.values()].map((i) => i.ledgerTransactionId)).toContain(
      bought.transactions[1]!.id,
    )
    env.expectConsistent()
  })

  it('cria a fatura de destino quando ela não existe (dentro da janela do ciclo)', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 10_000, '2026-10-05')
    expect(env.statementsOf('card')).toHaveLength(1)
    const moved = await env.svc.moveTransactionToStatement(env.ctx, {
      transactionId: bought.transactions[0]!.id,
      targetStatementKey: '2026-09', // fatura anterior, ainda inexistente
    })
    expect(moved.to.statementKey).toBe('2026-09')
    expect(env.statementsOf('card').map((s) => s.statementKey)).toEqual(['2026-09', '2026-10'])
    expect(
      await errorCodeOf(() =>
        env.svc.moveTransactionToStatement(env.ctx, {
          transactionId: bought.transactions[0]!.id,
          targetStatementKey: '2027-03',
        }),
      ),
    ).toBe('STATEMENT_TARGET_OUT_OF_RANGE')
    env.expectConsistent()
  })

  it('o status acompanha a fatura de destino: fechada => CLEARED, aberta => PENDING', async () => {
    const env = makeCardsEnv({ today: '2026-10-20' })
    const bought = await purchase(env, 10_000, '2026-10-15') // fatura 2026-11 (aberta; fecha 10/11)
    const txn = bought.transactions[0]!
    expect(txn.status).toBe('PENDING')
    const toClosed = await env.svc.moveTransactionToStatement(env.ctx, {
      transactionId: txn.id,
      targetStatementKey: '2026-10', // fechou em 10/10
    })
    expect(toClosed.transaction.status).toBe('CLEARED')
    const back = await env.svc.moveTransactionToStatement(env.ctx, {
      transactionId: txn.id,
      targetStatementKey: '2026-11',
    })
    expect(back.transaction.status).toBe('PENDING')
    env.expectConsistent()
  })

  it('fatura PAID não recebe nem cede lançamentos (STATEMENT_PAID)', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const a = await purchase(env, 20_000, '2026-10-05') // 2026-10
    const b = await purchase(env, 10_000, '2026-10-20') // 2026-11
    env.setNow('2026-10-12')
    await env.svc.payStatement(env.ctx, {
      statementId: a.statements[0]!.id,
      sourceAccountId: 'chk',
      amount: 20_000,
      date: day('2026-10-12'),
    })
    // para a fatura paga
    expect(
      await errorCodeOf(() =>
        env.svc.moveTransactionToStatement(env.ctx, {
          transactionId: b.transactions[0]!.id,
          targetStatementKey: '2026-10',
        }),
      ),
    ).toBe('STATEMENT_PAID')
    // da fatura paga
    expect(
      await errorCodeOf(() =>
        env.svc.moveTransactionToStatement(env.ctx, {
          transactionId: a.transactions[0]!.id,
          targetStatementKey: '2026-11',
        }),
      ),
    ).toBe('STATEMENT_PAID')
    expect(env.ledgerRepo.txns.get(a.transactions[0]!.id)!.statementKey).toBe('2026-10')
  })

  it('fatura de outro cartão e lançamento que não é de cartão retornam erro', async () => {
    const env = makeCardsEnv()
    const a = await purchase(env, 20_000, '2026-10-05')
    const other = await purchase(env, 5_000, '2026-10-05', { accountId: 'card2' })
    expect(
      await errorCodeOf(() =>
        env.svc.moveTransactionToStatement(env.ctx, {
          transactionId: a.transactions[0]!.id,
          targetStatementId: other.statements[0]!.id,
        }),
      ),
    ).toBe('STATEMENT_ACCOUNT_MISMATCH')

    const checking = await env.ledger.createTransaction(env.ctx, {
      accountId: 'chk',
      kind: 'EXPENSE',
      amount: 1_000,
      date: day('2026-10-05'),
      description: 'Debito',
    })
    expect(
      await errorCodeOf(() =>
        env.svc.moveTransactionToStatement(env.ctx, {
          transactionId: checking.transaction.id,
          targetStatementKey: '2026-10',
        }),
      ),
    ).toBe('NOT_A_CARD_TRANSACTION')
    expect(
      await errorCodeOf(() =>
        env.svc.moveTransactionToStatement(env.ctx, { transactionId: a.transactions[0]!.id }),
      ),
    ).toBe('INVALID_STATEMENT_KEY')
    expect(
      await errorCodeOf(() =>
        env.svc.moveTransactionToStatement(env.ctx, {
          transactionId: 'nao-existe',
          targetStatementKey: '2026-10',
        }),
      ),
    ).toBe('TRANSACTION_NOT_FOUND')
    expect(
      await errorCodeOf(() =>
        env.svc.moveTransactionToStatement(
          { userId: OTHER_USER },
          {
            transactionId: a.transactions[0]!.id,
            targetStatementKey: '2026-11',
          },
        ),
      ),
    ).toBe('TRANSACTION_NOT_FOUND')
  })

  it('estorno também pode ser movido entre faturas', async () => {
    const env = makeCardsEnv()
    const bought = await purchase(env, 50_000, '2026-10-05')
    const refund = await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: bought.transactions[0]!.id,
      amount: 10_000,
      date: day('2026-10-06'),
    })
    const moved = await env.svc.moveTransactionToStatement(env.ctx, {
      transactionId: refund.transaction.id,
      targetStatementKey: '2026-11',
    })
    expect(moved.from).toMatchObject({ statementKey: '2026-10', total: 50_000 })
    expect(moved.to).toMatchObject({
      statementKey: '2026-11',
      total: -10_000,
      creditBalance: 10_000,
    })
    env.expectConsistent()
  })
})
