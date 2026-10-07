import { describe, expect, it } from 'vitest'
import { day, errorCodeOf, makeCardsEnv, OTHER_USER } from './test-helpers'

describe('syncCardStatuses', () => {
  it('CA-09: promove PLANNED->PENDING (data chegou) e PENDING->CLEARED (fatura fechou), idempotente', async () => {
    const env = makeCardsEnv()
    const bought = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 60_000,
      installmentCount: 3,
      date: day('2026-10-05'),
      description: 'Compra sintetica',
    })
    expect(bought.transactions.map((t) => t.status)).toEqual(['PENDING', 'PLANNED', 'PLANNED'])

    env.setNow('2026-11-06')
    const first = await env.svc.syncCardStatuses(env.ctx)
    expect(first.today).toEqual(day('2026-11-06'))
    expect(first.cards).toHaveLength(2) // card e card2 (loose não tem ciclo e fica de fora)
    const report = first.cards.find((c) => c.accountId === 'card')!
    expect(report).toMatchObject({ linked: 0, promotedToPending: 1, promotedToCleared: 1 })
    expect(bought.transactions.map((t) => env.ledgerRepo.txns.get(t.id)!.status)).toEqual([
      'CLEARED',
      'PENDING',
      'PLANNED',
    ])
    // a fatura de outubro venceu sem pagamento
    expect(env.statementByKey('card', '2026-10').status).toBe('OVERDUE')
    expect(report.statementsUpdated).toBeGreaterThan(0)

    // segunda chamada: nada muda
    const second = await env.svc.syncCardStatuses(env.ctx)
    const again = second.cards.find((c) => c.accountId === 'card')!
    expect(again).toMatchObject({
      linked: 0,
      promotedToPending: 0,
      promotedToCleared: 0,
      statementsUpdated: 0,
    })
    env.expectConsistent()

    // o cache do ledger continua coerente: rebuild não altera nada
    const rebuilt = await env.ledger.rebuildAccountBalance(env.ctx, 'card')
    expect(rebuilt.drifted).toBe(false)
  })

  it('PLANNED nascido em fatura já fechada vira CLEARED direto', async () => {
    const env = makeCardsEnv()
    await env.ledger.createTransaction(env.ctx, {
      accountId: 'card',
      kind: 'EXPENSE',
      amount: 5_000,
      date: day('2026-10-05'),
      description: 'Previsto',
      status: 'PLANNED',
    })
    env.setNow('2026-10-20')
    const report = (await env.svc.syncCardStatuses(env.ctx, { accountId: 'card' })).cards[0]!
    // vinculado à fatura 2026-10 (fechada em 10/10) e promovido direto para CLEARED
    expect(report).toMatchObject({ linked: 1, promotedToPending: 0, promotedToCleared: 1 })
    env.expectConsistent()
  })

  it('vincula lançamento de cartão sem fatura ao ciclo da própria data (cria a fatura)', async () => {
    const env = makeCardsEnv()
    const created = await env.ledger.createTransaction(env.ctx, {
      accountId: 'card',
      kind: 'EXPENSE',
      amount: 7_000,
      date: day('2026-10-12'),
      description: 'Lancamento rapido',
      status: 'PENDING',
    })
    expect(created.transaction.statementId).toBeNull()
    const result = await env.svc.syncCardStatuses(env.ctx, { accountId: 'card' })
    expect(result.cards[0]).toMatchObject({ linked: 1 })
    const linked = env.ledgerRepo.txns.get(created.transaction.id)!
    expect(linked.statementKey).toBe('2026-11')
    expect(linked.statementId).toBe(env.statementByKey('card', '2026-11').id)
    expect(env.statementByKey('card', '2026-11')).toMatchObject({
      totalAmount: 7_000,
      status: 'OPEN',
    })
    // lançamento vinculado pelo sync não é travado: o usuário ainda pode movê-lo depois
    expect(linked.userLocked.statement).toBeUndefined()
    env.expectConsistent()
  })

  it('ajuste (ex.: saldo inicial do cartão) não é vinculado automaticamente', async () => {
    const env = makeCardsEnv()
    await env.fund('card', -30_000)
    const result = await env.svc.syncCardStatuses(env.ctx, { accountId: 'card' })
    expect(result.cards[0]!.linked).toBe(0)
    expect(env.statementsOf('card')).toHaveLength(0)
  })

  it('não reatribui lançamento que já tem fatura (mudança de ciclo preserva faturas passadas)', async () => {
    const env = makeCardsEnv()
    const bought = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 10_000,
      date: day('2026-10-05'),
      description: 'x',
    })
    // o dono muda o fechamento do cartão para o dia 3: o ciclo novo mandaria a compra para 2026-11
    env.cardsRepo.accounts.get('card')!.closingDay = 3
    await env.svc.syncCardStatuses(env.ctx, { accountId: 'card' })
    expect(env.ledgerRepo.txns.get(bought.transactions[0]!.id)!.statementKey).toBe('2026-10')
  })

  it('pagamento de fatura PLANNED vira CLEARED quando a data chega (as duas pernas)', async () => {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    const bought = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 20_000,
      date: day('2026-10-05'),
      description: 'x',
    })
    env.setNow('2026-10-12')
    const paid = await env.svc.payStatement(env.ctx, {
      statementId: bought.statements[0]!.id,
      sourceAccountId: 'chk',
      amount: 20_000,
      date: day('2026-10-17'),
    })
    expect(env.ledgerRepo.txns.get(paid.cardTransactionId)!.status).toBe('PLANNED')
    env.setNow('2026-10-17')
    const report = (await env.svc.syncCardStatuses(env.ctx, { accountId: 'card' })).cards[0]!
    expect(report.promotedToCleared).toBeGreaterThanOrEqual(1)
    expect(env.ledgerRepo.txns.get(paid.cardTransactionId)!.status).toBe('CLEARED')
    expect(env.ledgerRepo.txns.get(paid.sourceTransactionId)!.status).toBe('CLEARED')
    env.expectConsistent()
  })

  it('RECONCILED nunca é tocado', async () => {
    const env = makeCardsEnv()
    const bought = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 10_000,
      date: day('2026-10-05'),
      description: 'x',
    })
    const id = bought.transactions[0]!.id
    await env.ledger.changeTransactionStatus(env.ctx, id, 'CLEARED')
    await env.ledger.changeTransactionStatus(env.ctx, id, 'RECONCILED')
    env.setNow('2026-11-20')
    await env.svc.syncCardStatuses(env.ctx)
    expect(env.ledgerRepo.txns.get(id)!.status).toBe('RECONCILED')
  })

  it('sem cartões configurados devolve vazio; cartão sem ciclo explícito falha', async () => {
    const env = makeCardsEnv()
    const empty = await env.svc.syncCardStatuses({ userId: 'user-sem-cartao' })
    expect(empty.cards).toEqual([])
    expect(await errorCodeOf(() => env.svc.syncCardStatuses(env.ctx, { accountId: 'loose' }))).toBe(
      'CARD_NOT_CONFIGURED',
    )
    expect(await errorCodeOf(() => env.svc.syncCardStatuses(env.ctx, { accountId: 'chk' }))).toBe(
      'CARD_NOT_FOUND',
    )
  })

  it('usa o dia de São Paulo: 01:00Z de 11/10 ainda é 10/10 (fatura aberta, nada vira CLEARED)', async () => {
    const env = makeCardsEnv()
    const bought = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 10_000,
      date: day('2026-10-05'),
      description: 'x',
    })
    const clock = env.deps.clock
    env.deps.clock = () => new Date('2026-10-11T01:00:00.000Z')
    await env.svc.syncCardStatuses(env.ctx)
    expect(env.ledgerRepo.txns.get(bought.transactions[0]!.id)!.status).toBe('PENDING')
    env.deps.clock = () => new Date('2026-10-11T03:00:00.000Z')
    await env.svc.syncCardStatuses(env.ctx)
    expect(env.ledgerRepo.txns.get(bought.transactions[0]!.id)!.status).toBe('CLEARED')
    env.deps.clock = clock
  })
})

describe('listStatements, getStatementDetail e getCardSummary', () => {
  async function scenario() {
    const env = makeCardsEnv()
    await env.fund('chk', 100_000)
    await env.fund('chk2', 500_000)
    const bought = await env.svc.createCardPurchase(env.ctx, {
      accountId: 'card',
      amount: 60_000,
      installmentCount: 3,
      date: day('2026-10-05'),
      description: 'Compra sintetica',
    })
    const refund = await env.svc.refundCardTransaction(env.ctx, {
      originalTransactionId: bought.transactions[0]!.id,
      amount: 5_000,
      date: day('2026-10-05'),
    })
    return { env, bought, refund }
  }

  it('listStatements: da mais recente para a mais antiga e sincroniza antes de ler', async () => {
    const { env } = await scenario()
    env.setNow('2026-11-06')
    const list = await env.svc.listStatements(env.ctx, 'card')
    expect(list.map((s) => s.statementKey)).toEqual(['2026-12', '2026-11', '2026-10'])
    // a leitura promoveu os status por data
    expect(
      env.ledgerRepo.txns.get([...env.cardsRepo.installments.values()][1]!.ledgerTransactionId)!
        .status,
    ).toBe('PENDING')
    expect(list.find((s) => s.statementKey === '2026-10')).toMatchObject({
      total: 15_000,
      open: 15_000,
      status: 'OVERDUE',
      daysToDue: -20,
    })
    const noSync = await env.svc.listStatements(env.ctx, 'card', { sync: false })
    expect(noSync).toHaveLength(3)
    expect(await errorCodeOf(() => env.svc.listStatements({ userId: OTHER_USER }, 'card'))).toBe(
      'CARD_NOT_FOUND',
    )
  })

  it('getStatementDetail: itens, componentes dos totais, open, creditBalance, dias para vencer e conta sugerida', async () => {
    const { env, bought } = await scenario()
    env.setNow('2026-10-12')
    const detail = await env.svc.getStatementDetail(env.ctx, bought.statements[0]!.id)
    expect(detail.card).toEqual({ id: 'card', name: 'card' })
    expect(detail.items.map((t) => t.kind)).toEqual(['EXPENSE', 'INCOME'])
    expect(detail.totals).toMatchObject({
      charges: 20_000,
      credits: 5_000,
      net: 15_000,
      paid: 0,
      open: 15_000,
      creditBalance: 0,
    })
    expect(detail.totals.breakdown).toMatchObject({ expenses: 20_000, refunds: 5_000 })
    expect(detail.statement).toMatchObject({
      statementKey: '2026-10',
      status: 'CLOSED',
      open: 15_000,
      daysToDue: 5,
    })
    // chk2 tem R$ 5.000,00 de saldo; chk, R$ 1.000,00 + R$ 500,00 de cheque especial
    expect(detail.suggestedPaymentAccountId).toBe('chk2')
  })

  it('getStatementDetail de fatura quitada não sugere conta; de outro usuário => 404', async () => {
    const { env, bought } = await scenario()
    env.setNow('2026-10-12')
    await env.svc.payStatement(env.ctx, {
      statementId: bought.statements[0]!.id,
      sourceAccountId: 'chk2',
      amount: 15_000,
      date: day('2026-10-12'),
    })
    const detail = await env.svc.getStatementDetail(env.ctx, bought.statements[0]!.id)
    expect(detail.statement).toMatchObject({ status: 'PAID', open: 0, paid: 15_000 })
    expect(detail.suggestedPaymentAccountId).toBeNull()
    expect(detail.items.map((t) => t.kind)).toContain('CARD_PAYMENT')
    expect(
      await errorCodeOf(() =>
        env.svc.getStatementDetail({ userId: OTHER_USER }, bought.statements[0]!.id),
      ),
    ).toBe('STATEMENT_NOT_FOUND')
    expect(await errorCodeOf(() => env.svc.getStatementDetail(env.ctx, 'nao-existe'))).toBe(
      'STATEMENT_NOT_FOUND',
    )
  })

  it('getCardSummary: limite, usado (inclui futuras), disponível, fatura atual/próxima, a pagar e parcelas ativas', async () => {
    const { env } = await scenario()
    env.setNow('2026-10-12')
    await env.svc.listStatements(env.ctx, 'card') // sincroniza: fatura 2026-10 fechada
    const summary = await env.svc.getCardSummary(env.ctx, 'card')
    expect(summary).toMatchObject({
      accountId: 'card',
      limit: 500_000,
      used: 55_000, // 60000 de compras - 5000 de estorno
      available: 445_000,
      excess: 0,
      currentStatementKey: '2026-11',
      nextStatementKey: '2026-12',
      installmentsRemainingAmount: 40_000,
    })
    expect(summary.currentStatement).toMatchObject({ statementKey: '2026-11', total: 20_000 })
    expect(summary.nextStatement).toMatchObject({ statementKey: '2026-12', total: 20_000 })
    expect(summary.payable.map((s) => s.statementKey)).toEqual(['2026-10'])
    expect(summary.activePurchases).toEqual([
      expect.objectContaining({
        description: 'Compra sintetica',
        installmentCount: 3,
        remainingCount: 2,
        remainingAmount: 40_000,
      }),
    ])
    expect(await errorCodeOf(() => env.svc.getCardSummary(env.ctx, 'chk'))).toBe('CARD_NOT_FOUND')
  })
})
