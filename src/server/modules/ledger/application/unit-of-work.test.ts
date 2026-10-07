import { describe, expect, it } from 'vitest'
// A API pública, como outro módulo a consome (nada de `ledger/application` ou `ledger/infra`).
import {
  LedgerError,
  onRollback,
  type LedgerService,
  type TransactionHandle,
  type TxnLinksInput,
} from '../index'
import {
  InMemoryLedgerRepository,
  OTHER_USER,
  USER,
  cachedBuckets,
  day,
  expectCacheMatchesLedger,
  ledgerErrorCode,
  makeLedgerEnv,
  type LedgerEnv,
} from '../testing'

// ---------------------------------------------------------------------------------------
// Exemplo de módulo consumidor (cartões) com repositório em memória que participa do rollback.
// É o padrão documentado em docs/domain/ledger.md.
// ---------------------------------------------------------------------------------------

interface PurchaseRow {
  id: string
  userId: string
  accountId: string
  totalAmount: number
  transactionIds: string[]
}

class InMemoryCardsRepository {
  readonly purchases = new Map<string, PurchaseRow>()

  /** `tx` opcional: com handle, a escrita entra no rollback conjunto da unit of work. */
  async insertPurchase(row: PurchaseRow, tx?: TransactionHandle): Promise<void> {
    this.purchases.set(row.id, row)
    onRollback(tx, () => this.purchases.delete(row.id))
  }
}

async function createCardPurchase(
  ledger: LedgerService,
  cards: InMemoryCardsRepository,
  input: { purchaseId: string; accountId: string; amount: number; failAfterLedger?: boolean },
) {
  return ledger.runInTransaction({ userId: USER }, async (uow) => {
    const first = await uow.createTransaction({
      accountId: input.accountId,
      kind: 'EXPENSE',
      amount: input.amount,
      date: day('2026-10-05'),
      description: 'Compra no cartão',
      statementKey: '2026-11',
    })
    await cards.insertPurchase(
      {
        id: input.purchaseId,
        userId: USER,
        accountId: input.accountId,
        totalAmount: input.amount,
        transactionIds: [first.transaction.id],
      },
      uow.tx,
    )
    if (input.failAfterLedger) throw new Error('falha injetada no módulo consumidor')
    return first
  })
}

function noLedgerState(env: LedgerEnv) {
  expect(env.repo.txns.size).toBe(0)
  expect(env.repo.balances.size).toBe(0)
}

describe('vínculos em createTransaction (CA-01)', () => {
  it('persiste statementId, statementKey, refundOfId, seriesId, occurrenceKey e demais', async () => {
    const env = makeLedgerEnv()
    const original = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-card',
      kind: 'EXPENSE',
      amount: 10000,
      date: day('2026-10-05'),
      description: 'Compra',
    })
    const links: TxnLinksInput = {
      statementId: 'st-1',
      statementKey: '2026-11',
      refundOfId: original.transaction.id,
      seriesId: 'serie-1',
      occurrenceKey: 'serie-1:2026-11-05',
      importBatchId: 'batch-1',
      importHash: 'hash-1',
      categorySource: 'RULE',
      aiConfidence: 87,
    }
    const created = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-card',
      kind: 'INCOME',
      amount: 4000,
      date: day('2026-10-06'),
      description: 'Estorno',
      ...links,
    })
    expect(created.transaction).toMatchObject(links)
    expect(env.repo.txns.get(created.transaction.id)).toMatchObject(links)
    expectCacheMatchesLedger(env.repo)
  })

  it('sem vínculos, todos ficam nulos', async () => {
    const env = makeLedgerEnv()
    const { transaction } = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'INCOME',
      amount: 100,
      date: day('2026-10-05'),
      description: 'x',
    })
    expect(transaction).toMatchObject({
      statementId: null,
      statementKey: null,
      refundOfId: null,
      seriesId: null,
      occurrenceKey: null,
      importBatchId: null,
      importHash: null,
      categorySource: null,
      aiConfidence: null,
    })
  })

  it('valida formato (LEDGER_INVALID_LINK) e existência/dono (LEDGER_LINK_NOT_FOUND)', async () => {
    const env = makeLedgerEnv()
    const base = {
      accountId: 'acc-a',
      kind: 'INCOME' as const,
      amount: 100,
      date: day('2026-10-05'),
      description: 'x',
    }
    expect(
      await ledgerErrorCode(() =>
        env.svc.createTransaction(env.ctx, { ...base, statementKey: '2026-13' }),
      ),
    ).toBe('LEDGER_INVALID_LINK')
    expect(
      await ledgerErrorCode(() =>
        env.svc.createTransaction(env.ctx, { ...base, aiConfidence: 101 }),
      ),
    ).toBe('LEDGER_INVALID_LINK')

    env.repo.missingLinks.add('st-de-outro-usuario')
    expect(
      await ledgerErrorCode(() =>
        env.svc.createTransaction(env.ctx, { ...base, statementId: 'st-de-outro-usuario' }),
      ),
    ).toBe('LEDGER_LINK_NOT_FOUND')
    expect(
      await ledgerErrorCode(() =>
        env.svc.createTransaction(env.ctx, { ...base, refundOfId: 'nao-existe' }),
      ),
    ).toBe('LEDGER_LINK_NOT_FOUND')
    noLedgerState(env)
  })

  it('occurrenceKey e importHash são únicos por usuário (LEDGER_DUPLICATE_KEY)', async () => {
    const env = makeLedgerEnv()
    env.repo.addAccount({ id: 'acc-o', userId: OTHER_USER })
    const base = {
      accountId: 'acc-a',
      kind: 'INCOME' as const,
      amount: 100,
      date: day('2026-10-05'),
      description: 'x',
    }
    await env.svc.createTransaction(env.ctx, { ...base, occurrenceKey: 'k1', importHash: 'h1' })
    expect(
      await ledgerErrorCode(() =>
        env.svc.createTransaction(env.ctx, { ...base, occurrenceKey: 'k1' }),
      ),
    ).toBe('LEDGER_DUPLICATE_KEY')
    expect(
      await ledgerErrorCode(() =>
        env.svc.createTransaction(env.ctx, { ...base, importHash: 'h1' }),
      ),
    ).toBe('LEDGER_DUPLICATE_KEY')
    // outro usuário pode reutilizar a chave
    await env.svc.createTransaction(
      { userId: OTHER_USER },
      { ...base, accountId: 'acc-o', occurrenceKey: 'k1' },
    )
    expect(env.repo.txns.size).toBe(2)
    expectCacheMatchesLedger(env.repo)
  })

  it('listTransactions filtra por statementId, seriesId e refundOfId', async () => {
    const env = makeLedgerEnv()
    const mk = (statementId: string | null, seriesId: string | null) =>
      env.svc.createTransaction(env.ctx, {
        accountId: 'acc-card',
        kind: 'EXPENSE',
        amount: 100,
        date: day('2026-10-05'),
        description: 'x',
        ...(statementId ? { statementId } : {}),
        ...(seriesId ? { seriesId } : {}),
      })
    await mk('st-1', null)
    await mk('st-1', 'se-1')
    await mk('st-2', null)
    expect((await env.svc.listTransactions(env.ctx, { statementId: 'st-1' })).items).toHaveLength(2)
    expect((await env.svc.listTransactions(env.ctx, { seriesId: 'se-1' })).items).toHaveLength(1)
  })
})

describe('createTransfer com vínculos por perna (CA-02)', () => {
  it('CARD_PAYMENT grava statementId/statementKey só na perna do cartão', async () => {
    const env = makeLedgerEnv()
    const r = await env.svc.createTransfer(env.ctx, {
      kind: 'CARD_PAYMENT',
      sourceAccountId: 'acc-a',
      destinationAccountId: 'acc-card',
      amount: 25000,
      date: day('2026-11-17'),
      description: 'Pagamento da fatura',
      incoming: { statementId: 'st-1', statementKey: '2026-11' },
    })
    expect(r.incoming).toMatchObject({
      accountId: 'acc-card',
      statementId: 'st-1',
      statementKey: '2026-11',
    })
    expect(r.outgoing).toMatchObject({ accountId: 'acc-a', statementId: null, statementKey: null })
    expect(r.outgoing.excludeFromBudget && r.incoming.excludeFromBudget).toBe(true)
    expectCacheMatchesLedger(env.repo)
  })

  it('vínculo de perna inválido ou inexistente falha sem gravar nada', async () => {
    const env = makeLedgerEnv()
    env.repo.missingLinks.add('st-x')
    const base = {
      kind: 'CARD_PAYMENT' as const,
      sourceAccountId: 'acc-a',
      destinationAccountId: 'acc-card',
      amount: 100,
      date: day('2026-11-17'),
      description: 'Pagamento',
    }
    expect(
      await ledgerErrorCode(() =>
        env.svc.createTransfer(env.ctx, { ...base, incoming: { statementId: 'st-x' } }),
      ),
    ).toBe('LEDGER_LINK_NOT_FOUND')
    expect(
      await ledgerErrorCode(() =>
        env.svc.createTransfer(env.ctx, { ...base, outgoing: { statementKey: 'abc' } }),
      ),
    ).toBe('LEDGER_INVALID_LINK')
    noLedgerState(env)
  })
})

describe('unit of work: rollback conjunto (CA-03)', () => {
  it('sucesso: lançamento, saldo e escrita do módulo consumidor ficam gravados', async () => {
    const env = makeLedgerEnv()
    const cards = new InMemoryCardsRepository()
    const r = await createCardPurchase(env.svc, cards, {
      purchaseId: 'p-1',
      accountId: 'acc-card',
      amount: 20000,
    })
    expect(cards.purchases.get('p-1')?.transactionIds).toEqual([r.transaction.id])
    expect(cachedBuckets(env.repo, 'acc-card').cleared).toBe(-20000)
    expect(env.events.map((e) => e.type)).toEqual(['CREATE'])
  })

  it('falha no módulo consumidor depois de uow.createTransaction desfaz lançamento, saldo e escrita do módulo', async () => {
    const env = makeLedgerEnv()
    const cards = new InMemoryCardsRepository()
    await expect(
      createCardPurchase(env.svc, cards, {
        purchaseId: 'p-2',
        accountId: 'acc-card',
        amount: 20000,
        failAfterLedger: true,
      }),
    ).rejects.toThrow('falha injetada no módulo consumidor')
    noLedgerState(env)
    expect(cards.purchases.size).toBe(0)
    expect(env.events).toEqual([]) // nenhum evento pós-commit em transação desfeita
  })

  it('falha na própria operação do ledger desfaz as escritas anteriores do módulo consumidor', async () => {
    const env = makeLedgerEnv()
    const cards = new InMemoryCardsRepository()
    env.repo.failOn('incrementBalance')
    await expect(
      env.svc.runInTransaction(env.ctx, async (uow) => {
        await cards.insertPurchase(
          { id: 'p-3', userId: USER, accountId: 'acc-card', totalAmount: 1, transactionIds: [] },
          uow.tx,
        )
        await uow.createTransaction({
          accountId: 'acc-card',
          kind: 'EXPENSE',
          amount: 1,
          date: day('2026-10-05'),
          description: 'x',
        })
      }),
    ).rejects.toThrow('falha injetada')
    noLedgerState(env)
    expect(cards.purchases.size).toBe(0)
  })

  it('várias operações do ledger na mesma unit of work: par + lançamentos + eventos só no commit', async () => {
    const env = makeLedgerEnv()
    const result = await env.svc.runInTransaction(env.ctx, async (uow) => {
      const parcel = await uow.createTransaction({
        accountId: 'acc-a',
        kind: 'EXPENSE',
        amount: 94560,
        date: day('2026-10-05'),
        description: 'Parcela',
      })
      const fee = await uow.createTransaction({
        accountId: 'acc-a',
        kind: 'FEE',
        amount: 1891,
        date: day('2026-10-05'),
        description: 'Multa',
      })
      const interest = await uow.createTransaction({
        accountId: 'acc-a',
        kind: 'INTEREST',
        amount: 315,
        date: day('2026-10-05'),
        description: 'Juros',
      })
      // leitura dentro da transação enxerga as escritas já feitas
      const position = await uow.getAccountPosition('acc-a')
      expect(env.events).toEqual([])
      return { ids: [parcel, fee, interest].map((r) => r.transaction.id), position }
    })
    expect(result.position.balanceCleared).toBe(-(94560 + 1891 + 315))
    expect(env.events.map((e) => e.type)).toEqual(['CREATE', 'CREATE', 'CREATE'])
    expectCacheMatchesLedger(env.repo)
  })

  it('uow usada depois do fim da transação é rejeitada', async () => {
    const env = makeLedgerEnv()
    let leaked: Parameters<Parameters<LedgerService['runInTransaction']>[1]>[0] | undefined
    await env.svc.runInTransaction(env.ctx, async (uow) => {
      leaked = uow
    })
    await expect(
      leaked!.createTransaction({
        accountId: 'acc-a',
        kind: 'INCOME',
        amount: 1,
        date: day('2026-10-05'),
        description: 'x',
      }),
    ).rejects.toThrow(/fechada/)
  })

  it('o hook afterLedgerMutation falhando não desfaz a unit of work', async () => {
    const env = makeLedgerEnv()
    env.deps.afterLedgerMutation = () => {
      throw new Error('projeção fora do ar')
    }
    await env.svc.runInTransaction(env.ctx, (uow) =>
      uow.createTransaction({
        accountId: 'acc-a',
        kind: 'INCOME',
        amount: 500,
        date: day('2026-10-05'),
        description: 'x',
      }),
    )
    expect(cachedBuckets(env.repo, 'acc-a').cleared).toBe(500)
  })

  it('operações da unit of work respeitam as regras do ledger (conta arquivada, sinal)', async () => {
    const env = makeLedgerEnv()
    expect(
      await ledgerErrorCode(() =>
        env.svc.runInTransaction(env.ctx, (uow) =>
          uow.createTransaction({
            accountId: 'acc-old',
            kind: 'EXPENSE',
            amount: 1,
            date: day('2026-10-05'),
            description: 'x',
          }),
        ),
      ),
    ).toBe('LEDGER_ACCOUNT_ARCHIVED')
  })

  it('setTransactionLinks, updateTransaction, changeTransactionStatus e deleteTransaction via uow', async () => {
    const env = makeLedgerEnv()
    const created = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-card',
      kind: 'EXPENSE',
      amount: 5000,
      status: 'PENDING',
      date: day('2026-10-05'),
      description: 'Compra',
      statementId: 'st-1',
      statementKey: '2026-10',
    })
    const id = created.transaction.id
    await env.svc.runInTransaction(env.ctx, async (uow) => {
      const moved = await uow.setTransactionLinks(id, {
        statementId: 'st-2',
        statementKey: '2026-11',
      })
      expect(moved).toMatchObject({ statementId: 'st-2', statementKey: '2026-11' })
      await uow.updateTransaction(id, { amount: 6000 })
      await uow.changeTransactionStatus(id, 'CLEARED')
      expect(await uow.findTransaction(id)).toMatchObject({ amount: -6000, status: 'CLEARED' })
      await uow.deleteTransaction(id)
      expect(await uow.findTransaction(id)).toBeNull()
    })
    expect(cachedBuckets(env.repo, 'acc-card')).toEqual({ cleared: 0, pending: 0, planned: 0 })
    expectCacheMatchesLedger(env.repo)
  })
})

describe('setTransactionLinks', () => {
  it('altera/limpa vínculos sem mexer em saldo nem userLocked; vale para conciliado', async () => {
    const env = makeLedgerEnv()
    const { transaction } = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-card',
      kind: 'EXPENSE',
      amount: 5000,
      date: day('2026-10-05'),
      description: 'Compra',
      statementId: 'st-1',
      statementKey: '2026-10',
    })
    await env.svc.changeTransactionStatus(env.ctx, transaction.id, 'RECONCILED')
    const before = cachedBuckets(env.repo, 'acc-card')
    const moved = await env.svc.setTransactionLinks(env.ctx, transaction.id, {
      statementId: 'st-2',
      statementKey: '2026-11',
    })
    expect(moved).toMatchObject({ statementId: 'st-2', statementKey: '2026-11', userLocked: {} })
    const cleared = await env.svc.setTransactionLinks(env.ctx, transaction.id, {
      statementId: null,
    })
    expect(cleared.statementId).toBeNull()
    expect(cachedBuckets(env.repo, 'acc-card')).toEqual(before)
  })

  it('patch vazio, id inexistente, vínculo inexistente e chave duplicada', async () => {
    const env = makeLedgerEnv()
    const a = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'INCOME',
      amount: 100,
      date: day('2026-10-05'),
      description: 'a',
      occurrenceKey: 'k-a',
    })
    const b = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'INCOME',
      amount: 100,
      date: day('2026-10-05'),
      description: 'b',
    })
    expect(
      await ledgerErrorCode(() => env.svc.setTransactionLinks(env.ctx, a.transaction.id, {})),
    ).toBe('LEDGER_EMPTY_PATCH')
    expect(
      await ledgerErrorCode(() => env.svc.setTransactionLinks(env.ctx, 'nada', { seriesId: 's' })),
    ).toBe('LEDGER_TXN_NOT_FOUND')
    expect(
      await ledgerErrorCode(() =>
        env.svc.setTransactionLinks(env.ctx, a.transaction.id, { refundOfId: a.transaction.id }),
      ),
    ).toBe('LEDGER_INVALID_LINK')
    expect(
      await ledgerErrorCode(() =>
        env.svc.setTransactionLinks(env.ctx, b.transaction.id, { occurrenceKey: 'k-a' }),
      ),
    ).toBe('LEDGER_DUPLICATE_KEY')
    env.repo.missingLinks.add('serie-x')
    expect(
      await ledgerErrorCode(() =>
        env.svc.setTransactionLinks(env.ctx, b.transaction.id, { seriesId: 'serie-x' }),
      ),
    ).toBe('LEDGER_LINK_NOT_FOUND')
    expect(
      await ledgerErrorCode(() =>
        env.svc.setTransactionLinks({ userId: OTHER_USER }, b.transaction.id, { seriesId: 's' }),
      ),
    ).toBe('LEDGER_TXN_NOT_FOUND')
  })
})

describe('upsertPlannedByOccurrenceKey (CA-04)', () => {
  const planned = (
    over: Partial<Parameters<LedgerService['upsertPlannedByOccurrenceKey']>[1]> = {},
  ) => ({
    accountId: 'acc-a',
    kind: 'INCOME' as const,
    amount: 150000,
    date: day('2026-11-05'),
    description: 'Renda prevista',
    occurrenceKey: 'serie-1:2026-11-05',
    seriesId: 'serie-1',
    ...over,
  })

  it('cria PLANNED (source RECURRING) e atualiza balancePlanned; 2ª chamada igual não duplica', async () => {
    const env = makeLedgerEnv()
    const first = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned())
    expect(first).toMatchObject({ action: 'CREATED', skipped: null })
    expect(first.transaction).toMatchObject({
      status: 'PLANNED',
      source: 'RECURRING',
      amount: 150000,
      occurrenceKey: 'serie-1:2026-11-05',
      seriesId: 'serie-1',
    })
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: 0, pending: 0, planned: 150000 })

    const second = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned())
    expect(second).toMatchObject({ action: 'UNCHANGED', skipped: null })
    expect(second.transaction.id).toBe(first.transaction.id)
    expect(env.repo.txns.size).toBe(1)
    expect(cachedBuckets(env.repo, 'acc-a').planned).toBe(150000)
  })

  it('valor/data/descrição novos atualizam o PLANNED aplicando o delta', async () => {
    const env = makeLedgerEnv()
    const first = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned())
    const second = await env.svc.upsertPlannedByOccurrenceKey(
      env.ctx,
      planned({
        amount: 172000,
        date: day('2026-11-06'),
        description: 'Renda prevista (ajustada)',
      }),
    )
    expect(second.action).toBe('UPDATED')
    expect(second.transaction).toMatchObject({
      id: first.transaction.id,
      amount: 172000,
      description: 'Renda prevista (ajustada)',
    })
    expect(second.transaction.date).toEqual(day('2026-11-06'))
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: 0, pending: 0, planned: 172000 })
    expect(env.repo.txns.size).toBe(1)
    expectCacheMatchesLedger(env.repo)
  })

  it('despesa prevista (DAS): valor em módulo, sinal pelo kind', async () => {
    const env = makeLedgerEnv()
    const r = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 7160,
      date: day('2026-11-20'),
      description: 'DAS MEI 2026-11',
      occurrenceKey: 'das:2026-11-20',
    })
    expect(r.transaction.amount).toBe(-7160)
    expect(cachedBuckets(env.repo, 'acc-a').planned).toBe(-7160)
    const again = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      accountId: 'acc-a',
      kind: 'EXPENSE',
      amount: 7500,
      date: day('2026-11-20'),
      description: 'DAS MEI 2026-11',
      occurrenceKey: 'das:2026-11-20',
    })
    expect(again.transaction.amount).toBe(-7500)
    expect(cachedBuckets(env.repo, 'acc-a').planned).toBe(-7500)
  })

  it('já CLEARED: não altera nada e devolve skipped NOT_PLANNED', async () => {
    const env = makeLedgerEnv()
    const first = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned())
    await env.svc.changeTransactionStatus(env.ctx, first.transaction.id, 'CLEARED')
    const again = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned({ amount: 999999 }))
    expect(again).toMatchObject({ action: 'SKIPPED', skipped: 'NOT_PLANNED' })
    expect(again.transaction).toMatchObject({ status: 'CLEARED', amount: 150000 })
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: 150000, pending: 0, planned: 0 })
    expect(env.repo.txns.size).toBe(1)
  })

  it('PENDING e RECONCILED também são preservados', async () => {
    const env = makeLedgerEnv()
    const first = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned())
    await env.svc.changeTransactionStatus(env.ctx, first.transaction.id, 'PENDING')
    expect(
      (await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned({ amount: 1 }))).skipped,
    ).toBe('NOT_PLANNED')
  })

  it('userLocked vence: campo editado pelo usuário não é sobrescrito (ADR-024)', async () => {
    const env = makeLedgerEnv()
    const first = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned())
    await env.svc.updateTransaction(env.ctx, first.transaction.id, { amount: 160000 })
    const again = await env.svc.upsertPlannedByOccurrenceKey(
      env.ctx,
      planned({ amount: 170000, date: day('2026-11-07') }),
    )
    expect(again.action).toBe('UPDATED')
    expect(again.skippedFields).toEqual(['amount'])
    expect(again.transaction.amount).toBe(160000) // valor do usuário
    expect(again.transaction.date).toEqual(day('2026-11-07')) // data (livre) foi atualizada

    const onlyLocked = await env.svc.upsertPlannedByOccurrenceKey(
      env.ctx,
      planned({ amount: 180000, date: day('2026-11-07') }),
    )
    expect(onlyLocked.action).toBe('UNCHANGED')
    expect(onlyLocked.skippedFields).toEqual(['amount'])
    expectCacheMatchesLedger(env.repo)
  })

  it('muda a conta de destino do previsto', async () => {
    const env = makeLedgerEnv()
    await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned())
    await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned({ accountId: 'acc-b' }))
    expect(cachedBuckets(env.repo, 'acc-a').planned).toBe(0)
    expect(cachedBuckets(env.repo, 'acc-b').planned).toBe(150000)
    expectCacheMatchesLedger(env.repo)
  })

  it('10 chamadas concorrentes na mesma chave resultam em 1 lançamento e saldo correto', async () => {
    const env = makeLedgerEnv()
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned({ amount: 150000 + (i % 2) })),
      ),
    )
    expect(results.filter((r) => r.action === 'CREATED')).toHaveLength(1)
    expect(env.repo.txns.size).toBe(1)
    const only = [...env.repo.txns.values()][0]!
    expect(cachedBuckets(env.repo, 'acc-a').planned).toBe(only.amount)
    expectCacheMatchesLedger(env.repo)
  })

  it('upsert concorrente com mudança de status: ou atualiza ou pula, nunca corrompe', async () => {
    const env = makeLedgerEnv()
    const first = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned())
    await Promise.all([
      env.svc.changeTransactionStatus(env.ctx, first.transaction.id, 'CLEARED'),
      env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned({ amount: 170000 })),
    ])
    expect(env.repo.txns.size).toBe(1)
    expectCacheMatchesLedger(env.repo)
  })

  it('upsertPlannedBatch: várias chaves, ordem de lock estável; execuções cruzadas não travam', async () => {
    const env = makeLedgerEnv()
    const keys = ['k-1', 'k-2', 'k-3', 'k-4']
    const mk = (ordered: string[]) =>
      ordered.map((key, i) =>
        planned({ occurrenceKey: key, amount: 1000 + i, date: day('2026-11-0' + (i + 1)) }),
      )
    const settled = await Promise.allSettled([
      env.svc.upsertPlannedBatch(env.ctx, mk(keys)),
      env.svc.upsertPlannedBatch(env.ctx, mk([...keys].reverse())),
      env.svc.upsertPlannedBatch(env.ctx, mk(['k-3', 'k-1'])),
    ])
    expect(settled.filter((s) => s.status === 'rejected')).toEqual([])
    expect(env.repo.txns.size).toBe(4)
    expectCacheMatchesLedger(env.repo)
  })

  it('valida occurrenceKey, kind e conta', async () => {
    const env = makeLedgerEnv()
    expect(
      await ledgerErrorCode(() =>
        env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned({ occurrenceKey: ' ' })),
      ),
    ).toBe('LEDGER_INVALID_LINK')
    expect(
      await ledgerErrorCode(() =>
        env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned({ kind: 'TRANSFER' })),
      ),
    ).toBeDefined()
    expect(
      await ledgerErrorCode(() =>
        env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned({ accountId: 'acc-other' })),
      ),
    ).toBe('LEDGER_ACCOUNT_NOT_FOUND')
    expect(env.repo.txns.size).toBe(0)
  })

  it('chave de um usuário não colide com a de outro', async () => {
    const env = makeLedgerEnv()
    env.repo.addAccount({ id: 'acc-o2', userId: OTHER_USER })
    await env.svc.upsertPlannedByOccurrenceKey(env.ctx, planned())
    const other = await env.svc.upsertPlannedByOccurrenceKey(
      { userId: OTHER_USER },
      planned({ accountId: 'acc-o2' }),
    )
    expect(other.action).toBe('CREATED')
    expect(env.repo.txns.size).toBe(2)
  })

  it('dentro da unit of work, o previsto desfaz junto com o módulo consumidor', async () => {
    const env = makeLedgerEnv()
    await expect(
      env.svc.runInTransaction(env.ctx, async (uow) => {
        await uow.upsertPlannedByOccurrenceKey(planned())
        throw new Error('falha depois do previsto')
      }),
    ).rejects.toThrow('falha depois do previsto')
    noLedgerState(env)
  })
})

// ---------------------------------------------------------------------------------------
// Exemplo de módulo consumidor (contas): conta + AccountBalance + saldo inicial atômicos.
// ---------------------------------------------------------------------------------------

class InMemoryAccountsRepository {
  constructor(private readonly ledgerRepo: InMemoryLedgerRepository) {}

  /** A conta precisa ficar visível ao ledger: o repositório em memória do ledger lê `accounts`. */
  async insert(
    account: { id: string; userId: string; type?: 'CHECKING' | 'CREDIT_CARD' },
    tx?: TransactionHandle,
  ): Promise<void> {
    this.ledgerRepo.addAccount(account)
    onRollback(tx, () => this.ledgerRepo.accounts.delete(account.id))
  }
}

async function createAccountWithOpeningBalance(
  env: LedgerEnv,
  accounts: InMemoryAccountsRepository,
  input: { id: string; openingBalance: number; failAfter?: boolean },
) {
  return env.svc.runInTransaction(env.ctx, async (uow) => {
    await accounts.insert({ id: input.id, userId: USER }, uow.tx)
    await uow.openAccountBalance(input.id)
    if (input.openingBalance !== 0) {
      await uow.createTransaction({
        accountId: input.id,
        kind: 'ADJUSTMENT',
        amount: input.openingBalance,
        date: day('2026-10-05'),
        description: 'Saldo inicial',
        excludeFromBudget: true,
      })
    }
    if (input.failAfter) throw new Error('falha depois de tudo')
    return uow.getAccountPosition(input.id)
  })
}

describe('criação de conta numa unit of work (CA-08)', () => {
  it('cria conta, linha de saldo e ADJUSTMENT inicial juntos', async () => {
    const env = makeLedgerEnv()
    const accounts = new InMemoryAccountsRepository(env.repo)
    const position = await createAccountWithOpeningBalance(env, accounts, {
      id: 'acc-new',
      openingBalance: 123456,
    })
    expect(position.balanceCleared).toBe(123456)
    expect(env.repo.accounts.has('acc-new')).toBe(true)
    expect(env.repo.balances.get('acc-new')?.balanceCleared).toBe(123456)
    const [opening] = env.repo.txnsOf('acc-new')
    expect(opening).toMatchObject({
      kind: 'ADJUSTMENT',
      status: 'CLEARED',
      excludeFromBudget: true,
      description: 'Saldo inicial',
    })
    expectCacheMatchesLedger(env.repo)
  })

  it('saldo inicial zero: conta + linha de saldo zerada, sem lançamento', async () => {
    const env = makeLedgerEnv()
    const accounts = new InMemoryAccountsRepository(env.repo)
    await createAccountWithOpeningBalance(env, accounts, { id: 'acc-new', openingBalance: 0 })
    expect(env.repo.balances.get('acc-new')).toMatchObject({ balanceCleared: 0, version: 0 })
    expect(env.repo.txnsOf('acc-new')).toEqual([])
  })

  it.each(['ensureBalance', 'insertTxn', 'incrementBalance'] as const)(
    'falha em %s não deixa conta sem linha de saldo nem saldo sem conta',
    async (op) => {
      const env = makeLedgerEnv()
      const accounts = new InMemoryAccountsRepository(env.repo)
      env.repo.failOn(op)
      await expect(
        createAccountWithOpeningBalance(env, accounts, { id: 'acc-new', openingBalance: 5000 }),
      ).rejects.toThrow('falha injetada')
      expect(env.repo.accounts.has('acc-new')).toBe(false)
      expect(env.repo.balances.has('acc-new')).toBe(false)
      expect(env.repo.txnsOf('acc-new')).toEqual([])
    },
  )

  it('falha depois de tudo desfaz conta, saldo e lançamento', async () => {
    const env = makeLedgerEnv()
    const accounts = new InMemoryAccountsRepository(env.repo)
    await expect(
      createAccountWithOpeningBalance(env, accounts, {
        id: 'acc-new',
        openingBalance: 5000,
        failAfter: true,
      }),
    ).rejects.toThrow('falha depois de tudo')
    expect(env.repo.accounts.has('acc-new')).toBe(false)
    expect(env.repo.balances.has('acc-new')).toBe(false)
    expect(env.repo.txns.size).toBe(0)
  })

  it('falha ao inserir a conta (primeiro passo): nada é criado', async () => {
    const env = makeLedgerEnv()
    await expect(
      env.svc.runInTransaction(env.ctx, async (uow) => {
        // conta nunca chega a existir: o ledger recusa abrir a linha de saldo
        await uow.openAccountBalance('acc-fantasma')
      }),
    ).rejects.toMatchObject({ code: 'LEDGER_ACCOUNT_NOT_FOUND' })
    expect(env.repo.balances.size).toBe(0)
  })
})

describe('openAccountBalance', () => {
  it('é idempotente e não altera uma linha existente', async () => {
    const env = makeLedgerEnv()
    const first = await env.svc.openAccountBalance(env.ctx, 'acc-a')
    expect(first).toMatchObject({ balanceCleared: 0, balancePending: 0, balancePlanned: 0 })
    await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'INCOME',
      amount: 700,
      date: day('2026-10-05'),
      description: 'x',
    })
    const again = await env.svc.openAccountBalance(env.ctx, 'acc-a')
    expect(again.balanceCleared).toBe(700)
    expect(env.repo.balances.size).toBe(1)
  })

  it('chamadas concorrentes criam uma única linha', async () => {
    const env = makeLedgerEnv()
    await Promise.all(Array.from({ length: 8 }, () => env.svc.openAccountBalance(env.ctx, 'acc-b')))
    expect(env.repo.balances.size).toBe(1)
  })

  it('conta inexistente ou de outro usuário: LEDGER_ACCOUNT_NOT_FOUND', async () => {
    const env = makeLedgerEnv()
    expect(await ledgerErrorCode(() => env.svc.openAccountBalance(env.ctx, 'nada'))).toBe(
      'LEDGER_ACCOUNT_NOT_FOUND',
    )
    expect(await ledgerErrorCode(() => env.svc.openAccountBalance(env.ctx, 'acc-other'))).toBe(
      'LEDGER_ACCOUNT_NOT_FOUND',
    )
  })

  it('o erro tem categoria NOT_FOUND estável', async () => {
    const env = makeLedgerEnv()
    const error = await env.svc.openAccountBalance(env.ctx, 'nada').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LedgerError)
    expect((error as LedgerError).category).toBe('NOT_FOUND')
  })
})
