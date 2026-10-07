import { describe, expect, it } from 'vitest'
import {
  cachedBuckets,
  day,
  expectCacheMatchesLedger,
  ledgerErrorCode,
  makeLedgerEnv,
  type LedgerEnv,
} from './test-helpers'

const TRANSFER = {
  sourceAccountId: 'acc-a',
  destinationAccountId: 'acc-b',
  amount: 10000,
  date: day('2026-10-05'),
  description: 'Transferência',
}

async function fundA(env: LedgerEnv, amount = 100000) {
  await env.svc.createTransaction(env.ctx, {
    accountId: 'acc-a',
    kind: 'ADJUSTMENT',
    amount,
    date: day('2026-10-01'),
    description: 'Saldo inicial',
    excludeFromBudget: true,
  })
}

describe('createTransfer', () => {
  it('CA-02: R$ 100,00 de A para B grava 2 lançamentos ligados e move os saldos', async () => {
    const env = makeLedgerEnv()
    await fundA(env)
    const result = await env.svc.createTransfer(env.ctx, TRANSFER)

    expect(result.transferId).toBe('00000000-0000-4000-8000-000000000001')
    expect(result.outgoing).toMatchObject({
      accountId: 'acc-a',
      amount: -10000,
      transferId: result.transferId,
    })
    expect(result.incoming).toMatchObject({
      accountId: 'acc-b',
      amount: 10000,
      transferId: result.transferId,
    })
    expect(result.outgoing.kind).toBe('TRANSFER')
    expect(result.outgoing.excludeFromBudget).toBe(true)
    expect(env.repo.txns.size).toBe(3)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(90000)
    expect(cachedBuckets(env.repo, 'acc-b').cleared).toBe(10000)
    expect(result.positions.map((p) => p.accountId)).toEqual(['acc-a', 'acc-b'])
    expectCacheMatchesLedger(env.repo)
  })

  it('CA-02: falha na escrita da segunda perna não grava nada e não muda saldos', async () => {
    const env = makeLedgerEnv()
    await fundA(env)
    env.repo.failOn('insertTxn', 2)
    await expect(env.svc.createTransfer(env.ctx, TRANSFER)).rejects.toThrow('falha injetada')
    expect(env.repo.txns.size).toBe(1)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(100000)
    expect(cachedBuckets(env.repo, 'acc-b')).toEqual({ cleared: 0, pending: 0, planned: 0 })
    expectCacheMatchesLedger(env.repo)
  })

  it('CA-02: falha no saldo do destino desfaz as pernas e o saldo da origem', async () => {
    const env = makeLedgerEnv()
    await fundA(env)
    env.repo.failOn('incrementBalance', 2)
    await expect(env.svc.createTransfer(env.ctx, TRANSFER)).rejects.toThrow('falha injetada')
    expect(env.repo.txns.size).toBe(1)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(100000)
    expectCacheMatchesLedger(env.repo)
  })

  it('CA-03: origem = destino, valor <= 0, outro usuário e conta arquivada falham sem efeitos', async () => {
    const env = makeLedgerEnv()
    const { svc, ctx, repo } = env
    expect(
      await ledgerErrorCode(() =>
        svc.createTransfer(ctx, { ...TRANSFER, destinationAccountId: 'acc-a' }),
      ),
    ).toBe('LEDGER_SAME_ACCOUNT')
    expect(await ledgerErrorCode(() => svc.createTransfer(ctx, { ...TRANSFER, amount: 0 }))).toBe(
      'LEDGER_ZERO_AMOUNT',
    )
    expect(
      await ledgerErrorCode(() => svc.createTransfer(ctx, { ...TRANSFER, amount: -100 })),
    ).toBe('LEDGER_INVALID_SIGN')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransfer(ctx, { ...TRANSFER, destinationAccountId: 'acc-other' }),
      ),
    ).toBe('LEDGER_ACCOUNT_NOT_FOUND')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransfer(ctx, { ...TRANSFER, sourceAccountId: 'acc-other' }),
      ),
    ).toBe('LEDGER_ACCOUNT_NOT_FOUND')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransfer(ctx, { ...TRANSFER, destinationAccountId: 'acc-old' }),
      ),
    ).toBe('LEDGER_ACCOUNT_ARCHIVED')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransfer(ctx, { ...TRANSFER, sourceAccountId: 'acc-old' }),
      ),
    ).toBe('LEDGER_ACCOUNT_ARCHIVED')
    expect(
      await ledgerErrorCode(() => svc.createTransfer(ctx, { ...TRANSFER, status: 'RECONCILED' })),
    ).toBe('LEDGER_INVALID_INPUT')
    expect(
      await ledgerErrorCode(() =>
        svc.createTransfer(ctx, { ...TRANSFER, date: new Date('2026-10-05T00:00:00Z') }),
      ),
    ).toBe('LEDGER_INVALID_DATE')
    expect(repo.txns.size).toBe(0)
    expect(repo.balances.size).toBe(0)
  })

  it('cartão não pode ser origem de TRANSFER, mas CARD_PAYMENT é um par válido', async () => {
    const { svc, ctx, repo } = makeLedgerEnv()
    expect(
      await ledgerErrorCode(() =>
        svc.createTransfer(ctx, { ...TRANSFER, sourceAccountId: 'acc-card' }),
      ),
    ).toBe('LEDGER_CARD_TRANSFER_SOURCE')
    expect(repo.txns.size).toBe(0)

    const payment = await svc.createTransfer(ctx, {
      ...TRANSFER,
      kind: 'CARD_PAYMENT',
      destinationAccountId: 'acc-card',
    })
    expect(payment.outgoing.kind).toBe('CARD_PAYMENT')
    expect(payment.incoming.accountId).toBe('acc-card')
    expect(payment.incoming.excludeFromBudget).toBe(true)
  })

  it('INVESTMENT/WALLET podem ser origem; PLANNED vai só para balancePlanned das duas contas', async () => {
    const env = makeLedgerEnv()
    env.repo.addAccount({ id: 'acc-inv', userId: 'user-1', type: 'INVESTMENT' })
    const result = await env.svc.createTransfer(env.ctx, {
      ...TRANSFER,
      sourceAccountId: 'acc-inv',
      status: 'PLANNED',
    })
    expect(result.outgoing.status).toBe('PLANNED')
    expect(result.incoming.status).toBe('PLANNED')
    expect(cachedBuckets(env.repo, 'acc-inv')).toEqual({ cleared: 0, pending: 0, planned: -10000 })
    expect(cachedBuckets(env.repo, 'acc-b')).toEqual({ cleared: 0, pending: 0, planned: 10000 })
  })

  it('a origem pode entrar no cheque especial e a posição avisa', async () => {
    const env = makeLedgerEnv()
    const result = await env.svc.createTransfer(env.ctx, { ...TRANSFER, amount: 30000 })
    expect(result.positions[0].usage).toMatchObject({ used: 30000, available: 70000 })
    expect(result.warnings.map((w) => w.code)).toEqual(['OVERDRAFT_USED'])
  })
})

describe('updateTransaction em perna de transferência', () => {
  it('CA-04: editar o valor para R$ 150,00 altera as duas pernas e os dois saldos', async () => {
    const env = makeLedgerEnv()
    await fundA(env)
    const { outgoing, incoming } = await env.svc.createTransfer(env.ctx, TRANSFER)

    const result = await env.svc.updateTransaction(env.ctx, incoming.id, { amount: 15000 })
    expect(result.transaction.amount).toBe(15000)
    expect(result.counterpart?.amount).toBe(-15000)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(85000)
    expect(cachedBuckets(env.repo, 'acc-b').cleared).toBe(15000)
    expect(env.repo.txns.get(outgoing.id)?.amount).toBe(-15000)
    expectCacheMatchesLedger(env.repo)
  })

  it('propaga data, descrição e status; travas de usuário nas duas pernas', async () => {
    const env = makeLedgerEnv()
    const { outgoing, incoming } = await env.svc.createTransfer(env.ctx, TRANSFER)
    await env.svc.updateTransaction(env.ctx, outgoing.id, {
      date: day('2026-10-07'),
      description: 'Novo texto',
      status: 'PENDING',
    })
    for (const id of [outgoing.id, incoming.id]) {
      const leg = env.repo.txns.get(id)!
      expect(leg.date).toEqual(day('2026-10-07'))
      expect(leg.description).toBe('Novo texto')
      expect(leg.status).toBe('PENDING')
      expect(leg.userLocked).toMatchObject({ date: true, description: true })
    }
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: 0, pending: -10000, planned: 0 })
    expect(cachedBuckets(env.repo, 'acc-b')).toEqual({ cleared: 0, pending: 10000, planned: 0 })
    expectCacheMatchesLedger(env.repo)
  })

  it('CA-04: editar accountId de uma perna => LEDGER_TRANSFER_ACCOUNT_IMMUTABLE', async () => {
    const env = makeLedgerEnv()
    const { outgoing } = await env.svc.createTransfer(env.ctx, TRANSFER)
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, outgoing.id, { accountId: 'acc-sav' }),
      ),
    ).toBe('LEDGER_TRANSFER_ACCOUNT_IMMUTABLE')
    // mesma conta é no-op, não erro
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, outgoing.id, { accountId: 'acc-a', notes: 'ok' }),
      ),
    ).toBeUndefined()
  })

  it('kind imutável, fora de orçamento obrigatório e valor em módulo', async () => {
    const env = makeLedgerEnv()
    const { outgoing } = await env.svc.createTransfer(env.ctx, TRANSFER)
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, outgoing.id, { kind: 'EXPENSE' }),
      ),
    ).toBe('LEDGER_TRANSFER_KIND_IMMUTABLE')
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, outgoing.id, { excludeFromBudget: false }),
      ),
    ).toBe('LEDGER_INVALID_INPUT')
    expect(
      await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, outgoing.id, { amount: -5 })),
    ).toBe('LEDGER_INVALID_SIGN')
    expect(
      await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, outgoing.id, { amount: 0 })),
    ).toBe('LEDGER_ZERO_AMOUNT')
    expect(env.repo.txns.get(outgoing.id)?.amount).toBe(-10000)
  })

  it('falha no meio da edição desfaz as duas pernas e os saldos', async () => {
    const env = makeLedgerEnv()
    const { outgoing, incoming } = await env.svc.createTransfer(env.ctx, TRANSFER)
    env.repo.failOn('updateTxn', 2)
    await expect(
      env.svc.updateTransaction(env.ctx, outgoing.id, { amount: 99000 }),
    ).rejects.toThrow('falha injetada')
    expect(env.repo.txns.get(outgoing.id)?.amount).toBe(-10000)
    expect(env.repo.txns.get(incoming.id)?.amount).toBe(10000)
    expectCacheMatchesLedger(env.repo)
  })

  it('par quebrado (perna perdida) é detectado', async () => {
    const env = makeLedgerEnv()
    const { outgoing, incoming } = await env.svc.createTransfer(env.ctx, TRANSFER)
    env.repo.txns.delete(incoming.id)
    expect(
      await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, outgoing.id, { notes: 'x' })),
    ).toBe('LEDGER_TRANSFER_PAIR_BROKEN')
  })
})

describe('deleteTransaction', () => {
  it('CA-05: apagar uma perna remove as duas e reverte os saldos', async () => {
    const env = makeLedgerEnv()
    await fundA(env)
    const { incoming, outgoing } = await env.svc.createTransfer(env.ctx, TRANSFER)
    const result = await env.svc.deleteTransaction(env.ctx, incoming.id)
    expect(result.deletedIds.sort()).toEqual([incoming.id, outgoing.id].sort())
    expect(env.repo.txns.size).toBe(1)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(100000)
    expect(cachedBuckets(env.repo, 'acc-b').cleared).toBe(0)
    expectCacheMatchesLedger(env.repo)
  })

  it('apaga lançamento simples e reverte o balde do status', async () => {
    const env = makeLedgerEnv()
    const created = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 700,
      date: day('2026-10-05'),
      description: 'x',
      status: 'PENDING',
    })
    await env.svc.deleteTransaction(env.ctx, created.transaction.id)
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: 0, pending: 0, planned: 0 })
  })

  it('RECONCILED não pode ser apagado (nem pelo par)', async () => {
    const env = makeLedgerEnv()
    const { outgoing, incoming } = await env.svc.createTransfer(env.ctx, TRANSFER)
    await env.svc.changeTransactionStatus(env.ctx, outgoing.id, 'RECONCILED')
    expect(await ledgerErrorCode(() => env.svc.deleteTransaction(env.ctx, outgoing.id))).toBe(
      'LEDGER_RECONCILED_LOCKED',
    )
    expect(await ledgerErrorCode(() => env.svc.deleteTransaction(env.ctx, incoming.id))).toBe(
      'LEDGER_RECONCILED_LOCKED',
    )
    expect(env.repo.txns.size).toBe(2)
  })

  it('RN-08: id de outro usuário ou inexistente => LEDGER_TXN_NOT_FOUND', async () => {
    const env = makeLedgerEnv()
    const created = await env.svc.createTransaction(
      { userId: 'user-2' },
      {
        accountId: 'acc-other',
        kind: 'EXPENSE',
        amount: 100,
        date: day('2026-10-05'),
        description: 'x',
      },
    )
    expect(
      await ledgerErrorCode(() => env.svc.deleteTransaction(env.ctx, created.transaction.id)),
    ).toBe('LEDGER_TXN_NOT_FOUND')
    expect(await ledgerErrorCode(() => env.svc.deleteTransaction(env.ctx, 'nope'))).toBe(
      'LEDGER_TXN_NOT_FOUND',
    )
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, created.transaction.id, { notes: 'x' }),
      ),
    ).toBe('LEDGER_TXN_NOT_FOUND')
    expect(
      await ledgerErrorCode(() =>
        env.svc.changeTransactionStatus(env.ctx, created.transaction.id, 'PENDING'),
      ),
    ).toBe('LEDGER_TXN_NOT_FOUND')
  })
})

describe('changeTransactionStatus', () => {
  it('muda as duas pernas juntas e move os baldes', async () => {
    const env = makeLedgerEnv()
    const { outgoing, incoming } = await env.svc.createTransfer(env.ctx, {
      ...TRANSFER,
      status: 'PENDING',
    })
    const result = await env.svc.changeTransactionStatus(env.ctx, outgoing.id, 'CLEARED')
    expect(result.transaction.status).toBe('CLEARED')
    expect(result.counterpart?.status).toBe('CLEARED')
    expect(env.repo.txns.get(incoming.id)?.status).toBe('CLEARED')
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: -10000, pending: 0, planned: 0 })
    expect(cachedBuckets(env.repo, 'acc-b')).toEqual({ cleared: 10000, pending: 0, planned: 0 })
  })

  it('conciliar afeta só a perna informada (conciliação é por conta)', async () => {
    const env = makeLedgerEnv()
    const { outgoing, incoming } = await env.svc.createTransfer(env.ctx, TRANSFER)
    await env.svc.changeTransactionStatus(env.ctx, outgoing.id, 'RECONCILED')
    expect(env.repo.txns.get(outgoing.id)?.status).toBe('RECONCILED')
    expect(env.repo.txns.get(incoming.id)?.status).toBe('CLEARED')
    // RECONCILED conta como cleared: saldo não muda
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(-10000)
    // mudar o status da outra perna esbarra na perna conciliada
    expect(
      await ledgerErrorCode(() => env.svc.changeTransactionStatus(env.ctx, incoming.id, 'PENDING')),
    ).toBe('LEDGER_RECONCILED_LOCKED')
    expectCacheMatchesLedger(env.repo)
  })

  it('CA-09: RECONCILED -> CLEARED e qualquer outro => LEDGER_RECONCILED_LOCKED', async () => {
    const env = makeLedgerEnv()
    const created = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 100,
      date: day('2026-10-05'),
      description: 'x',
    })
    await env.svc.changeTransactionStatus(env.ctx, created.transaction.id, 'RECONCILED')
    for (const to of ['CLEARED', 'PENDING', 'PLANNED', 'RECONCILED'] as const) {
      expect(
        await ledgerErrorCode(() =>
          env.svc.changeTransactionStatus(env.ctx, created.transaction.id, to),
        ),
      ).toBe('LEDGER_RECONCILED_LOCKED')
    }
  })

  it('só CLEARED pode ser conciliado; status inválido é rejeitado; mesmo status é no-op', async () => {
    const env = makeLedgerEnv()
    const created = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 100,
      date: day('2026-10-05'),
      description: 'x',
      status: 'PENDING',
    })
    expect(
      await ledgerErrorCode(() =>
        env.svc.changeTransactionStatus(env.ctx, created.transaction.id, 'RECONCILED'),
      ),
    ).toBe('LEDGER_INVALID_STATUS_CHANGE')
    expect(
      await ledgerErrorCode(() =>
        env.svc.changeTransactionStatus(env.ctx, created.transaction.id, 'BOGUS' as never),
      ),
    ).toBe('LEDGER_INVALID_INPUT')
    const before = env.repo.balances.get('acc-a')?.version
    await env.svc.changeTransactionStatus(env.ctx, created.transaction.id, 'PENDING')
    expect(env.repo.balances.get('acc-a')?.version).toBe(before)
  })
})

describe('updateTransaction em lançamento simples', () => {
  async function seed(env: LedgerEnv) {
    return (
      await env.svc.createTransaction(env.ctx, {
        accountId: 'acc-a',
        kind: 'EXPENSE',
        amount: 5000,
        date: day('2026-10-05'),
        description: 'Original',
      })
    ).transaction
  }

  it('editar o valor aplica o diff no cache', async () => {
    const env = makeLedgerEnv()
    const txn = await seed(env)
    const result = await env.svc.updateTransaction(env.ctx, txn.id, { amount: 8000 })
    expect(result.transaction.amount).toBe(-8000)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(-8000)
    expectCacheMatchesLedger(env.repo)
  })

  it('mudar de conta move o saldo de A para B', async () => {
    const env = makeLedgerEnv()
    const txn = await seed(env)
    await env.svc.updateTransaction(env.ctx, txn.id, { accountId: 'acc-b' })
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(0)
    expect(cachedBuckets(env.repo, 'acc-b').cleared).toBe(-5000)
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, txn.id, { accountId: 'acc-old' }),
      ),
    ).toBe('LEDGER_ACCOUNT_ARCHIVED')
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, txn.id, { accountId: 'acc-other' }),
      ),
    ).toBe('LEDGER_ACCOUNT_NOT_FOUND')
    expectCacheMatchesLedger(env.repo)
  })

  it('mudar o kind reaplica o sinal (EXPENSE -> INCOME) e rejeita virar transferência', async () => {
    const env = makeLedgerEnv()
    const txn = await seed(env)
    const result = await env.svc.updateTransaction(env.ctx, txn.id, { kind: 'INCOME' })
    expect(result.transaction.amount).toBe(5000)
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(5000)
    expect(
      await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, txn.id, { kind: 'TRANSFER' })),
    ).toBe('LEDGER_USE_TRANSFER')
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, txn.id, { kind: 'BOGUS' as never }),
      ),
    ).toBe('LEDGER_INVALID_KIND')
    expectCacheMatchesLedger(env.repo)
  })

  it('status via patch move baldes e valida a transição', async () => {
    const env = makeLedgerEnv()
    const txn = await seed(env)
    await env.svc.updateTransaction(env.ctx, txn.id, { status: 'PLANNED', amount: 6000 })
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: 0, pending: 0, planned: -6000 })
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, txn.id, { status: 'RECONCILED' }),
      ),
    ).toBe('LEDGER_INVALID_STATUS_CHANGE')
  })

  it('patch vazio, valores inválidos e datas fora do padrão são rejeitados', async () => {
    const env = makeLedgerEnv()
    const txn = await seed(env)
    expect(await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, txn.id, {}))).toBe(
      'LEDGER_EMPTY_PATCH',
    )
    expect(
      await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, txn.id, { amount: -1 })),
    ).toBe('LEDGER_INVALID_SIGN')
    expect(
      await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, txn.id, { amount: 0 })),
    ).toBe('LEDGER_ZERO_AMOUNT')
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, txn.id, { date: new Date('2026-10-06T00:00:00Z') }),
      ),
    ).toBe('LEDGER_INVALID_DATE')
    expect(
      await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, txn.id, { description: ' ' })),
    ).toBe('LEDGER_INVALID_INPUT')
    expect(env.repo.txns.get(txn.id)?.amount).toBe(-5000)
  })

  it('CA-09: conciliado só aceita rótulos; editar valor => LEDGER_RECONCILED_LOCKED', async () => {
    const env = makeLedgerEnv()
    const txn = await seed(env)
    await env.svc.changeTransactionStatus(env.ctx, txn.id, 'RECONCILED')

    expect(
      await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, txn.id, { amount: 9000 })),
    ).toBe('LEDGER_RECONCILED_LOCKED')
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, txn.id, { date: day('2026-10-06') }),
      ),
    ).toBe('LEDGER_RECONCILED_LOCKED')
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, txn.id, { accountId: 'acc-b' }),
      ),
    ).toBe('LEDGER_RECONCILED_LOCKED')
    expect(
      await ledgerErrorCode(() => env.svc.updateTransaction(env.ctx, txn.id, { kind: 'FEE' })),
    ).toBe('LEDGER_RECONCILED_LOCKED')
    expect(
      await ledgerErrorCode(() =>
        env.svc.updateTransaction(env.ctx, txn.id, {
          notes: 'só uma nota',
          tags: ['a'],
          categoryId: 'cat-1',
          merchantId: 'mer-1',
        }),
      ),
    ).toBeUndefined()
    const stored = env.repo.txns.get(txn.id)!
    expect(stored).toMatchObject({ amount: -5000, notes: 'só uma nota', tags: ['a'] })
    expectCacheMatchesLedger(env.repo)
  })

  it('ADR-024: edição manual registra userLocked; SYSTEM não sobrescreve campos travados', async () => {
    const env = makeLedgerEnv()
    const txn = await seed(env)
    await env.svc.updateTransaction(env.ctx, txn.id, {
      categoryId: 'cat-user',
      notes: 'minha nota',
    })
    expect(env.repo.txns.get(txn.id)?.userLocked).toEqual({ categoryId: true, notes: true })

    const system = await env.svc.updateTransaction(
      env.ctx,
      txn.id,
      { categoryId: 'cat-rule', merchantId: 'mer-rule' },
      { actor: 'SYSTEM' },
    )
    expect(system.skippedFields).toEqual(['categoryId'])
    const stored = env.repo.txns.get(txn.id)!
    expect(stored.categoryId).toBe('cat-user')
    expect(stored.merchantId).toBe('mer-rule')
    // SYSTEM não trava o que escreveu
    expect(stored.userLocked).toEqual({ categoryId: true, notes: true })

    const onlyLocked = await env.svc.updateTransaction(
      env.ctx,
      txn.id,
      { notes: 'x' },
      { actor: 'SYSTEM' },
    )
    expect(onlyLocked.skippedFields).toEqual(['notes'])
    expect(env.repo.txns.get(txn.id)?.notes).toBe('minha nota')
  })

  it('o hook só dispara quando algo mudou', async () => {
    const env = makeLedgerEnv()
    const txn = await seed(env)
    env.events.length = 0
    await env.svc.updateTransaction(env.ctx, txn.id, { categoryId: 'c' })
    expect(env.events.map((e) => e.type)).toEqual(['UPDATE'])
  })
})

describe('rebuildAccountBalance', () => {
  it('CA-10 (em memória): corrige um cache corrompido e é idempotente', async () => {
    const env = makeLedgerEnv()
    await fundA(env)
    await env.svc.createTransfer(env.ctx, TRANSFER)
    await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 2500,
      date: day('2026-10-05'),
      description: 'x',
      status: 'PENDING',
    })
    await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'INCOME',
      amount: 7000,
      date: day('2026-10-20'),
      description: 'x',
      status: 'PLANNED',
    })
    const row = env.repo.balances.get('acc-a')!
    env.repo.balances.set('acc-a', {
      ...row,
      balanceCleared: 1,
      balancePending: 2,
      balancePlanned: 3,
    })

    const first = await env.svc.rebuildAccountBalance(env.ctx, 'acc-a')
    expect(first.drifted).toBe(true)
    expect(first.before).toEqual({ cleared: 1, pending: 2, planned: 3 })
    expect(first.after).toEqual({ cleared: 90000, pending: -2500, planned: 7000 })
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual(first.after)
    expectCacheMatchesLedger(env.repo)

    const second = await env.svc.rebuildAccountBalance(env.ctx, 'acc-a')
    expect(second.drifted).toBe(false)
    expect(second.after).toEqual(first.after)
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual(first.after)
  })

  it('cria a linha de cache de conta sem movimento e recusa conta alheia', async () => {
    const env = makeLedgerEnv()
    const result = await env.svc.rebuildAccountBalance(env.ctx, 'acc-sav')
    expect(result.after).toEqual({ cleared: 0, pending: 0, planned: 0 })
    expect(result.drifted).toBe(false)
    expect(await ledgerErrorCode(() => env.svc.rebuildAccountBalance(env.ctx, 'acc-other'))).toBe(
      'LEDGER_ACCOUNT_NOT_FOUND',
    )
  })
})

describe('getAccountPosition / listAccountPositions / listTransactions', () => {
  it('lê o cache e devolve a posição; conta sem movimento tem posição zerada', async () => {
    const env = makeLedgerEnv()
    await fundA(env, 20000)
    await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 50000,
      date: day('2026-10-05'),
      description: 'x',
    })
    const position = await env.svc.getAccountPosition(env.ctx, 'acc-a')
    expect(position).toMatchObject({ current: -30000, usage: { used: 30000, available: 70000 } })
    expect((await env.svc.getAccountPosition(env.ctx, 'acc-b')).current).toBe(0)
    expect(await ledgerErrorCode(() => env.svc.getAccountPosition(env.ctx, 'acc-other'))).toBe(
      'LEDGER_ACCOUNT_NOT_FOUND',
    )

    const all = await env.svc.listAccountPositions(env.ctx)
    expect(all.map((p) => p.accountId).sort()).toEqual(['acc-a', 'acc-b', 'acc-card', 'acc-sav'])
    const withArchived = await env.svc.listAccountPositions(env.ctx, { includeArchived: true })
    expect(withArchived).toHaveLength(5)
  })

  it('lista com filtros e paginação por cursor, só do usuário', async () => {
    const env = makeLedgerEnv()
    for (let i = 1; i <= 5; i++) {
      await env.svc.createTransaction(env.ctx, {
        accountId: i % 2 ? 'acc-a' : 'acc-b',
        kind: 'EXPENSE',
        amount: i * 100,
        date: day(`2026-10-0${i}`),
        description: i === 3 ? 'Farmácia Central' : `Item ${i}`,
        status: i === 5 ? 'PENDING' : 'CLEARED',
      })
    }
    await env.svc.createTransaction(
      { userId: 'user-2' },
      {
        accountId: 'acc-other',
        kind: 'EXPENSE',
        amount: 100,
        date: day('2026-10-09'),
        description: 'alheio',
      },
    )

    const page1 = await env.svc.listTransactions(env.ctx, { limit: 2 })
    expect(page1.items.map((t) => t.description)).toEqual(['Item 5', 'Item 4'])
    expect(page1.nextCursor).not.toBeNull()
    const page2 = await env.svc.listTransactions(env.ctx, { limit: 2, cursor: page1.nextCursor! })
    expect(page2.items.map((t) => t.description)).toEqual(['Farmácia Central', 'Item 2'])
    const page3 = await env.svc.listTransactions(env.ctx, { limit: 2, cursor: page2.nextCursor! })
    expect(page3.items.map((t) => t.description)).toEqual(['Item 1'])
    expect(page3.nextCursor).toBeNull()

    expect((await env.svc.listTransactions(env.ctx, { accountId: 'acc-b' })).items).toHaveLength(2)
    expect((await env.svc.listTransactions(env.ctx, { status: 'PENDING' })).items).toHaveLength(1)
    expect((await env.svc.listTransactions(env.ctx, { q: 'farm' })).items).toHaveLength(1)
    expect(
      (await env.svc.listTransactions(env.ctx, { from: day('2026-10-02'), to: day('2026-10-04') }))
        .items,
    ).toHaveLength(3)
    // limite é normalizado
    expect((await env.svc.listTransactions(env.ctx, { limit: 0 })).items).toHaveLength(1)
    expect((await env.svc.listTransactions(env.ctx, { limit: 10_000 })).items).toHaveLength(5)
  })
})
