import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestDb } from '../../../../../tests/helpers/db'
import type { LedgerService } from '@/server/modules/ledger'
import { createCardsService, type CardsService } from '../application/cards-service'
import { computeStatementTotals } from '../domain/statement-totals'
import { PrismaCardsRepository } from './prisma-cards-repository'

/**
 * FC2-F1-03: cartões sobre o Postgres real (ledger Prisma + repositório de cartões na MESMA
 * transação). Cobre atomicidade, concorrência (pagamentos, compra + pagamento, estornos, mover
 * em sentidos opostos), `userLocked.statement` e idempotência do sync. Só roda com
 * `DATABASE_URL_TEST` (database descartável). Dados 100% sintéticos.
 */
const db = getTestDb()
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
/** Meio-dia em São Paulo (15:00Z). */
const noonSp = (iso: string) => new Date(`${iso}T15:00:00.000Z`)

/** Σ amount por balde (RECONCILED conta como CLEARED), a mesma conta do ledger (ADR-019). */
function computeBalances(txns: ReadonlyArray<{ amount: number; status: string }>) {
  const total = { cleared: 0, pending: 0, planned: 0 }
  for (const txn of txns) {
    if (txn.status === 'PLANNED') total.planned += txn.amount
    else if (txn.status === 'PENDING') total.pending += txn.amount
    else total.cleared += txn.amount
  }
  return total
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    return (error as { code?: string }).code ?? `UNEXPECTED:${String(error)}`
  }
  return undefined
}

describe.skipIf(!db)('cartões: Postgres real (DATABASE_URL_TEST)', { timeout: 60_000 }, () => {
  const client = db!
  const userId = `cd-user-${randomUUID()}`
  const otherUserId = `cd-other-${randomUUID()}`
  const ctx = { userId }
  let now = noonSp('2026-10-05')
  let ledger: LedgerService
  let svc: CardsService
  /** Falha injetada na N-ésima chamada de `createTransaction` do ledger (atomicidade). */
  let failCreateOnCall: number | null = null
  let createCalls = 0

  async function newCard(name = 'Cartão', limit = 500_000) {
    return client.account.create({
      data: {
        userId,
        name: `${name} ${randomUUID().slice(0, 8)}`,
        type: 'CREDIT_CARD',
        creditLimit: limit,
        closingDay: 10,
        dueDay: 17,
      },
    })
  }

  async function newChecking(balance: number, overdraftLimit = 0) {
    const account = await client.account.create({
      data: {
        userId,
        name: `Corrente ${randomUUID().slice(0, 8)}`,
        type: 'CHECKING',
        overdraftLimit,
      },
    })
    if (balance !== 0) {
      await ledger.createTransaction(ctx, {
        accountId: account.id,
        kind: 'ADJUSTMENT',
        amount: balance,
        date: day('2026-01-01'),
        description: 'Saldo inicial',
        excludeFromBudget: true,
      })
    }
    return account
  }

  async function expectCacheMatchesLedger(accountId: string) {
    const txns = await client.transaction.findMany({ where: { accountId } })
    const row = await client.accountBalance.findUnique({ where: { accountId } })
    const cache = row
      ? { cleared: row.balanceCleared, pending: row.balancePending, planned: row.balancePlanned }
      : { cleared: 0, pending: 0, planned: 0 }
    expect(cache).toEqual(computeBalances(txns))
  }

  /** Cache de cada fatura do cartão bate com os lançamentos ligados a ela. */
  async function expectStatementsConsistent(accountId: string) {
    const statements = await client.creditCardStatement.findMany({ where: { accountId } })
    for (const row of statements) {
      const items = await client.transaction.findMany({ where: { statementId: row.id } })
      const totals = computeStatementTotals(items)
      expect({ key: row.statementKey, total: row.totalAmount, paid: row.paidAmount }).toEqual({
        key: row.statementKey,
        total: totals.net,
        paid: totals.paid,
      })
    }
  }

  /** Compra à vista numa fatura fechada/vencida (2026-09), para testar pagamento. */
  async function seedClosedStatement(cardId: string, amount = 38_000) {
    const purchase = await svc.createCardPurchase(ctx, {
      accountId: cardId,
      amount,
      date: day('2026-09-01'),
      description: 'sintetico-compra-fatura-fechada',
    })
    return {
      purchase,
      statementId: purchase.installments[0]!.statementId,
      transactionId: purchase.transactions[0]!.id,
    }
  }

  beforeAll(async () => {
    await client.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.invalid`, password: 'x' },
        { id: otherUserId, email: `${otherUserId}@example.invalid`, password: 'x' },
      ],
    })
    // API pública do ledger ligada ao Prisma (`ledger/service`). `@/server/db` lê DATABASE_URL
    // ao carregar: aponta para o banco de teste (já validado por `getTestDb`) e importa só agora.
    const previousUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
    let getLedgerService: typeof import('@/server/modules/ledger/service').getLedgerService
    try {
      ;({ getLedgerService } = await import('@/server/modules/ledger/service'))
    } finally {
      // o adapter já capturou a URL; restaura para não vazar para outros testes do worker
      if (previousUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousUrl
    }
    const base = getLedgerService()
    ledger = base
    // ledger com falha injetável na criação de lançamentos dentro de runInTransaction
    const faulty: LedgerService = {
      ...base,
      runInTransaction: (c, fn) =>
        base.runInTransaction(c, (uow) =>
          fn({
            ...uow,
            createTransaction: async (input) => {
              createCalls += 1
              if (failCreateOnCall !== null && createCalls === failCreateOnCall) {
                throw new Error('falha injetada (teste de atomicidade)')
              }
              return uow.createTransaction(input)
            },
          }),
        ),
    }
    svc = createCardsService({
      ledger: faulty,
      repo: new PrismaCardsRepository(client),
      clock: () => new Date(now),
      uuid: () => randomUUID(),
    })
  })

  afterAll(async () => {
    await client.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
    await client.$disconnect()
  })

  it('CA-03: compra 6000 em 3x gera 3 lancamentos, 3 parcelas 1:1 e as faturas 2026-10/11/12', async () => {
    const card = await newCard()
    const result = await svc.createCardPurchase(ctx, {
      accountId: card.id,
      amount: 60_000,
      installmentCount: 3,
      date: day('2026-10-05'),
      description: 'sintetico-compra-3x',
    })

    const txns = await client.transaction.findMany({
      where: { accountId: card.id },
      orderBy: { date: 'asc' },
    })
    expect(
      txns.map((t) => [t.amount, t.date.toISOString().slice(0, 10), t.status, t.statementKey]),
    ).toEqual([
      [-20_000, '2026-10-05', 'PENDING', '2026-10'],
      [-20_000, '2026-11-05', 'PLANNED', '2026-11'],
      [-20_000, '2026-12-05', 'PLANNED', '2026-12'],
    ])
    const installments = await client.cardInstallment.findMany({
      where: { purchaseId: result.purchase.id },
      orderBy: { installmentNumber: 'asc' },
    })
    expect(installments.map((i) => i.ledgerTransactionId)).toEqual(txns.map((t) => t.id))
    const statements = await client.creditCardStatement.findMany({
      where: { accountId: card.id },
      orderBy: { statementKey: 'asc' },
    })
    expect(statements.map((s) => [s.statementKey, s.totalAmount, s.paidAmount])).toEqual([
      ['2026-10', 20_000, 0],
      ['2026-11', 20_000, 0],
      ['2026-12', 20_000, 0],
    ])
    expect(result.position.usage.used).toBe(60_000)
    await expectCacheMatchesLedger(card.id)
  })

  it('CA-12: compra acima do limite e gravada com limitWarning', async () => {
    const card = await newCard('Cartão limite', 10_000)
    const result = await svc.createCardPurchase(ctx, {
      accountId: card.id,
      amount: 30_000,
      date: day('2026-10-05'),
      description: 'sintetico-acima-do-limite',
    })
    expect(result.limitWarning).toBe('LIMIT_EXCEEDED')
    expect(await client.transaction.count({ where: { accountId: card.id } })).toBe(1)
  })

  it('atomicidade: falha na parcela 2 desfaz compra, parcelas, faturas, lancamentos e saldo', async () => {
    const card = await newCard()
    createCalls = 0
    failCreateOnCall = 2
    const code = await codeOf(
      svc.createCardPurchase(ctx, {
        accountId: card.id,
        amount: 90_000,
        installmentCount: 3,
        date: day('2026-10-05'),
        description: 'sintetico-falha-parcela-2',
      }),
    )
    failCreateOnCall = null
    expect(code).toMatch(/^UNEXPECTED:/)

    expect(await client.transaction.count({ where: { accountId: card.id } })).toBe(0)
    expect(await client.cardPurchase.count({ where: { accountId: card.id } })).toBe(0)
    expect(await client.creditCardStatement.count({ where: { accountId: card.id } })).toBe(0)
    expect(await client.accountBalance.findUnique({ where: { accountId: card.id } })).toBeNull()
  })

  it('compras concorrentes que criam as mesmas faturas: sem deadlock, 3 faturas e totais coerentes', async () => {
    const card = await newCard()
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        svc.createCardPurchase(ctx, {
          accountId: card.id,
          amount: 30_000,
          installmentCount: 3,
          date: day('2026-10-05'),
          description: `sintetico-concorrente-${i}`,
        }),
      ),
    )
    expect(results.filter((r) => r.status === 'rejected')).toEqual([])
    const statements = await client.creditCardStatement.findMany({
      where: { accountId: card.id },
      orderBy: { statementKey: 'asc' },
    })
    expect(statements.map((s) => [s.statementKey, s.totalAmount])).toEqual([
      ['2026-10', 50_000],
      ['2026-11', 50_000],
      ['2026-12', 50_000],
    ])
    await expectCacheMatchesLedger(card.id)
    await expectStatementsConsistent(card.id)
  })

  it('CA-05/CA-06: pagamento parcial e total como par CARD_PAYMENT; aviso de cheque especial', async () => {
    const card = await newCard()
    const checking = await newChecking(10_000, 50_000)
    const { statementId } = await seedClosedStatement(card.id, 38_000)

    const first = await svc.payStatement(ctx, {
      statementId,
      sourceAccountId: checking.id,
      amount: 20_000,
      date: day('2026-10-05'),
    })
    expect(first.statement.paid).toBe(20_000)
    expect(first.statement.open).toBe(18_000)
    expect(first.overdraftWarning).toEqual({
      willUseOverdraft: true,
      usedAfter: 10_000,
      excessAfter: 0,
    })

    const legs = await client.transaction.findMany({ where: { transferId: first.transferId } })
    expect(legs).toHaveLength(2)
    expect(legs.every((l) => l.kind === 'CARD_PAYMENT')).toBe(true)
    expect(legs.find((l) => l.accountId === checking.id)).toMatchObject({
      amount: -20_000,
      statementId: null,
    })
    expect(legs.find((l) => l.accountId === card.id)).toMatchObject({
      amount: 20_000,
      statementId,
    })

    const second = await svc.payStatement(ctx, {
      statementId,
      sourceAccountId: checking.id,
      amount: 18_000,
      date: day('2026-10-05'),
    })
    expect(second.statement.status).toBe('PAID')
    expect(
      await codeOf(
        svc.payStatement(ctx, {
          statementId,
          sourceAccountId: checking.id,
          amount: 100,
          date: day('2026-10-05'),
        }),
      ),
    ).toBe('STATEMENT_ALREADY_PAID')
    await expectCacheMatchesLedger(card.id)
    await expectCacheMatchesLedger(checking.id)
    await expectStatementsConsistent(card.id)
  })

  it('pagamentos concorrentes da mesma fatura nunca passam do aberto (3 x 20000 sobre 38000)', async () => {
    const card = await newCard()
    const checking = await newChecking(1_000_000)
    const { statementId } = await seedClosedStatement(card.id, 38_000)

    const outcomes = await Promise.all(
      Array.from({ length: 3 }, () =>
        codeOf(
          svc.payStatement(ctx, {
            statementId,
            sourceAccountId: checking.id,
            amount: 20_000,
            date: day('2026-10-05'),
          }),
        ),
      ),
    )
    expect(outcomes.filter((code) => code === undefined)).toHaveLength(1)
    expect(outcomes.filter((code) => code === 'STATEMENT_OVERPAYMENT')).toHaveLength(2)

    const row = await client.creditCardStatement.findUniqueOrThrow({ where: { id: statementId } })
    expect(row.paidAmount).toBe(20_000)
    expect(
      await client.transaction.count({ where: { kind: 'CARD_PAYMENT', accountId: checking.id } }),
    ).toBe(1)
    await expectCacheMatchesLedger(card.id)
    await expectCacheMatchesLedger(checking.id)
  })

  it('dois pagamentos totais concorrentes: um passa, o outro recebe erro de fatura quitada/excedente', async () => {
    const card = await newCard()
    const checking = await newChecking(1_000_000)
    const { statementId } = await seedClosedStatement(card.id, 38_000)

    const outcomes = await Promise.all(
      [0, 1].map(() =>
        codeOf(
          svc.payStatement(ctx, {
            statementId,
            sourceAccountId: checking.id,
            amount: 38_000,
            date: day('2026-10-05'),
          }),
        ),
      ),
    )
    expect(outcomes.filter((code) => code === undefined)).toHaveLength(1)
    expect(outcomes.find((code) => code !== undefined)).toMatch(
      /STATEMENT_ALREADY_PAID|STATEMENT_OVERPAYMENT/,
    )
    const row = await client.creditCardStatement.findUniqueOrThrow({ where: { id: statementId } })
    expect([row.paidAmount, row.status]).toEqual([38_000, 'PAID'])
  })

  it('pagamentos parciais concorrentes que somam o aberto passam os dois', async () => {
    const card = await newCard()
    const checking = await newChecking(1_000_000)
    const { statementId } = await seedClosedStatement(card.id, 38_000)
    const outcomes = await Promise.all(
      [20_000, 18_000].map((amount) =>
        codeOf(
          svc.payStatement(ctx, {
            statementId,
            sourceAccountId: checking.id,
            amount,
            date: day('2026-10-05'),
          }),
        ),
      ),
    )
    expect(outcomes).toEqual([undefined, undefined])
    const row = await client.creditCardStatement.findUniqueOrThrow({ where: { id: statementId } })
    expect([row.paidAmount, row.status]).toEqual([38_000, 'PAID'])
  })

  it('compra + pagamento concorrentes na mesma fatura: sem deadlock e cache da fatura coerente', async () => {
    const card = await newCard()
    const checking = await newChecking(1_000_000)
    const { statementId } = await seedClosedStatement(card.id, 38_000)

    const results = await Promise.allSettled([
      svc.payStatement(ctx, {
        statementId,
        sourceAccountId: checking.id,
        amount: 38_000,
        date: day('2026-10-05'),
      }),
      svc.createCardPurchase(ctx, {
        accountId: card.id,
        amount: 10_000,
        date: day('2026-09-02'),
        description: 'sintetico-compra-concorrente-pagamento',
      }),
    ])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
    await expectStatementsConsistent(card.id)
    await expectCacheMatchesLedger(card.id)
    await expectCacheMatchesLedger(checking.id)
  })

  it('CA-04: estornos concorrentes do mesmo original: o que excede recebe REFUND_EXCEEDS_ORIGINAL', async () => {
    const card = await newCard()
    const { transactionId, statementId } = await seedClosedStatement(card.id, 50_000)

    const outcomes = await Promise.all(
      [30_000, 30_000].map((amount) =>
        codeOf(
          svc.refundCardTransaction(ctx, {
            originalTransactionId: transactionId,
            amount,
            date: day('2026-10-05'),
          }),
        ),
      ),
    )
    expect(outcomes.filter((code) => code === undefined)).toHaveLength(1)
    expect(outcomes.filter((code) => code === 'REFUND_EXCEEDS_ORIGINAL')).toHaveLength(1)

    // o estorno cai na fatura do ciclo da data (2026-10), a original segue intacta
    const refunds = await client.transaction.findMany({ where: { refundOfId: transactionId } })
    expect(refunds).toHaveLength(1)
    expect(refunds[0]).toMatchObject({ amount: 30_000, kind: 'INCOME', statementKey: '2026-10' })
    const original = await client.creditCardStatement.findUniqueOrThrow({
      where: { id: statementId },
    })
    expect(original.totalAmount).toBe(50_000)
    const october = await client.creditCardStatement.findFirstOrThrow({
      where: { accountId: card.id, statementKey: '2026-10' },
    })
    expect(october.totalAmount).toBe(-30_000)
    await expectCacheMatchesLedger(card.id)
  })

  it('CA-04: estorno na mesma fatura abate o total e o excedente vira creditBalance', async () => {
    const card = await newCard()
    const { transactionId, statementId } = await seedClosedStatement(card.id, 50_000)
    const refund = await svc.refundCardTransaction(ctx, {
      originalTransactionId: transactionId,
      amount: 12_000,
      date: day('2026-09-05'),
    })
    expect(refund.statement.id).toBe(statementId)
    expect([refund.statement.total, refund.statement.open]).toEqual([38_000, 38_000])
    expect(refund.refundableRemaining).toBe(38_000)

    const second = await svc.refundCardTransaction(ctx, {
      originalTransactionId: transactionId,
      amount: 38_000,
      date: day('2026-09-06'),
    })
    expect([second.statement.open, second.statement.creditBalance]).toEqual([0, 0])
    expect(
      await codeOf(
        svc.refundCardTransaction(ctx, {
          originalTransactionId: transactionId,
          amount: 1,
          date: day('2026-09-06'),
        }),
      ),
    ).toBe('REFUND_EXCEEDS_ORIGINAL')
    await expectStatementsConsistent(card.id)
  })

  it('CA-08: mover trava userLocked.statement; sync mantem; isolamento por usuario', async () => {
    const card = await newCard()
    const purchase = await svc.createCardPurchase(ctx, {
      accountId: card.id,
      amount: 20_000,
      date: day('2026-10-05'),
      description: 'sintetico-mover',
    })
    const txnId = purchase.transactions[0]!.id
    const before = await client.accountBalance.findUnique({ where: { accountId: card.id } })

    const moved = await svc.moveTransactionToStatement(ctx, {
      transactionId: txnId,
      targetStatementKey: '2026-11',
    })
    expect(moved.to.statementKey).toBe('2026-11')
    expect([moved.from?.total, moved.to.total]).toEqual([0, 20_000])

    const row = await client.transaction.findUniqueOrThrow({ where: { id: txnId } })
    expect(row.statementKey).toBe('2026-11')
    expect(row.date.toISOString().slice(0, 10)).toBe('2026-10-05')
    expect((row.userLocked as Record<string, unknown>).statement).toBe(true)
    const after = await client.accountBalance.findUnique({ where: { accountId: card.id } })
    expect(after).toMatchObject({
      balanceCleared: before!.balanceCleared,
      balancePending: before!.balancePending,
      balancePlanned: before!.balancePlanned,
    })

    // sync não devolve o lançamento ao ciclo original (userLocked.statement)
    await svc.syncCardStatuses(ctx, { accountId: card.id })
    const again = await client.transaction.findUniqueOrThrow({ where: { id: txnId } })
    expect(again.statementKey).toBe('2026-11')

    // outro usuário não vê nem move
    const code = await codeOf(
      createCardsService({
        ledger,
        repo: new PrismaCardsRepository(client),
        clock: () => new Date(now),
        uuid: () => randomUUID(),
      }).moveTransactionToStatement(
        { userId: otherUserId },
        {
          transactionId: txnId,
          targetStatementKey: '2026-10',
        },
      ),
    )
    expect(code).toBe('TRANSACTION_NOT_FOUND')
    await expectStatementsConsistent(card.id)
  })

  it('mover em sentidos opostos ao mesmo tempo (A->B e B->A) nao gera deadlock', async () => {
    const card = await newCard()
    const [a, b] = await Promise.all([
      svc.createCardPurchase(ctx, {
        accountId: card.id,
        amount: 10_000,
        date: day('2026-10-05'),
        description: 'sintetico-a',
      }),
      svc.createCardPurchase(ctx, {
        accountId: card.id,
        amount: 15_000,
        date: day('2026-11-05'),
        description: 'sintetico-b',
      }),
    ])
    const results = await Promise.allSettled([
      svc.moveTransactionToStatement(ctx, {
        transactionId: a.transactions[0]!.id,
        targetStatementKey: '2026-11',
      }),
      svc.moveTransactionToStatement(ctx, {
        transactionId: b.transactions[0]!.id,
        targetStatementKey: '2026-10',
      }),
    ])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
    const keys = await client.transaction.findMany({
      where: { accountId: card.id },
      orderBy: { amount: 'desc' },
      select: { amount: true, statementKey: true },
    })
    expect(keys).toEqual([
      { amount: -10_000, statementKey: '2026-11' },
      { amount: -15_000, statementKey: '2026-10' },
    ])
    await expectStatementsConsistent(card.id)
  })

  it('mover para fatura paga ou de outro cartao falha', async () => {
    const card = await newCard()
    const otherCard = await newCard('Outro cartão')
    const checking = await newChecking(1_000_000)
    const { statementId } = await seedClosedStatement(card.id, 38_000) // 2026-09
    await svc.payStatement(ctx, {
      statementId,
      sourceAccountId: checking.id,
      amount: 38_000,
      date: day('2026-10-05'),
    })
    const live = await svc.createCardPurchase(ctx, {
      accountId: card.id,
      amount: 5_000,
      date: day('2026-10-05'),
      description: 'sintetico-para-mover',
    })
    expect(
      await codeOf(
        svc.moveTransactionToStatement(ctx, {
          transactionId: live.transactions[0]!.id,
          targetStatementKey: '2026-09',
        }),
      ),
    ).toBe('STATEMENT_PAID')
    const otherStatement = await svc.createCardPurchase(ctx, {
      accountId: otherCard.id,
      amount: 1_000,
      date: day('2026-10-05'),
      description: 'sintetico-outro-cartao',
    })
    expect(
      await codeOf(
        svc.moveTransactionToStatement(ctx, {
          transactionId: live.transactions[0]!.id,
          targetStatementId: otherStatement.installments[0]!.statementId,
        }),
      ),
    ).toBe('STATEMENT_ACCOUNT_MISMATCH')
  })

  it('CA-09: syncCardStatuses promove por data, e idempotente e o cache bate com o ledger', async () => {
    const card = await newCard()
    await svc.createCardPurchase(ctx, {
      accountId: card.id,
      amount: 60_000,
      installmentCount: 3,
      date: day('2026-10-05'),
      description: 'sintetico-sync',
    })
    const sameDay = await svc.syncCardStatuses(ctx, { accountId: card.id })
    expect(sameDay.cards[0]).toMatchObject({ promotedToPending: 0, promotedToCleared: 0 })

    now = noonSp('2026-11-12') // 2ª parcela venceu e a fatura de outubro fechou
    try {
      const first = await svc.syncCardStatuses(ctx, { accountId: card.id })
      expect(first.cards[0]!.promotedToCleared).toBeGreaterThan(0)
      const second = await svc.syncCardStatuses(ctx, { accountId: card.id })
      expect(second.cards[0]).toMatchObject({
        linked: 0,
        promotedToPending: 0,
        promotedToCleared: 0,
        statementsUpdated: 0,
      })
      const statuses = await client.transaction.findMany({
        where: { accountId: card.id },
        orderBy: { date: 'asc' },
        select: { status: true },
      })
      expect(statuses.map((s) => s.status)).toEqual(['CLEARED', 'CLEARED', 'PLANNED'])
      await expectCacheMatchesLedger(card.id)
      await expectStatementsConsistent(card.id)
    } finally {
      now = noonSp('2026-10-05')
    }
  })

  it('CA-10: antecipacao registra desconto e move as parcelas para a fatura corrente', async () => {
    const card = await newCard()
    const purchase = await svc.createCardPurchase(ctx, {
      accountId: card.id,
      amount: 80_000,
      installmentCount: 4,
      date: day('2026-10-05'),
      description: 'sintetico-antecipar',
    })
    const result = await svc.advanceInstallments(ctx, {
      purchaseId: purchase.purchase.id,
      installmentNumbers: [3, 4],
      date: day('2026-10-06'),
      discountAmount: 2_000,
    })
    expect(result.advance).toMatchObject({
      totalOriginalAmount: 40_000,
      totalPaidAmount: 38_000,
      totalDiscountAmount: 2_000,
    })
    const october = await client.creditCardStatement.findFirstOrThrow({
      where: { accountId: card.id, statementKey: '2026-10' },
    })
    expect(october.totalAmount).toBe(20_000 + 40_000 - 2_000)
    await expectCacheMatchesLedger(card.id)
    await expectStatementsConsistent(card.id)
  })

  it('CA-11: apagar compra reverte saldo; com parcela em fatura paga nada muda', async () => {
    const card = await newCard()
    const checking = await newChecking(1_000_000)
    const purchase = await svc.createCardPurchase(ctx, {
      accountId: card.id,
      amount: 60_000,
      installmentCount: 3,
      date: day('2026-10-05'),
      description: 'sintetico-apagar',
    })
    const deleted = await svc.deleteCardPurchase(ctx, purchase.purchase.id)
    expect(deleted.deletedTransactionIds).toHaveLength(3)
    expect(await client.transaction.count({ where: { accountId: card.id } })).toBe(0)
    expect(await client.cardPurchase.count({ where: { id: purchase.purchase.id } })).toBe(0)
    expect(
      await client.cardInstallment.count({ where: { purchaseId: purchase.purchase.id } }),
    ).toBe(0)
    await expectCacheMatchesLedger(card.id)
    await expectStatementsConsistent(card.id)

    const paidCard = await newCard()
    const bought = await svc.createCardPurchase(ctx, {
      accountId: paidCard.id,
      amount: 20_000,
      installmentCount: 2,
      date: day('2026-09-01'),
      description: 'sintetico-apagar-pago',
    })
    await svc.payStatement(ctx, {
      statementId: bought.installments[0]!.statementId,
      sourceAccountId: checking.id,
      amount: 10_000,
      date: day('2026-10-05'),
    })
    expect(await codeOf(svc.deleteCardPurchase(ctx, bought.purchase.id))).toBe(
      'PURCHASE_HAS_PAID_INSTALLMENTS',
    )
    expect(
      await client.transaction.count({ where: { accountId: paidCard.id, kind: 'EXPENSE' } }),
    ).toBe(2)
    expect(await client.cardPurchase.count({ where: { id: bought.purchase.id } })).toBe(1)
  })

  it('getStatementDetail e listStatements leem do ledger com isolamento por usuario', async () => {
    // usuário próprio: a conta sugerida é a de maior disponível entre as DELE
    const soloId = `cd-solo-${randomUUID()}`
    const soloCtx = { userId: soloId }
    await client.user.create({
      data: { id: soloId, email: `${soloId}@example.invalid`, password: 'x' },
    })
    try {
      const card = await client.account.create({
        data: {
          userId: soloId,
          name: 'Cartão solo',
          type: 'CREDIT_CARD',
          creditLimit: 500_000,
          closingDay: 10,
          dueDay: 17,
        },
      })
      const small = await client.account.create({
        data: { userId: soloId, name: 'Corrente pequena', type: 'CHECKING' },
      })
      const big = await client.account.create({
        data: { userId: soloId, name: 'Corrente grande', type: 'CHECKING' },
      })
      for (const [account, amount] of [
        [small, 10_000],
        [big, 300_000],
      ] as const) {
        await ledger.createTransaction(soloCtx, {
          accountId: account.id,
          kind: 'ADJUSTMENT',
          amount,
          date: day('2026-01-01'),
          description: 'Saldo inicial',
          excludeFromBudget: true,
        })
      }
      const purchase = await svc.createCardPurchase(soloCtx, {
        accountId: card.id,
        amount: 38_000,
        date: day('2026-09-01'),
        description: 'sintetico-detalhe',
      })
      const statementId = purchase.installments[0]!.statementId

      const detail = await svc.getStatementDetail(soloCtx, statementId)
      expect(detail.totals.open).toBe(38_000)
      expect(detail.suggestedPaymentAccountId).toBe(big.id)
      expect(detail.items).toHaveLength(1)

      const list = await svc.listStatements(soloCtx, card.id)
      expect(list.map((s) => s.statementKey)).toEqual(['2026-09'])
      const summary = await svc.getCardSummary(soloCtx, card.id)
      expect(summary.used).toBe(38_000)

      expect(await codeOf(svc.getStatementDetail({ userId: otherUserId }, statementId))).toBe(
        'STATEMENT_NOT_FOUND',
      )
      expect(await codeOf(svc.listStatements({ userId: otherUserId }, card.id))).toBe(
        'CARD_NOT_FOUND',
      )
    } finally {
      await client.user.delete({ where: { id: soloId } })
    }
  })
})
