import { describe, expect, it } from 'vitest'
import {
  OTHER_USER,
  cachedBuckets,
  day,
  expectCacheMatchesLedger,
  ledgerErrorCode,
  makeLedgerEnv,
} from './test-helpers'

describe('createTransaction', () => {
  it('aplica o sinal do kind ao valor informado em módulo e atualiza o cache', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    const expense = await svc.createTransaction(ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 5000,
      date: day('2026-10-05'),
      description: 'Mercado',
    })
    const income = await svc.createTransaction(ctx, {
      accountId: 'acc-a',
      kind: 'INCOME',
      amount: 20000,
      date: day('2026-10-05'),
      description: 'Entrada',
    })
    expect(expense.transaction.amount).toBe(-5000)
    expect(income.transaction.amount).toBe(20000)
    expect(expense.transaction.status).toBe('CLEARED')
    expect(cachedBuckets(repo, 'acc-a')).toEqual({ cleared: 15000, pending: 0, planned: 0 })
    expect(repo.balances.get('acc-a')?.version).toBe(2)
    expectCacheMatchesLedger(repo)
  })

  it('FEE e INTEREST saem; ADJUSTMENT aceita sinal', async () => {
    const { svc, ctx } = makeLedgerEnv()
    const base = { accountId: 'acc-a', date: day('2026-10-05'), description: 'x' }
    expect(
      (await svc.createTransaction(ctx, { ...base, kind: 'FEE', amount: 990 })).transaction.amount,
    ).toBe(-990)
    expect(
      (await svc.createTransaction(ctx, { ...base, kind: 'INTEREST', amount: 1200 })).transaction
        .amount,
    ).toBe(-1200)
    expect(
      (await svc.createTransaction(ctx, { ...base, kind: 'ADJUSTMENT', amount: -300 })).transaction
        .amount,
    ).toBe(-300)
    expect(
      (await svc.createTransaction(ctx, { ...base, kind: 'ADJUSTMENT', amount: 300 })).transaction
        .amount,
    ).toBe(300)
  })

  it('CA-06: cheque especial usado devolve posição e aviso, sem erro', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    await svc.createTransaction(ctx, {
      accountId: 'acc-a',
      kind: 'ADJUSTMENT',
      amount: 20000,
      date: day('2026-10-01'),
      description: 'Saldo inicial',
      excludeFromBudget: true,
    })

    const first = await svc.createTransaction(ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 50000,
      date: day('2026-10-05'),
      description: 'Compra grande',
    })
    expect(first.position.current).toBe(-30000)
    expect(first.position.usage).toMatchObject({ used: 30000, excess: 0, available: 70000 })
    expect(first.warnings.map((w) => w.code)).toEqual(['OVERDRAFT_USED'])

    const second = await svc.createTransaction(ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 90000,
      date: day('2026-10-05'),
      description: 'Outra compra',
    })
    expect(second.position.usage).toMatchObject({ used: 100000, excess: 20000, available: 0 })
    expect(second.warnings.map((w) => w.code)).toContain('OVERDRAFT_LIMIT_EXCEEDED')
    // ambas gravadas: o ledger reflete o banco, não bloqueia.
    expect(repo.txnsOf('acc-a')).toHaveLength(3)
    expect(cachedBuckets(repo, 'acc-a').cleared).toBe(-120000)
  })

  it('CA-07: poupança negativa avisa NEGATIVE_BALANCE_UNEXPECTED sem erro', async () => {
    const { svc, ctx } = makeLedgerEnv()
    const result = await svc.createTransaction(ctx, {
      accountId: 'acc-sav',
      kind: 'EXPENSE',
      amount: 100,
      date: day('2026-10-05'),
      description: 'x',
    })
    expect(result.position.current).toBe(-100)
    expect(result.warnings.map((w) => w.code)).toEqual(['NEGATIVE_BALANCE_UNEXPECTED'])
  })

  it('CA-08: PLANNED só altera balancePlanned; CLEARED depois move o valor', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    const planned = await svc.createTransaction(ctx, {
      accountId: 'acc-a',
      kind: 'INCOME',
      amount: 500000,
      date: day('2026-10-20'),
      description: 'Salário previsto',
      status: 'PLANNED',
    })
    expect(cachedBuckets(repo, 'acc-a')).toEqual({ cleared: 0, pending: 0, planned: 500000 })
    expect(planned.position.current).toBe(0)
    expect(planned.position.projected).toBe(500000)

    await svc.changeTransactionStatus(ctx, planned.transaction.id, 'CLEARED')
    expect(cachedBuckets(repo, 'acc-a')).toEqual({ cleared: 500000, pending: 0, planned: 0 })
  })

  it('PENDING entra no saldo atual mas não no cleared', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    const result = await svc.createTransaction(ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 1000,
      date: day('2026-10-05'),
      description: 'x',
      status: 'PENDING',
    })
    expect(cachedBuckets(repo, 'acc-a')).toEqual({ cleared: 0, pending: -1000, planned: 0 })
    expect(result.position.current).toBe(-1000)
  })

  it('cartão: compras consomem o limite', async () => {
    const { svc, ctx } = makeLedgerEnv()
    const result = await svc.createTransaction(ctx, {
      accountId: 'acc-card',
      kind: 'EXPENSE',
      amount: 120000,
      date: day('2026-10-05'),
      description: 'Compra no cartão',
      status: 'PENDING',
    })
    expect(result.position.usage).toMatchObject({ kind: 'CREDIT', used: 120000, available: 380000 })
  })

  it('rejeita valores e sinais inválidos com códigos estáveis, sem efeitos', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    const base = { accountId: 'acc-a', date: day('2026-10-05'), description: 'x' }
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'EXPENSE', amount: 0 }),
      ),
    ).toBe('LEDGER_ZERO_AMOUNT')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'EXPENSE', amount: -100 }),
      ),
    ).toBe('LEDGER_INVALID_SIGN')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'INCOME', amount: -100 }),
      ),
    ).toBe('LEDGER_INVALID_SIGN')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'INCOME', amount: 2_000_000_001 }),
      ),
    ).toBe('LEDGER_AMOUNT_OUT_OF_RANGE')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'INCOME', amount: 10.5 }),
      ),
    ).toBe('LEDGER_AMOUNT_OUT_OF_RANGE')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'TRANSFER', amount: 100 }),
      ),
    ).toBe('LEDGER_USE_TRANSFER')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'CARD_PAYMENT', amount: 100 }),
      ),
    ).toBe('LEDGER_USE_TRANSFER')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'BOGUS' as never, amount: 100 }),
      ),
    ).toBe('LEDGER_INVALID_KIND')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'EXPENSE', amount: 100, status: 'RECONCILED' }),
      ),
    ).toBe('LEDGER_INVALID_INPUT')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'EXPENSE', amount: 100, description: '   ' }),
      ),
    ).toBe('LEDGER_INVALID_INPUT')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, {
          ...base,
          kind: 'EXPENSE',
          amount: 100,
          description: 'x'.repeat(256),
        }),
      ),
    ).toBe('LEDGER_INVALID_INPUT')
    expect(repo.txns.size).toBe(0)
    expect(repo.balances.size).toBe(0)
  })

  it('RN-07: data fora do meio-dia UTC é rejeitada', async () => {
    const { svc, ctx } = makeLedgerEnv()
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, {
          accountId: 'acc-a',
          kind: 'EXPENSE',
          amount: 100,
          date: new Date('2026-10-05T03:00:00.000Z'),
          description: 'x',
        }),
      ),
    ).toBe('LEDGER_INVALID_DATE')
  })

  it('RN-08: conta de outro usuário ou inexistente => LEDGER_ACCOUNT_NOT_FOUND', async () => {
    const { svc, ctx } = makeLedgerEnv()
    const input = {
      kind: 'EXPENSE' as const,
      amount: 100,
      date: day('2026-10-05'),
      description: 'x',
    }
    expect(
      await ledgerErrorCode(() => svc.createTransaction(ctx, { ...input, accountId: 'acc-other' })),
    ).toBe('LEDGER_ACCOUNT_NOT_FOUND')
    expect(
      await ledgerErrorCode(() => svc.createTransaction(ctx, { ...input, accountId: 'nope' })),
    ).toBe('LEDGER_ACCOUNT_NOT_FOUND')
    // o dono da conta consegue
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction({ userId: OTHER_USER }, { ...input, accountId: 'acc-other' }),
      ),
    ).toBeUndefined()
  })

  it('RN-06: conta arquivada só aceita ADJUSTMENT', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    const base = { accountId: 'acc-old', date: day('2026-10-05'), description: 'x' }
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'EXPENSE', amount: 100 }),
      ),
    ).toBe('LEDGER_ACCOUNT_ARCHIVED')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransaction(ctx, { ...base, kind: 'ADJUSTMENT', amount: 100 }),
      ),
    ).toBeUndefined()
    expect(repo.txnsOf('acc-old')).toHaveLength(1)
  })

  it('categoria/merchant de outro usuário => 404 de referência', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    repo.missingRefs.add('cat-x')
    repo.missingRefs.add('mer-x')
    const base = {
      accountId: 'acc-a',
      kind: 'EXPENSE' as const,
      amount: 100,
      date: day('2026-10-05'),
      description: 'x',
    }
    expect(
      await ledgerErrorCode(() => svc.createTransaction(ctx, { ...base, categoryId: 'cat-x' })),
    ).toBe('LEDGER_CATEGORY_NOT_FOUND')
    expect(
      await ledgerErrorCode(() => svc.createTransaction(ctx, { ...base, merchantId: 'mer-x' })),
    ).toBe('LEDGER_MERCHANT_NOT_FOUND')
    expect(
      await ledgerErrorCode(() => svc.createTransaction(ctx, { ...base, categoryId: 'cat-ok' })),
    ).toBeUndefined()
  })

  it('normaliza descrição e tags e dispara o hook pós-commit', async () => {
    const { svc, ctx, events } = makeLedgerEnv()
    const result = await svc.createTransaction(ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 100,
      date: day('2026-10-05'),
      description: '  Padaria  ',
      tags: [' pj ', 'pj', ''],
    })
    expect(result.transaction.description).toBe('Padaria')
    expect(result.transaction.tags).toEqual(['pj'])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'CREATE', userId: ctx.userId, accountIds: ['acc-a'] })
  })

  it('falha no cache desfaz o lançamento (mesma transação)', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    repo.failOn('incrementBalance')
    await expect(
      svc.createTransaction(ctx, {
        accountId: 'acc-a',
        kind: 'EXPENSE',
        amount: 100,
        date: day('2026-10-05'),
        description: 'x',
      }),
    ).rejects.toThrow('falha injetada')
    expect(repo.txns.size).toBe(0)
    expect(repo.balances.size).toBe(0)
  })

  it('erro no hook pós-commit não desfaz a mutação', async () => {
    const env = makeLedgerEnv()
    env.deps.afterLedgerMutation = () => {
      throw new Error('hook quebrado')
    }
    await expect(
      env.svc.createTransaction(env.ctx, {
        accountId: 'acc-a',
        kind: 'EXPENSE',
        amount: 100,
        date: day('2026-10-05'),
        description: 'x',
      }),
    ).resolves.toBeDefined()
    expect(env.repo.txns.size).toBe(1)
  })
})

describe('CA-11 (simulado): criações concorrentes na mesma conta', () => {
  it('20 despesas de 100 em Promise.all somam exatamente -2000', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        svc.createTransaction(ctx, {
          accountId: 'acc-a',
          kind: 'EXPENSE',
          amount: 100,
          date: day('2026-10-05'),
          description: `Despesa ${i}`,
        }),
      ),
    )
    expect(cachedBuckets(repo, 'acc-a').cleared).toBe(-2000)
    expect(repo.balances.get('acc-a')?.version).toBe(20)
    expectCacheMatchesLedger(repo)
  })
})
