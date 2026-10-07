import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { getTestDb } from '../../../../../tests/helpers/db'
import { createLedgerService, type LedgerService } from '../application/ledger-service'
import { computeBalances } from '../domain/balance'
import { PrismaLedgerRepository } from './prisma-ledger-repository'

/**
 * FC2-F1-01, ciclo de correção 1 (B1/I1/M1): lock por linha (`SELECT ... FOR UPDATE`) nas
 * mutações. O repositório sob teste conta chamadas a `$transaction`: um deadlock (40P01) seria
 * mascarado pelo retry interno, mas apareceria como chamada a mais. Só roda com
 * `DATABASE_URL_TEST` (database descartável).
 */
const db = getTestDb()
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe.skipIf(!db)('ledger: lock por linha (DATABASE_URL_TEST)', { timeout: 30_000 }, () => {
  const client = db!
  const userId = `lk-user-${randomUUID()}`
  const otherUserId = `lk-other-${randomUUID()}`
  let svc: LedgerService
  let repo: PrismaLedgerRepository
  let transactionCalls = 0

  /** Cliente que conta quantas transações o repositório abriu (retry = chamada extra). */
  function countingClient(real: PrismaClient): PrismaClient {
    return new Proxy(real, {
      get(target, prop) {
        if (prop === '$transaction') {
          return (...args: unknown[]) => {
            transactionCalls += 1
            return (target.$transaction as (...a: unknown[]) => unknown)(...args)
          }
        }
        return Reflect.get(target, prop, target)
      },
    })
  }

  async function newAccount(name: string, owner = userId) {
    return client.account.create({ data: { userId: owner, name, type: 'CHECKING' } })
  }

  async function expectCacheMatchesLedger(accountId: string) {
    const txns = await client.transaction.findMany({ where: { accountId } })
    const row = await client.accountBalance.findUnique({ where: { accountId } })
    const cache = row
      ? { cleared: row.balanceCleared, pending: row.balancePending, planned: row.balancePlanned }
      : { cleared: 0, pending: 0, planned: 0 }
    expect(cache).toEqual(computeBalances(txns))
  }

  async function seedPair(round: string) {
    const [a, b] = await Promise.all([newAccount(`Lk A ${round}`), newAccount(`Lk B ${round}`)])
    await svc.createTransaction(
      { userId },
      {
        accountId: a.id,
        kind: 'ADJUSTMENT',
        amount: 500000,
        date: day('2026-10-01'),
        description: 'saldo',
        excludeFromBudget: true,
      },
    )
    const pair = await svc.createTransfer(
      { userId },
      {
        sourceAccountId: a.id,
        destinationAccountId: b.id,
        amount: 10000,
        date: day('2026-10-05'),
        description: 'par',
      },
    )
    return { a: a.id, b: b.id, pair }
  }

  beforeAll(async () => {
    await client.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.invalid`, password: 'x' },
        { id: otherUserId, email: `${otherUserId}@example.invalid`, password: 'x' },
      ],
    })
    repo = new PrismaLedgerRepository(countingClient(client))
    svc = createLedgerService({
      repo,
      clock: () => new Date('2026-10-05T12:00:00.000Z'),
      uuid: () => randomUUID(),
    })
  })

  afterAll(async () => {
    await client.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
    await client.$disconnect()
  })

  it('edições simultâneas nas duas pernas do mesmo par: sem deadlock, sem retry, cache = ledger', async () => {
    for (let round = 0; round < 15; round++) {
      const { a, b, pair } = await seedPair(`ed${round}`)
      const before = transactionCalls
      const results = await Promise.allSettled([
        svc.updateTransaction({ userId }, pair.outgoing.id, { amount: 12000 + round }),
        svc.updateTransaction({ userId }, pair.incoming.id, { amount: 13000 + round }),
        svc.updateTransaction({ userId }, pair.outgoing.id, { description: `x${round}` }),
        svc.changeTransactionStatus({ userId }, pair.incoming.id, 'PENDING'),
        svc.updateTransaction({ userId }, pair.incoming.id, { amount: 14000 + round }),
        svc.updateTransaction({ userId }, pair.outgoing.id, { amount: 15000 + round }),
      ])
      expect(results.filter((r) => r.status === 'rejected')).toEqual([])
      // 1 transação por operação: nenhum retry (que mascararia um deadlock).
      expect(transactionCalls - before).toBe(results.length)

      const legs = await client.transaction.findMany({
        where: { transferId: pair.transferId },
      })
      expect(legs).toHaveLength(2)
      expect(legs[0]!.amount + legs[1]!.amount).toBe(0)
      await expectCacheMatchesLedger(a)
      await expectCacheMatchesLedger(b)
    }
  })

  it('PATCH, status e DELETE em pernas opostas: nada de 500/deadlock, par íntegro e cache = ledger', async () => {
    for (let round = 0; round < 15; round++) {
      const { a, b, pair } = await seedPair(`mix${round}`)
      const before = transactionCalls
      const results = await Promise.allSettled([
        svc.updateTransaction({ userId }, pair.outgoing.id, { amount: 11000 }),
        svc.deleteTransaction({ userId }, pair.incoming.id),
        svc.changeTransactionStatus({ userId }, pair.outgoing.id, 'PENDING'),
        svc.updateTransaction({ userId }, pair.incoming.id, { description: 'y' }),
      ])
      expect(transactionCalls - before).toBe(results.length)
      for (const result of results) {
        if (result.status === 'rejected') {
          // Só erros de domínio estáveis (apagado pelo concorrente): 404.
          expect((result.reason as { code?: string }).code).toBe('LEDGER_TXN_NOT_FOUND')
        }
      }
      const legs = await client.transaction.findMany({
        where: { transferId: pair.transferId },
      })
      expect([0, 2]).toContain(legs.length)
      await expectCacheMatchesLedger(a)
      await expectCacheMatchesLedger(b)
    }
  })

  it('lockTxns em ordens opostas de ids não gera deadlock e só devolve linhas do próprio usuário', async () => {
    const acc = await newAccount('Lk ordem')
    const foreign = await newAccount('Lk alheia', otherUserId)
    const [x, y, z] = await Promise.all(
      [acc, acc, foreign].map((account, i) =>
        client.transaction.create({
          data: {
            userId: account.userId,
            accountId: account.id,
            kind: 'EXPENSE',
            amount: -100 - i,
            date: day('2026-10-05'),
            description: `l${i}`,
          },
        }),
      ),
    )
    const before = transactionCalls
    const hold = () => new Promise((resolve) => setTimeout(resolve, 150))
    const [first, second] = await Promise.all([
      repo.withTransaction(async (tx) => {
        const rows = await tx.lockTxns(userId, [x.id, y.id])
        await hold()
        return rows
      }),
      repo.withTransaction(async (tx) => {
        const rows = await tx.lockTxns(userId, [y.id, x.id, z.id])
        await hold()
        return rows
      }),
    ])
    expect(transactionCalls - before).toBe(2)
    expect(first.map((r) => r.id).sort()).toEqual([x.id, y.id].sort())
    expect(second.map((r) => r.id).sort()).toEqual([x.id, y.id].sort())
    expect(second.some((r) => r.id === z.id)).toBe(false)
  })
})
