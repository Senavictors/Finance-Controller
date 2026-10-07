import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestDb } from '../../../../../tests/helpers/db'
import { createLedgerService, type LedgerService } from '../application/ledger-service'
import { computeBalances } from '../domain/balance'
import { PrismaLedgerRepository } from './prisma-ledger-repository'

/**
 * Revisão QA da FC2-F1-01: corridas que o teste do implementador não cobre (primeira criação
 * da linha de cache sob carga, múltiplas contas, e mutações concorrentes sobre o MESMO
 * lançamento: duplo clique/retry). Só roda com `DATABASE_URL_TEST` (database descartável).
 */
const db = getTestDb()
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe.skipIf(!db)('QA ledger: concorrência (DATABASE_URL_TEST)', () => {
  const client = db!
  const userId = `qa-user-${randomUUID()}`
  let svc: LedgerService

  async function newAccount(name: string, extra: { overdraftLimit?: number } = {}) {
    return client.account.create({ data: { userId, name, type: 'CHECKING', ...extra } })
  }

  async function snapshot(accountId: string) {
    const txns = await client.transaction.findMany({ where: { accountId } })
    const row = await client.accountBalance.findUnique({ where: { accountId } })
    return {
      computed: computeBalances(txns),
      cache: row
        ? { cleared: row.balanceCleared, pending: row.balancePending, planned: row.balancePlanned }
        : { cleared: 0, pending: 0, planned: 0 },
    }
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

  it('primeira criação da linha de cache: 30 contas novas x 8 despesas concorrentes, repetido', async () => {
    for (let round = 0; round < 3; round++) {
      const accounts = await Promise.all(
        Array.from({ length: 10 }, (_, i) => newAccount(`Corrida ${round}-${i}`)),
      )
      await Promise.all(
        accounts.flatMap((acc) =>
          Array.from({ length: 8 }, (_, i) =>
            svc.createTransaction(
              { userId },
              {
                accountId: acc.id,
                kind: i % 2 ? 'EXPENSE' : 'INCOME',
                amount: 100 + i,
                date: day('2026-10-05'),
                description: `c${i}`,
              },
            ),
          ),
        ),
      )
      for (const acc of accounts) {
        const { computed, cache } = await snapshot(acc.id)
        expect(cache).toEqual(computed)
      }
    }
  })

  it('3 contas, transferências cruzadas em todos os sentidos + despesas, sem deadlock nem deriva', async () => {
    const [a, b, c] = await Promise.all([newAccount('X1'), newAccount('X2'), newAccount('X3')])
    const ids = [a.id, b.id, c.id]
    const ops = Array.from({ length: 36 }, (_, i) => {
      const s = ids[i % 3]
      const d = ids[(i + 1 + (i % 2)) % 3]
      return svc.createTransfer(
        { userId },
        {
          sourceAccountId: s,
          destinationAccountId: d,
          amount: 100 + i,
          date: day('2026-10-06'),
          description: `t${i}`,
        },
      )
    })
    await Promise.all(ops)
    for (const id of ids) {
      const { computed, cache } = await snapshot(id)
      expect(cache).toEqual(computed)
    }
    const total = (await Promise.all(ids.map(snapshot))).reduce((s, x) => s + x.computed.cleared, 0)
    expect(total).toBe(0)
  })

  it('duplo clique: dois DELETE simultâneos do mesmo lançamento não deslocam o cache', async () => {
    const acc = await newAccount('Del')
    await svc.createTransaction(
      { userId },
      {
        accountId: acc.id,
        kind: 'INCOME',
        amount: 5000,
        date: day('2026-10-05'),
        description: 'base',
      },
    )
    const t = await svc.createTransaction(
      { userId },
      {
        accountId: acc.id,
        kind: 'EXPENSE',
        amount: 1000,
        date: day('2026-10-05'),
        description: 'alvo',
      },
    )
    await Promise.allSettled([
      svc.deleteTransaction({ userId }, t.transaction.id),
      svc.deleteTransaction({ userId }, t.transaction.id),
    ])
    const { computed, cache } = await snapshot(acc.id)
    expect(computed.cleared).toBe(5000)
    expect(cache).toEqual(computed)
  })

  it('duplo clique: duas mudanças de status simultâneas PENDING -> CLEARED não duplicam o delta', async () => {
    const acc = await newAccount('St')
    const t = await svc.createTransaction(
      { userId },
      {
        accountId: acc.id,
        kind: 'INCOME',
        amount: 7000,
        status: 'PENDING',
        date: day('2026-10-05'),
        description: 'pend',
      },
    )
    await Promise.allSettled([
      svc.changeTransactionStatus({ userId }, t.transaction.id, 'CLEARED'),
      svc.changeTransactionStatus({ userId }, t.transaction.id, 'CLEARED'),
    ])
    const { computed, cache } = await snapshot(acc.id)
    expect(computed).toEqual({ cleared: 7000, pending: 0, planned: 0 })
    expect(cache).toEqual(computed)
  })

  it('edições simultâneas de valor do mesmo lançamento mantêm cache == ledger', async () => {
    const acc = await newAccount('Ed')
    const t = await svc.createTransaction(
      { userId },
      {
        accountId: acc.id,
        kind: 'EXPENSE',
        amount: 1000,
        date: day('2026-10-05'),
        description: 'edit',
      },
    )
    await Promise.allSettled([
      svc.updateTransaction({ userId }, t.transaction.id, { amount: 2000 }),
      svc.updateTransaction({ userId }, t.transaction.id, { amount: 3000 }),
      svc.updateTransaction({ userId }, t.transaction.id, { amount: 4000 }),
    ])
    const { computed, cache } = await snapshot(acc.id)
    expect(cache).toEqual(computed)
  })

  it('edição de valor e DELETE simultâneos do mesmo lançamento mantêm cache == ledger', async () => {
    const acc = await newAccount('EdDel')
    const t = await svc.createTransaction(
      { userId },
      {
        accountId: acc.id,
        kind: 'EXPENSE',
        amount: 1000,
        date: day('2026-10-05'),
        description: 'edit-del',
      },
    )
    await Promise.allSettled([
      svc.updateTransaction({ userId }, t.transaction.id, { amount: 2000 }),
      svc.deleteTransaction({ userId }, t.transaction.id),
    ])
    const { computed, cache } = await snapshot(acc.id)
    expect(cache).toEqual(computed)
  })

  it('rebuild concorrente com despesas não perde escritas', async () => {
    const acc = await newAccount('Reb')
    await Promise.all([
      ...Array.from({ length: 10 }, (_, i) =>
        svc.createTransaction(
          { userId },
          {
            accountId: acc.id,
            kind: 'EXPENSE',
            amount: 100,
            date: day('2026-10-05'),
            description: `r${i}`,
          },
        ),
      ),
      svc.rebuildAccountBalance({ userId }, acc.id),
      svc.rebuildAccountBalance({ userId }, acc.id),
    ])
    const { computed, cache } = await snapshot(acc.id)
    expect(computed.cleared).toBe(-1000)
    expect(cache).toEqual(computed)
  })
})
