import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestDb } from '../../../../../tests/helpers/db'
import { createLedgerService, type LedgerService } from '../application/ledger-service'
import { computeBalances } from '../domain/balance'
import { PrismaLedgerRepository } from './prisma-ledger-repository'

/**
 * Integração com Postgres real (CA-10, CA-11, unicidade de perna, CHECK). Só roda com
 * `DATABASE_URL_TEST` apontando para um database descartável (nome contendo "test" ou "branch")
 * com as migrations aplicadas; sem a variável o bloco inteiro é `skip` (ver tests/README.md).
 */
const db = getTestDb()
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe.skipIf(!db)('ledger com Postgres (DATABASE_URL_TEST)', () => {
  const client = db!
  const userId = `it-user-${randomUUID()}`
  const otherUserId = `it-other-${randomUUID()}`
  let svc: LedgerService
  let repo: PrismaLedgerRepository
  const accounts = { a: '', b: '', sav: '', otherAcc: '' }

  async function snapshot(accountId: string) {
    const txns = await client.transaction.findMany({ where: { accountId } })
    const row = await client.accountBalance.findUnique({ where: { accountId } })
    return { computed: computeBalances(txns), row }
  }

  beforeAll(async () => {
    await client.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.invalid`, password: 'x' },
        { id: otherUserId, email: `${otherUserId}@example.invalid`, password: 'x' },
      ],
    })
    const a = await client.account.create({
      data: { userId, name: 'Conta A', type: 'CHECKING', overdraftLimit: 100000 },
    })
    const b = await client.account.create({
      data: { userId, name: 'Conta B', type: 'CHECKING' },
    })
    const sav = await client.account.create({ data: { userId, name: 'Poupança', type: 'SAVINGS' } })
    const other = await client.account.create({
      data: { userId: otherUserId, name: 'Conta alheia', type: 'CHECKING' },
    })
    Object.assign(accounts, { a: a.id, b: b.id, sav: sav.id, otherAcc: other.id })

    repo = new PrismaLedgerRepository(client)
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

  it('CA-11: 20 despesas concorrentes de 100 somam exatamente -2000 (sem perda por corrida)', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        svc.createTransaction(
          { userId },
          {
            accountId: accounts.sav,
            kind: 'EXPENSE',
            amount: 100,
            date: day('2026-10-05'),
            description: `Despesa concorrente ${i}`,
          },
        ),
      ),
    )
    const { computed, row } = await snapshot(accounts.sav)
    expect(computed.cleared).toBe(-2000)
    expect(row?.balanceCleared).toBe(-2000)
    expect(row?.version).toBe(20)
  })

  it('CA-02: transferência grava 2 pernas ligadas e move os saldos; origem no cheque especial avisa', async () => {
    const result = await svc.createTransfer(
      { userId },
      {
        sourceAccountId: accounts.a,
        destinationAccountId: accounts.b,
        amount: 10000,
        date: day('2026-10-05'),
        description: 'Entre contas',
      },
    )
    expect(result.outgoing.amount).toBe(-10000)
    expect(result.incoming.amount).toBe(10000)
    expect(result.outgoing.transferId).toBe(result.incoming.transferId)
    expect(result.positions[0].usage).toMatchObject({ used: 10000, excess: 0 })
    expect(result.warnings.map((w) => w.code)).toEqual(['OVERDRAFT_USED'])
    for (const id of [accounts.a, accounts.b]) {
      const { computed, row } = await snapshot(id)
      expect({
        cleared: row?.balanceCleared,
        pending: row?.balancePending,
        planned: row?.balancePlanned,
      }).toEqual(computed)
    }
  })

  it('transferências opostas concorrentes não geram deadlock nem perda', async () => {
    const before = [await snapshot(accounts.a), await snapshot(accounts.b)]
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        svc.createTransfer(
          { userId },
          {
            sourceAccountId: i % 2 ? accounts.a : accounts.b,
            destinationAccountId: i % 2 ? accounts.b : accounts.a,
            amount: 500,
            date: day('2026-10-06'),
            description: `Cruzada ${i}`,
          },
        ),
      ),
    )
    const after = [await snapshot(accounts.a), await snapshot(accounts.b)]
    for (let i = 0; i < 2; i++) {
      expect(after[i].row?.balanceCleared).toBe(after[i].computed.cleared)
      // 5 em cada sentido: saldo líquido inalterado.
      expect(after[i].computed.cleared).toBe(before[i].computed.cleared)
    }
  })

  it('atomicidade: perna inválida na mesma transação desfaz a perna e o saldo já aplicados', async () => {
    const before = await snapshot(accounts.a)
    const transferId = randomUUID()
    await expect(
      repo.withTransaction(async (tx) => {
        const base = {
          userId,
          categoryId: null,
          merchantId: null,
          kind: 'TRANSFER' as const,
          status: 'CLEARED' as const,
          review: 'REVIEWED' as const,
          source: 'MANUAL' as const,
          date: day('2026-10-07'),
          postedDate: null,
          description: 'Par inválido',
          rawDescription: null,
          notes: null,
          tags: [],
          transferId,
          excludeFromBudget: true,
          userLocked: {},
        }
        await tx.insertTxns([{ ...base, accountId: accounts.a, amount: -700 }])
        await tx.incrementBalance(userId, accounts.a, { cleared: -700, pending: 0, planned: 0 })
        // segunda perna na MESMA conta: viola @@unique([transferId, accountId])
        await tx.insertTxns([{ ...base, accountId: accounts.a, amount: 700 }])
      }),
    ).rejects.toThrow()
    const after = await snapshot(accounts.a)
    expect(after.row?.balanceCleared).toBe(before.row?.balanceCleared)
    expect(after.computed).toEqual(before.computed)
    expect(await client.transaction.count({ where: { transferId } })).toBe(0)
  })

  it('CHECK: amount = 0 é rejeitado pelo banco (segunda barreira)', async () => {
    await expect(
      client.transaction.create({
        data: {
          userId,
          accountId: accounts.a,
          kind: 'ADJUSTMENT',
          amount: 0,
          date: day('2026-10-05'),
          description: 'zero',
        },
      }),
    ).rejects.toThrow()
  })

  it('CHECK: TRANSFER sem transferId é rejeitado pelo banco', async () => {
    await expect(
      client.transaction.create({
        data: {
          userId,
          accountId: accounts.a,
          kind: 'TRANSFER',
          amount: -100,
          date: day('2026-10-05'),
          description: 'sem par',
        },
      }),
    ).rejects.toThrow()
  })

  it('CA-10: rebuildAccountBalance corrige um cache corrompido e é idempotente', async () => {
    await client.accountBalance.update({
      where: { accountId: accounts.a },
      data: { balanceCleared: 1, balancePending: 2, balancePlanned: 3 },
    })
    const first = await svc.rebuildAccountBalance({ userId }, accounts.a)
    expect(first.drifted).toBe(true)
    const { computed, row } = await snapshot(accounts.a)
    expect({
      cleared: row?.balanceCleared,
      pending: row?.balancePending,
      planned: row?.balancePlanned,
    }).toEqual(computed)
    expect(first.after).toEqual(computed)

    const second = await svc.rebuildAccountBalance({ userId }, accounts.a)
    expect(second.drifted).toBe(false)
    expect(second.after).toEqual(first.after)
  })

  it('RN-08: lançamento e conta de outro usuário não são visíveis; edição/remoção => 404', async () => {
    const mine = await svc.createTransaction(
      { userId },
      {
        accountId: accounts.b,
        kind: 'INCOME',
        amount: 1000,
        date: day('2026-10-05'),
        description: 'Meu',
      },
    )
    expect(await repo.findTxn(otherUserId, mine.transaction.id)).toBeNull()
    await expect(
      svc.deleteTransaction({ userId: otherUserId }, mine.transaction.id),
    ).rejects.toMatchObject({ code: 'LEDGER_TXN_NOT_FOUND' })
    await expect(
      svc.createTransaction(
        { userId },
        {
          accountId: accounts.otherAcc,
          kind: 'EXPENSE',
          amount: 1,
          date: day('2026-10-05'),
          description: 'x',
        },
      ),
    ).rejects.toMatchObject({ code: 'LEDGER_ACCOUNT_NOT_FOUND' })
  })

  it('CA-04/CA-05: editar valor da perna propaga; apagar remove o par e reverte os saldos', async () => {
    const { incoming, outgoing } = await svc.createTransfer(
      { userId },
      {
        sourceAccountId: accounts.a,
        destinationAccountId: accounts.sav,
        amount: 2000,
        date: day('2026-10-08'),
        description: 'Para poupança',
      },
    )
    await svc.updateTransaction({ userId }, incoming.id, { amount: 3000 })
    expect((await client.transaction.findUnique({ where: { id: outgoing.id } }))?.amount).toBe(
      -3000,
    )

    const before = [await snapshot(accounts.a), await snapshot(accounts.sav)]
    await svc.deleteTransaction({ userId }, outgoing.id)
    expect(
      await client.transaction.count({ where: { id: { in: [incoming.id, outgoing.id] } } }),
    ).toBe(0)
    const after = [await snapshot(accounts.a), await snapshot(accounts.sav)]
    expect(after[0].row?.balanceCleared).toBe(after[0].computed.cleared)
    expect(after[1].row?.balanceCleared).toBe(after[1].computed.cleared)
    expect(after[0].computed.cleared).toBe(before[0].computed.cleared + 3000)
    expect(after[1].computed.cleared).toBe(before[1].computed.cleared - 3000)
  })

  it('listagem: ordem data desc, cursor e busca sem diferenciar maiúsculas', async () => {
    await svc.createTransaction(
      { userId },
      {
        accountId: accounts.b,
        kind: 'EXPENSE',
        amount: 100,
        date: day('2026-11-01'),
        description: 'Padaria Central',
      },
    )
    const search = await svc.listTransactions({ userId }, { q: 'padaria', limit: 5 })
    expect(search.items).toHaveLength(1)

    const page1 = await svc.listTransactions({ userId }, { limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).not.toBeNull()
    const page2 = await svc.listTransactions({ userId }, { limit: 2, cursor: page1.nextCursor! })
    expect(page2.items[0].id).not.toBe(page1.items[0].id)
    const dates = [...page1.items, ...page2.items].map((t) => t.date.getTime())
    expect(dates).toEqual([...dates].sort((x, y) => y - x))
  })
})

describe.runIf(!db)('ledger com Postgres (DATABASE_URL_TEST)', () => {
  it.skip('pulado: defina DATABASE_URL_TEST (database descartável com "test" no nome e migrations aplicadas)', () => {})
})
