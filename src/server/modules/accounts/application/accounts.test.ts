import { describe, expect, it } from 'vitest'

import { expectCacheMatchesLedger } from '@/server/modules/ledger/testing'

import { OPENING_DESCRIPTION } from '../domain/rules'
import type { AccountFields } from '../domain/types'
import { OTHER_USER, USER, day, errorCode, makeAccountsEnv, type AccountsEnv } from './test-helpers'

const checking = { name: 'Conta Exemplo', type: 'CHECKING' as const, overdraftLimit: 100000 }
const card = {
  name: 'Cartão Exemplo',
  type: 'CREDIT_CARD' as const,
  creditLimit: 500000,
  closingDay: 10,
  dueDay: 17,
}

async function seed(env: AccountsEnv, input: AccountFields = checking, openingBalance?: number) {
  const { account } = await env.svc.createAccount(USER, { ...input, openingBalance })
  return account
}

describe('createAccount (RN-01, CA-01)', () => {
  it('cria conta, AccountBalance e UM ADJUSTMENT de saldo inicial; o uso do limite vem do ledger', async () => {
    const env = makeAccountsEnv()
    const { account, warnings } = await env.svc.createAccount(USER, {
      ...checking,
      openingBalance: -20000,
      openingDate: day('2026-10-01'),
    })

    expect(account.balance).toEqual({
      cleared: -20000,
      pending: 0,
      planned: 0,
      current: -20000,
      projected: -20000,
    })
    expect(account.usage).toEqual({
      kind: 'OVERDRAFT',
      limit: 100000,
      used: 20000,
      available: 80000,
      excess: 0,
    })
    expect(warnings).toEqual(['OVERDRAFT_USED'])
    expect(env.repo.balances.get(account.id)?.balanceCleared).toBe(-20000)

    const txns = env.repo.txnsOf(account.id)
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({
      kind: 'ADJUSTMENT',
      amount: -20000,
      status: 'CLEARED',
      description: OPENING_DESCRIPTION,
      excludeFromBudget: true,
      source: 'MANUAL',
      review: 'REVIEWED',
    })
    expect(txns[0]!.date.toISOString()).toBe('2026-10-01T12:00:00.000Z')
    expectCacheMatchesLedger(env.repo)

    const { accounts } = await env.svc.listAccounts(USER)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]!.usage).toEqual(account.usage)
  })

  it('saldo inicial zero ou omitido: conta e linha de saldo zerada, sem lançamento', async () => {
    const env = makeAccountsEnv()
    const a = await seed(env, checking)
    const b = await seed(env, { ...checking, name: 'Outra Conta' }, 0)
    for (const account of [a, b]) {
      expect(env.repo.txnsOf(account.id)).toEqual([])
      expect(env.repo.balances.get(account.id)).toMatchObject({ balanceCleared: 0 })
    }
  })

  it('data do saldo inicial: hoje (São Paulo) ao meio-dia UTC quando omitida', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking, 5000)
    expect(env.repo.txnsOf(account.id)[0]!.date.toISOString()).toBe('2026-10-05T12:00:00.000Z')
  })

  it('cartão: dívida inicial negativa vira ADJUSTMENT e consome o limite', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, card, -150000)
    expect(account.usage).toEqual({
      kind: 'CREDIT',
      limit: 500000,
      used: 150000,
      available: 350000,
      excess: 0,
    })
    expect(env.repo.txnsOf(account.id)[0]).toMatchObject({ kind: 'ADJUSTMENT', amount: -150000 })
  })

  it('cartão com saldo inicial positivo é recusado', async () => {
    const env = makeAccountsEnv()
    expect(await errorCode(() => seed(env, card, 5000))).toBe('ACCOUNT_INVALID')
  })

  it('CA-02: regras por tipo viram ACCOUNT_INVALID com mensagens por campo', async () => {
    const env = makeAccountsEnv()
    const error = await env.svc
      .createAccount(USER, { name: 'Cartão Exemplo', type: 'CREDIT_CARD', dueDay: 32 })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'ACCOUNT_INVALID' })
    expect(Object.keys((error as { fields: object }).fields).sort()).toEqual([
      'closingDay',
      'creditLimit',
      'dueDay',
    ])
    expect(
      await errorCode(() => env.svc.createAccount(USER, { ...checking, creditLimit: 100000 })),
    ).toBe('ACCOUNT_INVALID')
    expect(env.accounts.rows.size).toBe(0)
  })

  it('CA-03: emissor precisa existir no registry', async () => {
    const env = makeAccountsEnv()
    expect(
      await errorCode(() => env.svc.createAccount(USER, { ...checking, issuerKey: 'inexistente' })),
    ).toBe('ACCOUNT_INVALID')
    const { account } = await env.svc.createAccount(USER, { ...checking, issuerKey: 'nubank' })
    expect(account.issuerKey).toBe('nubank')
  })

  it('CA-04: nome duplicado sem diferenciar caixa nem espaços', async () => {
    const env = makeAccountsEnv()
    await seed(env, checking)
    expect(
      await errorCode(() => env.svc.createAccount(USER, { ...checking, name: 'conta exemplo ' })),
    ).toBe('ACCOUNT_NAME_TAKEN')
    expect(env.accounts.rows.size).toBe(1)
    // outro usuário pode usar o mesmo nome
    const other = await env.svc.createAccount(OTHER_USER, checking)
    expect(other.account.name).toBe('Conta Exemplo')
  })

  it('nome de conta arquivada continua reservado', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking)
    await env.svc.archiveAccount(USER, account.id)
    expect(await errorCode(() => env.svc.createAccount(USER, checking))).toBe('ACCOUNT_NAME_TAKEN')
  })

  it('o nome é gravado normalizado', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, { ...checking, name: '  Conta   Exemplo  ' })
    expect(account.name).toBe('Conta Exemplo')
  })

  it.each(['ensureBalance', 'insertTxn', 'incrementBalance'] as const)(
    'atomicidade: falha em %s desfaz a conta, o saldo e o lançamento',
    async (op) => {
      const env = makeAccountsEnv()
      env.repo.failOn(op)
      await expect(
        env.svc.createAccount(USER, { ...checking, openingBalance: 5000 }),
      ).rejects.toThrow('falha injetada')
      expect(env.accounts.rows.size).toBe(0)
      expect(env.repo.accounts.size).toBe(0)
      expect(env.repo.balances.size).toBe(0)
      expect(env.repo.txns.size).toBe(0)
    },
  )

  it('atribui sortOrder crescente', async () => {
    const env = makeAccountsEnv()
    const a = await seed(env, { ...checking, name: 'A' })
    const b = await seed(env, { ...checking, name: 'B' })
    expect([a.sortOrder, b.sortOrder]).toEqual([0, 1])
  })
})

describe('updateAccount (CA-07)', () => {
  it('renomeia e ajusta limites, ícone, cor e emissor', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking, -20000)
    const { account: updated } = await env.svc.updateAccount(USER, account.id, {
      name: 'Conta Principal',
      overdraftLimit: 15000,
      icon: 'wallet',
      colorKey: 'cat-3',
      issuerKey: 'inter',
    })
    expect(updated).toMatchObject({
      name: 'Conta Principal',
      overdraftLimit: 15000,
      icon: 'wallet',
      colorKey: 'cat-3',
      issuerKey: 'inter',
    })
    // o uso do limite acompanha o novo limite (vem do ledger)
    expect(updated.usage).toMatchObject({ limit: 15000, used: 15000, excess: 5000 })
  })

  it('renomear para o nome de outra conta (qualquer caixa) dá ACCOUNT_NAME_TAKEN; o próprio nome é livre', async () => {
    const env = makeAccountsEnv()
    const a = await seed(env, { ...checking, name: 'Conta A' })
    await seed(env, { ...checking, name: 'Conta B' })
    expect(await errorCode(() => env.svc.updateAccount(USER, a.id, { name: 'CONTA b' }))).toBe(
      'ACCOUNT_NAME_TAKEN',
    )
    const { account } = await env.svc.updateAccount(USER, a.id, { name: 'conta a' })
    expect(account.name).toBe('conta a')
  })

  it('trocar o tipo com lançamentos além do saldo inicial: ACCOUNT_TYPE_LOCKED', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking, 10000)
    await env.ledgerSvc.createTransaction(env.ctx, {
      accountId: account.id,
      kind: 'EXPENSE',
      amount: 2500,
      date: day('2026-10-03'),
      description: 'Mercado Exemplo',
    })
    expect(
      await errorCode(() => env.svc.updateAccount(USER, account.id, { type: 'SAVINGS' })),
    ).toBe('ACCOUNT_TYPE_LOCKED')
    expect((await env.svc.getAccount(USER, account.id)).type).toBe('CHECKING')
  })

  it('com só o saldo inicial o tipo muda e os campos inaplicáveis são zerados', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking, 10000)
    const { account: updated } = await env.svc.updateAccount(USER, account.id, { type: 'SAVINGS' })
    expect(updated).toMatchObject({ type: 'SAVINGS', overdraftLimit: 0 })
    expect(updated.usage.kind).toBe('NONE')
  })

  it('trocar para cartão exige os campos de cartão', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking)
    expect(
      await errorCode(() => env.svc.updateAccount(USER, account.id, { type: 'CREDIT_CARD' })),
    ).toBe('ACCOUNT_INVALID')
    const { account: updated } = await env.svc.updateAccount(USER, account.id, {
      type: 'CREDIT_CARD',
      creditLimit: 300000,
      closingDay: 5,
      dueDay: 12,
    })
    expect(updated).toMatchObject({ type: 'CREDIT_CARD', overdraftLimit: 0, creditLimit: 300000 })
  })

  it('mudar fechamento/vencimento de cartão avisa que vale para faturas futuras', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, card)
    const { account: updated, warnings } = await env.svc.updateAccount(USER, account.id, {
      closingDay: 12,
    })
    expect(updated.closingDay).toBe(12)
    expect(warnings).toEqual(['STATEMENT_DAYS_CHANGED'])
    const same = await env.svc.updateAccount(USER, account.id, { creditLimit: 600000 })
    expect(same.warnings).toEqual([])
  })

  it('campo de cartão em conta corrente é inválido', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking)
    expect(
      await errorCode(() => env.svc.updateAccount(USER, account.id, { creditLimit: 100000 })),
    ).toBe('ACCOUNT_INVALID')
  })

  it('patch sem mudança é aceito e devolve a conta', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking)
    const { account: same } = await env.svc.updateAccount(USER, account.id, { name: account.name })
    expect(same.id).toBe(account.id)
  })
})

describe('arquivar e desarquivar (RN-04, CA-05)', () => {
  it('arquivar com saldo avisa; a conta some da lista padrão e aparece com includeArchived', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking, 12345)
    const result = await env.svc.archiveAccount(USER, account.id)
    expect(result.warnings).toEqual(['ARCHIVED_WITH_BALANCE'])
    expect(result.account.isArchived).toBe(true)

    expect((await env.svc.listAccounts(USER)).accounts).toEqual([])
    const all = await env.svc.listAccounts(USER, { includeArchived: true })
    expect(all.accounts.map((a) => a.id)).toEqual([account.id])
  })

  it('arquivar com saldo zero não avisa e é idempotente', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking)
    expect((await env.svc.archiveAccount(USER, account.id)).warnings).toEqual([])
    expect((await env.svc.archiveAccount(USER, account.id)).account.isArchived).toBe(true)
  })

  it('o ledger recusa lançamento comum em conta arquivada, mas aceita ADJUSTMENT', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking, 1000)
    await env.svc.archiveAccount(USER, account.id)
    expect(
      await errorCode(() =>
        env.ledgerSvc.createTransaction(env.ctx, {
          accountId: account.id,
          kind: 'EXPENSE',
          amount: 100,
          date: day('2026-10-03'),
          description: 'Mercado Exemplo',
        }),
      ),
    ).toBe('LEDGER_ACCOUNT_ARCHIVED')
    await env.ledgerSvc.createTransaction(env.ctx, {
      accountId: account.id,
      kind: 'ADJUSTMENT',
      amount: -1000,
      date: day('2026-10-03'),
      description: 'Ajuste de conciliação',
    })
    expect((await env.svc.getAccount(USER, account.id)).balance.current).toBe(0)
  })

  it('desarquivar devolve a conta à lista e o ledger volta a aceitar lançamentos', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking)
    await env.svc.archiveAccount(USER, account.id)
    const { account: reopened } = await env.svc.unarchiveAccount(USER, account.id)
    expect(reopened.isArchived).toBe(false)
    expect((await env.svc.listAccounts(USER)).accounts).toHaveLength(1)
    await env.ledgerSvc.createTransaction(env.ctx, {
      accountId: account.id,
      kind: 'INCOME',
      amount: 100,
      date: day('2026-10-03'),
      description: 'Recebimento Exemplo',
    })
    expect((await env.svc.unarchiveAccount(USER, account.id)).account.isArchived).toBe(false)
  })
})

describe('deleteAccount (CA-06)', () => {
  it('conta recém-criada com saldo inicial: remove conta, saldo e ADJUSTMENT', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking, 5000)
    await env.svc.deleteAccount(USER, account.id)
    expect(env.accounts.rows.size).toBe(0)
    expect(env.repo.accounts.size).toBe(0)
    expect(env.repo.balances.size).toBe(0)
    expect(env.repo.txns.size).toBe(0)
  })

  it('conta recém-criada sem saldo inicial também pode ser excluída', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking)
    await env.svc.deleteAccount(USER, account.id)
    expect(env.accounts.rows.size).toBe(0)
    expect(env.repo.balances.size).toBe(0)
  })

  it('com lançamento além do saldo inicial: ACCOUNT_HAS_TRANSACTIONS e nada muda', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking, 5000)
    await env.ledgerSvc.createTransaction(env.ctx, {
      accountId: account.id,
      kind: 'EXPENSE',
      amount: 1000,
      date: day('2026-10-03'),
      description: 'Mercado Exemplo',
    })
    expect(await errorCode(() => env.svc.deleteAccount(USER, account.id))).toBe(
      'ACCOUNT_HAS_TRANSACTIONS',
    )
    expect(env.accounts.rows.size).toBe(1)
    expect(env.repo.txns.size).toBe(2)
    expectCacheMatchesLedger(env.repo)
  })

  it('só um ajuste que não é o saldo inicial também impede a exclusão', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking)
    await env.ledgerSvc.createTransaction(env.ctx, {
      accountId: account.id,
      kind: 'ADJUSTMENT',
      amount: 700,
      date: day('2026-10-03'),
      description: 'Ajuste de conciliação',
    })
    expect(await errorCode(() => env.svc.deleteAccount(USER, account.id))).toBe(
      'ACCOUNT_HAS_TRANSACTIONS',
    )
  })

  it('falha ao apagar a conta desfaz a exclusão do ADJUSTMENT (atomicidade)', async () => {
    const env = makeAccountsEnv()
    const account = await seed(env, checking, 5000)
    env.repo.failOn('deleteTxns')
    await expect(env.svc.deleteAccount(USER, account.id)).rejects.toThrow('falha injetada')
    expect(env.accounts.rows.size).toBe(1)
    expect(env.repo.txns.size).toBe(1)
    expectCacheMatchesLedger(env.repo)
  })
})

describe('listAccounts / getAccount (CA-08, CA-09)', () => {
  it('ordena por sortOrder e depois nome; a transferência move o saldo sem mudar totals.cash', async () => {
    const env = makeAccountsEnv()
    const a = await seed(env, { ...checking, name: 'Conta A' }, 50000)
    const b = await seed(env, { ...checking, name: 'Conta B' }, 0)
    const before = await env.svc.listAccounts(USER)
    expect(before.accounts.map((x) => x.name)).toEqual(['Conta A', 'Conta B'])

    await env.ledgerSvc.createTransfer(env.ctx, {
      sourceAccountId: a.id,
      destinationAccountId: b.id,
      amount: 10000,
      date: day('2026-10-04'),
      description: 'Transferência Exemplo',
    })
    const after = await env.svc.listAccounts(USER)
    expect(after.accounts.map((x) => x.balance.current)).toEqual([40000, 10000])
    expect(after.totals.cash).toBe(before.totals.cash)
    expect(after.totals.cash).toBe(50000)
  })

  it('devolve saldo por balde (pendente e previsto) e totais por tipo', async () => {
    const env = makeAccountsEnv()
    const a = await seed(env, checking, 100000)
    const biz = await seed(env, { name: 'Conta PJ Exemplo', type: 'BUSINESS' }, 30000)
    const inv = await seed(env, { name: 'Renda Fixa Exemplo', type: 'INVESTMENT' }, 200000)
    await seed(env, card, -45000)
    await env.ledgerSvc.createTransaction(env.ctx, {
      accountId: a.id,
      kind: 'EXPENSE',
      amount: 4000,
      date: day('2026-10-04'),
      description: 'Mercado Exemplo',
      status: 'PENDING',
    })
    await env.ledgerSvc.createTransaction(env.ctx, {
      accountId: a.id,
      kind: 'INCOME',
      amount: 90000,
      date: day('2026-10-20'),
      description: 'Renda Exemplo',
      status: 'PLANNED',
    })

    const { accounts, totals } = await env.svc.listAccounts(USER)
    const first = accounts.find((x) => x.id === a.id)!
    expect(first.balance).toEqual({
      cleared: 100000,
      pending: -4000,
      planned: 90000,
      current: 96000,
      projected: 186000,
    })
    expect(totals).toEqual({ cash: 96000 + 30000, investments: 200000, cardDebt: 45000 })
    expect((await env.svc.listAccounts(USER, { excludeBusiness: true })).totals.cash).toBe(96000)
    expect(accounts.find((x) => x.id === biz.id)?.type).toBe('BUSINESS')
    expect(accounts.find((x) => x.id === inv.id)?.usage.kind).toBe('NONE')
  })

  it('RN-08: só enxerga contas do próprio usuário; id de outro usuário é 404', async () => {
    const env = makeAccountsEnv()
    const mine = await seed(env, checking, 5000)
    const theirs = (await env.svc.createAccount(OTHER_USER, { ...checking, name: 'Conta Alheia' }))
      .account

    expect((await env.svc.listAccounts(USER)).accounts.map((x) => x.id)).toEqual([mine.id])
    for (const run of [
      () => env.svc.getAccount(USER, theirs.id),
      () => env.svc.updateAccount(USER, theirs.id, { name: 'Invadida' }),
      () => env.svc.archiveAccount(USER, theirs.id),
      () => env.svc.unarchiveAccount(USER, theirs.id),
      () => env.svc.deleteAccount(USER, theirs.id),
    ]) {
      expect(await errorCode(run)).toBe('ACCOUNT_NOT_FOUND')
    }
    expect(env.accounts.rows.has(theirs.id)).toBe(true)
  })
})

describe('reorderAccounts', () => {
  it('aplica a ordem dada; as demais seguem depois', async () => {
    const env = makeAccountsEnv()
    const a = await seed(env, { ...checking, name: 'A' })
    const b = await seed(env, { ...checking, name: 'B' })
    const c = await seed(env, { ...checking, name: 'C' })
    await env.svc.reorderAccounts(USER, [c.id, a.id])
    expect((await env.svc.listAccounts(USER)).accounts.map((x) => x.id)).toEqual([c.id, a.id, b.id])
  })

  it('id repetido é inválido; id de outro usuário é 404', async () => {
    const env = makeAccountsEnv()
    const a = await seed(env, checking)
    const theirs = (await env.svc.createAccount(OTHER_USER, { ...checking, name: 'Alheia' }))
      .account
    expect(await errorCode(() => env.svc.reorderAccounts(USER, [a.id, a.id]))).toBe(
      'ACCOUNT_INVALID',
    )
    expect(await errorCode(() => env.svc.reorderAccounts(USER, [a.id, theirs.id]))).toBe(
      'ACCOUNT_NOT_FOUND',
    )
  })
})
