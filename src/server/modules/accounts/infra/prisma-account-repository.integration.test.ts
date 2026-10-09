import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { LedgerService } from '@/server/modules/ledger'

import { getTestDb } from '../../../../../tests/helpers/db'
import { createAccountsService, type AccountsService } from '../application/accounts-service'
import type { AccountsLedger } from '../application/ports'
import { createPrismaAccountRepository } from './prisma-account-repository'

/**
 * FC2-F1-02: contas no Postgres real (repositório Prisma + ledger real na mesma transação).
 * Só roda com `DATABASE_URL_TEST` (database descartável, validado por `getTestDb`). O ledger
 * real vem de `@/server/modules/ledger/service`, que usa `@/server/db`; por isso `DATABASE_URL`
 * aponta para o mesmo banco de teste antes do import dinâmico.
 */
const db = getTestDb()
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

async function codeOf(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn()
    return undefined
  } catch (error) {
    return (error as { code?: string }).code ?? 'UNKNOWN'
  }
}

describe.skipIf(!db)('accounts: Postgres real (DATABASE_URL_TEST)', { timeout: 30_000 }, () => {
  const client = db!
  const userId = `acc-user-${randomUUID()}`
  const otherUserId = `acc-other-${randomUUID()}`
  let svc: AccountsService
  let ledger: LedgerService
  let failOpening = false

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
    const { getLedgerService } = await import('@/server/modules/ledger/service')
    const real = getLedgerService()
    ledger = real
    // Ledger que falha ao gravar o ADJUSTMENT (simula erro no meio da unit of work).
    const flaky: AccountsLedger = {
      ...real,
      runInTransaction: (ctx, fn) =>
        real.runInTransaction(ctx, (uow) =>
          fn(
            new Proxy(uow, {
              get(target, prop, receiver) {
                if (prop === 'createTransaction' && failOpening) {
                  return async () => {
                    throw new Error('falha simulada ao gravar o saldo inicial')
                  }
                }
                return Reflect.get(target, prop, receiver)
              },
            }),
          ),
        ),
    }
    svc = createAccountsService({
      accounts: createPrismaAccountRepository(client),
      ledger: flaky,
      clock: () => new Date('2026-10-05T12:00:00.000Z'),
      newId: () => randomUUID(),
    })
    await client.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.invalid`, password: 'x' },
        { id: otherUserId, email: `${otherUserId}@example.invalid`, password: 'x' },
      ],
    })
  })

  afterAll(async () => {
    await client.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
    await client.$disconnect()
  })

  const checking = (name: string) => ({
    name,
    type: 'CHECKING' as const,
    overdraftLimit: 100000,
  })

  it('CA-01: cria conta, AccountBalance e UM ADJUSTMENT; uso do limite vem do ledger', async () => {
    const { account } = await svc.createAccount(userId, {
      ...checking('Conta Exemplo'),
      openingBalance: -20000,
      openingDate: day('2026-10-01'),
    })
    expect(account.usage).toEqual({
      kind: 'OVERDRAFT',
      limit: 100000,
      used: 20000,
      available: 80000,
      excess: 0,
    })
    const balance = await client.accountBalance.findUnique({ where: { accountId: account.id } })
    expect(balance).toMatchObject({ balanceCleared: -20000, balancePending: 0, balancePlanned: 0 })
    const txns = await client.transaction.findMany({ where: { accountId: account.id } })
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({
      kind: 'ADJUSTMENT',
      amount: -20000,
      status: 'CLEARED',
      excludeFromBudget: true,
      source: 'MANUAL',
      review: 'REVIEWED',
    })
    expect(txns[0]!.date.toISOString()).toBe('2026-10-01T12:00:00.000Z')

    const { accounts } = await svc.listAccounts(userId)
    expect(accounts.find((a) => a.id === account.id)?.usage).toEqual(account.usage)
  })

  it('saldo inicial zero: conta e linha de saldo zerada, sem lançamento', async () => {
    const { account } = await svc.createAccount(userId, checking('Conta Zerada Exemplo'))
    expect(await client.transaction.count({ where: { accountId: account.id } })).toBe(0)
    expect(
      await client.accountBalance.findUnique({ where: { accountId: account.id } }),
    ).toMatchObject({ balanceCleared: 0 })
  })

  it('atomicidade: falha ao gravar o ADJUSTMENT desfaz conta e saldo', async () => {
    failOpening = true
    try {
      await expect(
        svc.createAccount(userId, { ...checking('Conta Falha Exemplo'), openingBalance: 5000 }),
      ).rejects.toThrow('falha simulada')
    } finally {
      failOpening = false
    }
    expect(await client.account.count({ where: { userId, name: 'Conta Falha Exemplo' } })).toBe(0)
    const { accounts } = await svc.listAccounts(userId, { includeArchived: true })
    expect(accounts.some((a) => a.name === 'Conta Falha Exemplo')).toBe(false)
    // Mesmo nome depois da falha: nada ficou reservado.
    const retry = await svc.createAccount(userId, {
      ...checking('Conta Falha Exemplo'),
      openingBalance: 5000,
    })
    expect(retry.account.balance.current).toBe(5000)
  })

  it('CA-04: nome duplicado sem diferenciar caixa nem espaços -> ACCOUNT_NAME_TAKEN', async () => {
    await svc.createAccount(userId, checking('Conta Dup Exemplo'))
    expect(await codeOf(() => svc.createAccount(userId, checking('conta dup exemplo ')))).toBe(
      'ACCOUNT_NAME_TAKEN',
    )
    // outro usuário pode usar o mesmo nome
    await expect(
      svc.createAccount(otherUserId, checking('Conta Dup Exemplo')),
    ).resolves.toBeDefined()
  })

  it('CA-05: arquivar com saldo avisa; some da lista; ledger recusa lançamento comum', async () => {
    const { account } = await svc.createAccount(userId, {
      ...checking('Conta Arquivo Exemplo'),
      openingBalance: 7000,
    })
    const archived = await svc.archiveAccount(userId, account.id)
    expect(archived.warnings).toEqual(['ARCHIVED_WITH_BALANCE'])
    expect((await svc.listAccounts(userId)).accounts.some((a) => a.id === account.id)).toBe(false)
    expect(
      (await svc.listAccounts(userId, { includeArchived: true })).accounts.some(
        (a) => a.id === account.id,
      ),
    ).toBe(true)
    expect(
      await codeOf(() =>
        ledger.createTransaction(
          { userId },
          {
            accountId: account.id,
            kind: 'EXPENSE',
            amount: 1000,
            date: day('2026-10-05'),
            description: 'Compra Exemplo',
          },
        ),
      ),
    ).toBe('LEDGER_ACCOUNT_ARCHIVED')
    await svc.unarchiveAccount(userId, account.id)
    expect((await svc.listAccounts(userId)).accounts.some((a) => a.id === account.id)).toBe(true)
  })

  it('CA-06: excluir recém-criada remove conta, saldo e ADJUSTMENT; com lançamento -> 409', async () => {
    const fresh = (
      await svc.createAccount(userId, { ...checking('Conta Fresca Exemplo'), openingBalance: 1000 })
    ).account
    await svc.deleteAccount(userId, fresh.id)
    expect(await client.account.count({ where: { id: fresh.id } })).toBe(0)
    expect(await client.accountBalance.count({ where: { accountId: fresh.id } })).toBe(0)
    expect(await client.transaction.count({ where: { accountId: fresh.id } })).toBe(0)

    const used = (
      await svc.createAccount(userId, { ...checking('Conta Usada Exemplo'), openingBalance: 1000 })
    ).account
    await ledger.createTransaction(
      { userId },
      {
        accountId: used.id,
        kind: 'EXPENSE',
        amount: 300,
        date: day('2026-10-05'),
        description: 'Compra Exemplo',
      },
    )
    expect(await codeOf(() => svc.deleteAccount(userId, used.id))).toBe('ACCOUNT_HAS_TRANSACTIONS')
    expect(await client.account.count({ where: { id: used.id } })).toBe(1)
    expect(await client.transaction.count({ where: { accountId: used.id } })).toBe(2)
    expect((await svc.getAccount(userId, used.id)).balance.current).toBe(700)
  })

  it('CA-07: trocar o tipo de conta com lançamentos -> ACCOUNT_TYPE_LOCKED', async () => {
    const { account } = await svc.createAccount(userId, {
      ...checking('Conta Tipo Exemplo'),
      openingBalance: 1000,
    })
    // só com o saldo inicial o tipo ainda pode mudar
    await expect(
      svc.updateAccount(userId, account.id, { type: 'SAVINGS', overdraftLimit: 0 }),
    ).resolves.toBeDefined()
    await ledger.createTransaction(
      { userId },
      {
        accountId: account.id,
        kind: 'EXPENSE',
        amount: 100,
        date: day('2026-10-05'),
        description: 'Compra Exemplo',
      },
    )
    expect(await codeOf(() => svc.updateAccount(userId, account.id, { type: 'WALLET' }))).toBe(
      'ACCOUNT_TYPE_LOCKED',
    )
  })

  it('CA-08: transferência move saldo entre contas e deixa totals.cash inalterado', async () => {
    const a = (
      await svc.createAccount(userId, { ...checking('Origem Exemplo'), openingBalance: 50000 })
    ).account
    const b = (await svc.createAccount(userId, { ...checking('Destino Exemplo') })).account
    const before = (await svc.listAccounts(userId)).totals.cash
    await ledger.createTransfer(
      { userId },
      {
        kind: 'TRANSFER',
        sourceAccountId: a.id,
        destinationAccountId: b.id,
        amount: 10000,
        date: day('2026-10-05'),
        description: 'Transferência Exemplo',
      },
    )
    const after = await svc.listAccounts(userId)
    expect(after.accounts.find((x) => x.id === a.id)?.balance.current).toBe(40000)
    expect(after.accounts.find((x) => x.id === b.id)?.balance.current).toBe(10000)
    expect(after.totals.cash).toBe(before)
  })

  it('CA-09: conta de outro usuário -> ACCOUNT_NOT_FOUND', async () => {
    const theirs = (await svc.createAccount(otherUserId, checking('Conta Alheia Exemplo'))).account
    expect(await codeOf(() => svc.getAccount(userId, theirs.id))).toBe('ACCOUNT_NOT_FOUND')
    expect(await codeOf(() => svc.updateAccount(userId, theirs.id, { name: 'Invadida' }))).toBe(
      'ACCOUNT_NOT_FOUND',
    )
    expect(await codeOf(() => svc.archiveAccount(userId, theirs.id))).toBe('ACCOUNT_NOT_FOUND')
    expect(await codeOf(() => svc.deleteAccount(userId, theirs.id))).toBe('ACCOUNT_NOT_FOUND')
    expect(await client.account.count({ where: { id: theirs.id } })).toBe(1)
  })

  it('reorder grava a ordem e listAccounts a respeita', async () => {
    const { accounts } = await svc.listAccounts(userId)
    const reversed = accounts.map((a) => a.id).reverse()
    await svc.reorderAccounts(userId, reversed)
    expect((await svc.listAccounts(userId)).accounts.map((a) => a.id)).toEqual(reversed)
  })
})
