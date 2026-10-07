import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestDb } from '../../../../../tests/helpers/db'
import { computeBalances } from '../domain/balance'
import { createLedgerService, isLedgerError, type LedgerService } from '../index'
import { PrismaLedgerRepository } from './prisma-ledger-repository'

/**
 * Revisão QA da FC2-F1-09 (Postgres real, só com `DATABASE_URL_TEST`): comportamentos que um
 * módulo consumidor encontra na unit of work e que o implementador não cobriu.
 */
const db = getTestDb()
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe.skipIf(!db)('ledger: QA F1-09 (DATABASE_URL_TEST)', { timeout: 40_000 }, () => {
  const client = db!
  const userId = `uowqa-${randomUUID()}`
  const ctx = { userId }
  let svc: LedgerService

  async function newAccount(type: 'CHECKING' | 'CREDIT_CARD' = 'CHECKING') {
    return client.account.create({
      data: {
        userId,
        name: `QA ${randomUUID().slice(0, 8)}`,
        type,
        ...(type === 'CREDIT_CARD' ? { creditLimit: 500000, closingDay: 10, dueDay: 17 } : {}),
      },
    })
  }

  async function expectCacheMatchesLedger(accountId: string) {
    const txns = await client.transaction.findMany({ where: { accountId } })
    const row = await client.accountBalance.findUnique({ where: { accountId } })
    const cache = row
      ? { cleared: row.balanceCleared, pending: row.balancePending, planned: row.balancePlanned }
      : { cleared: 0, pending: 0, planned: 0 }
    expect(cache).toEqual(computeBalances(txns))
  }

  beforeAll(async () => {
    await client.user.create({
      data: { id: userId, email: `${userId}@example.invalid`, password: 'x' },
    })
    svc = createLedgerService({
      repo: new PrismaLedgerRepository(client),
      clock: () => new Date('2026-10-05T12:00:00.000Z'),
      uuid: () => randomUUID(),
    })
  })

  afterAll(async () => {
    await client.user.deleteMany({ where: { id: userId } })
    await client.$disconnect()
  })

  it('cartao: compra, tarifa, estorno (refundOfId) e pagamento mantem o cache coerente', async () => {
    const card = await newAccount('CREDIT_CARD')
    const checking = await newAccount()
    const statement = await client.creditCardStatement.create({
      data: {
        userId,
        accountId: card.id,
        periodStart: day('2026-10-11'),
        periodEnd: day('2026-11-10'),
        closingDate: day('2026-11-10'),
        dueDate: day('2026-11-17'),
        statementKey: '2026-11',
      },
    })
    await svc.runInTransaction(ctx, async (uow) => {
      const purchase = await uow.createTransaction({
        accountId: card.id,
        kind: 'EXPENSE',
        amount: 50000,
        date: day('2026-10-12'),
        description: 'Compra',
        statementId: statement.id,
        statementKey: '2026-11',
      })
      await uow.createTransaction({
        accountId: card.id,
        kind: 'FEE',
        amount: 900,
        date: day('2026-10-12'),
        description: 'Anuidade',
        statementId: statement.id,
        statementKey: '2026-11',
      })
      await uow.createTransaction({
        accountId: card.id,
        kind: 'INCOME',
        amount: 12000,
        date: day('2026-10-13'),
        description: 'Estorno',
        refundOfId: purchase.transaction.id,
        statementId: statement.id,
        statementKey: '2026-11',
      })
      const refunds = await uow.listTransactions({ refundOfId: purchase.transaction.id })
      expect(refunds.items.map((t) => t.amount)).toEqual([12000])
      const items = await uow.listTransactions({ statementId: statement.id })
      expect(items.items.map((t) => t.amount).sort((a, b) => a - b)).toEqual([-50000, -900, 12000])
    })
    const position = await svc.getAccountPosition(ctx, card.id)
    expect(position.balanceCleared + position.balancePending + position.balancePlanned).toBe(-38900)
    await svc.runInTransaction(ctx, (uow) =>
      uow.createTransfer({
        kind: 'CARD_PAYMENT',
        sourceAccountId: checking.id,
        destinationAccountId: card.id,
        amount: 38900,
        date: day('2026-11-17'),
        description: 'Pagamento',
        incoming: { statementId: statement.id, statementKey: '2026-11' },
      }),
    )
    await expectCacheMatchesLedger(card.id)
    await expectCacheMatchesLedger(checking.id)
    const legs = await client.transaction.findMany({ where: { statementId: statement.id } })
    expect(legs.filter((t) => t.kind === 'CARD_PAYMENT')).toHaveLength(1)
  })

  it('chave duplicada: o erro que sai de runInTransaction e LEDGER_DUPLICATE_KEY', async () => {
    const acc = await newAccount()
    const occurrenceKey = `qa-dup-${acc.id}`
    await svc.createTransaction(ctx, {
      accountId: acc.id,
      kind: 'INCOME',
      amount: 100,
      date: day('2026-10-05'),
      description: 'a',
      occurrenceKey,
    })
    let outer: unknown
    try {
      await svc.runInTransaction(ctx, async (uow) => {
        await uow.createTransaction({
          accountId: acc.id,
          kind: 'INCOME',
          amount: 100,
          date: day('2026-10-05'),
          description: 'b',
          occurrenceKey,
        })
      })
    } catch (error) {
      outer = error
    }
    expect(isLedgerError(outer) && outer.code).toBe('LEDGER_DUPLICATE_KEY')
  })

  it('ordem de locks: balance -> advisory (uow) contra advisory -> balance (upsert) preserva invariantes', async () => {
    const acc = await newAccount()
    const key = `qa-order-${acc.id}`
    const run = async (i: number) => {
      if (i % 2 === 0) {
        return svc.runInTransaction(ctx, async (uow) => {
          await uow.createTransaction({
            accountId: acc.id,
            kind: 'EXPENSE',
            amount: 100,
            date: day('2026-10-05'),
            description: 'x',
          })
          await uow.upsertPlannedByOccurrenceKey({
            accountId: acc.id,
            kind: 'EXPENSE',
            amount: 200 + i,
            date: day('2026-11-05'),
            description: 'prev',
            occurrenceKey: key,
          })
        })
      }
      return svc.upsertPlannedByOccurrenceKey(ctx, {
        accountId: acc.id,
        kind: 'EXPENSE',
        amount: 300 + i,
        date: day('2026-11-05'),
        description: 'prev',
        occurrenceKey: key,
      })
    }
    // Achado QA: sob contencao este padrao pode devolver LEDGER_CONCURRENT_UPDATE (409) apos o retry;
    // o invariante abaixo (1 linha, cache coerente) vale sempre.
    await Promise.allSettled(Array.from({ length: 12 }, (_, i) => run(i)))
    expect(await client.transaction.count({ where: { userId, occurrenceKey: key } })).toBe(1)
    await expectCacheMatchesLedger(acc.id)
  })
})
