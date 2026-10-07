import { describe, expect, it } from 'vitest'
// A API pública, como outro módulo a consome (FC2-F1-09, ciclo 1).
import { createLedgerService, isLedgerError, type LedgerDeps } from '../index'
import {
  InMemoryLedgerRepository,
  cachedBuckets,
  day,
  expectCacheMatchesLedger,
  ledgerErrorCode,
  makeLedgerEnv,
} from '../testing'

const card = (over: Record<string, unknown> = {}) => ({
  accountId: 'acc-card',
  kind: 'EXPENSE' as const,
  amount: 5000,
  date: day('2026-10-05'),
  description: 'Compra',
  statementId: 'st-1',
  statementKey: '2026-10',
  ...over,
})

describe('setTransactionLinks: lock do vínculo de fatura (userLocked.statement)', () => {
  it('usuário move a compra, o sync SYSTEM não desfaz e devolve skippedFields', async () => {
    const env = makeLedgerEnv()
    const { transaction } = await env.svc.createTransaction(env.ctx, card())
    const id = transaction.id

    const moved = await env.svc.setTransactionLinks(
      env.ctx,
      id,
      { statementId: 'st-2', statementKey: '2026-11' },
      { actor: 'USER' },
    )
    expect(moved).toMatchObject({
      statementId: 'st-2',
      statementKey: '2026-11',
      userLocked: { statement: true },
      skippedFields: [],
    })

    // Sync automático tenta devolver o lançamento ao ciclo original.
    const eventsBefore = env.events.length
    const synced = await env.svc.setTransactionLinks(
      env.ctx,
      id,
      { statementId: 'st-1', statementKey: '2026-10' },
      { actor: 'SYSTEM' },
    )
    expect(synced).toMatchObject({
      statementId: 'st-2',
      statementKey: '2026-11',
      skippedFields: ['statementId', 'statementKey'],
    })
    expect(env.events.length).toBe(eventsBefore) // nada mudou: nenhum evento de mutação
    expect((await env.repo.findTxn(env.ctx.userId, id))?.statementId).toBe('st-2')
    expectCacheMatchesLedger(env.repo)
  })

  it('SYSTEM em lançamento sem lock altera a fatura e não trava nada', async () => {
    const env = makeLedgerEnv()
    const { transaction } = await env.svc.createTransaction(env.ctx, card())
    const synced = await env.svc.setTransactionLinks(
      env.ctx,
      transaction.id,
      { statementId: 'st-2', statementKey: '2026-11' },
      { actor: 'SYSTEM' },
    )
    expect(synced).toMatchObject({ statementId: 'st-2', userLocked: {}, skippedFields: [] })
  })

  it('SYSTEM com lock aplica os demais vínculos do patch e preserva a fatura', async () => {
    const env = makeLedgerEnv()
    const { transaction } = await env.svc.createTransaction(env.ctx, card())
    await env.svc.setTransactionLinks(
      env.ctx,
      transaction.id,
      { statementKey: '2026-11', statementId: 'st-2' },
      { actor: 'USER' },
    )
    const result = await env.svc.setTransactionLinks(
      env.ctx,
      transaction.id,
      { statementId: 'st-1', statementKey: '2026-10', seriesId: 'serie-1' },
      { actor: 'SYSTEM' },
    )
    expect(result).toMatchObject({
      statementId: 'st-2',
      statementKey: '2026-11',
      seriesId: 'serie-1',
      skippedFields: ['statementId', 'statementKey'],
    })
  })

  it('USER: só vínculos de fatura travam; limpar a fatura também trava; outros locks são mantidos', async () => {
    const env = makeLedgerEnv()
    const { transaction } = await env.svc.createTransaction(env.ctx, card())
    const id = transaction.id
    await env.svc.updateTransaction(env.ctx, id, { notes: 'minha nota' }) // userLocked.notes

    const serie = await env.svc.setTransactionLinks(
      env.ctx,
      id,
      { seriesId: 'serie-1' },
      { actor: 'USER' },
    )
    expect(serie.userLocked).toEqual({ notes: true })

    const cleared = await env.svc.setTransactionLinks(
      env.ctx,
      id,
      { statementId: null, statementKey: null },
      { actor: 'USER' },
    )
    expect(cleared).toMatchObject({
      statementId: null,
      statementKey: null,
      userLocked: { notes: true, statement: true },
    })
  })

  it('sem actor mantém o comportamento neutro (não trava, não respeita)', async () => {
    const env = makeLedgerEnv()
    const { transaction } = await env.svc.createTransaction(env.ctx, card())
    const id = transaction.id
    const a = await env.svc.setTransactionLinks(env.ctx, id, { statementId: 'st-2' })
    expect(a.userLocked).toEqual({})
    await env.svc.setTransactionLinks(env.ctx, id, { statementId: 'st-3' }, { actor: 'USER' })
    const b = await env.svc.setTransactionLinks(env.ctx, id, { statementId: 'st-4' })
    expect(b).toMatchObject({ statementId: 'st-4', skippedFields: [] })
  })

  it('fluxo completo dentro da unit of work (usuário move, sync não desfaz, rollback desfaz o lock)', async () => {
    const env = makeLedgerEnv()
    const { transaction } = await env.svc.createTransaction(env.ctx, card())
    const id = transaction.id

    await env.svc.runInTransaction(env.ctx, async (uow) => {
      await uow.setTransactionLinks(
        id,
        { statementId: 'st-2', statementKey: '2026-11' },
        { actor: 'USER' },
      )
      const synced = await uow.setTransactionLinks(
        id,
        { statementId: 'st-1', statementKey: '2026-10' },
        { actor: 'SYSTEM' },
      )
      expect(synced.skippedFields).toEqual(['statementId', 'statementKey'])
      expect((await uow.findTransaction(id))?.statementId).toBe('st-2')
    })

    // Falha depois do lock: o lock e a mudança desfazem juntos.
    await expect(
      env.svc.runInTransaction(env.ctx, async (uow) => {
        await uow.setTransactionLinks(id, { statementId: 'st-9' }, { actor: 'USER' })
        throw new Error('falha do módulo consumidor')
      }),
    ).rejects.toThrow('falha do módulo consumidor')
    expect(await env.repo.findTxn(env.ctx.userId, id)).toMatchObject({
      statementId: 'st-2',
      userLocked: { statement: true },
    })
  })

  it('valida o vínculo mesmo com actor (fatura inexistente) e patch vazio continua inválido', async () => {
    const env = makeLedgerEnv()
    const { transaction } = await env.svc.createTransaction(env.ctx, card())
    env.repo.missingLinks.add('st-x')
    expect(
      await ledgerErrorCode(() =>
        env.svc.setTransactionLinks(
          env.ctx,
          transaction.id,
          { statementId: 'st-x' },
          { actor: 'USER' },
        ),
      ),
    ).toBe('LEDGER_LINK_NOT_FOUND')
    expect(
      await ledgerErrorCode(() =>
        env.svc.setTransactionLinks(env.ctx, transaction.id, {}, { actor: 'SYSTEM' }),
      ),
    ).toBe('LEDGER_EMPTY_PATCH')
    // o lock não foi gravado pela tentativa que falhou
    expect((await env.repo.findTxn(env.ctx.userId, transaction.id))?.userLocked).toEqual({})
  })
})

describe('listTransactions: status múltiplo, categoryId e occurrenceKeyPrefix', () => {
  async function seed() {
    const env = makeLedgerEnv()
    const mk = (over: Record<string, unknown>) =>
      env.svc.createTransaction(env.ctx, {
        accountId: 'acc-a',
        kind: 'INCOME',
        amount: 100,
        date: day('2026-10-05'),
        description: 'x',
        ...over,
      })
    await mk({ status: 'PLANNED', occurrenceKey: 'serie-1:2026-11-05', categoryId: 'cat-1' })
    await mk({ status: 'PENDING', occurrenceKey: 'serie-1:2026-12-05', categoryId: 'cat-2' })
    await mk({ status: 'CLEARED', occurrenceKey: 'serie-10:2026-11-05', categoryId: 'cat-1' })
    await mk({ status: 'CLEARED', occurrenceKey: 'das%x:2026-11-20' })
    await mk({ status: 'CLEARED', occurrenceKey: 'dasZx:2026-11-20' })
    await mk({ status: 'CLEARED', occurrenceKey: 'a_b:1' })
    await mk({ status: 'CLEARED', occurrenceKey: 'aXb:1' })
    await mk({ status: 'CLEARED' })
    return env
  }
  const keys = (page: { items: Array<{ occurrenceKey: string | null }> }) =>
    page.items.map((t) => t.occurrenceKey).sort()

  it('status aceita um valor, vários e array vazio (nenhum)', async () => {
    const env = await seed()
    const statuses = async (status: Parameters<typeof env.svc.listTransactions>[1]) =>
      (await env.svc.listTransactions(env.ctx, status)).items.map((t) => t.status)
    expect((await statuses({ status: 'PLANNED' })).sort()).toEqual(['PLANNED'])
    expect((await statuses({ status: ['PLANNED', 'PENDING'] })).sort()).toEqual([
      'PENDING',
      'PLANNED',
    ])
    expect(await statuses({ status: [] })).toEqual([])
    expect(await statuses({})).toHaveLength(8)
  })

  it('categoryId filtra por categoria', async () => {
    const env = await seed()
    const page = await env.svc.listTransactions(env.ctx, { categoryId: 'cat-1' })
    expect(keys(page)).toEqual(['serie-10:2026-11-05', 'serie-1:2026-11-05'])
  })

  it('occurrenceKeyPrefix casa por prefixo, trata % e _ como texto e ignora chaves nulas', async () => {
    const env = await seed()
    const list = (prefix: string) =>
      env.svc.listTransactions(env.ctx, { occurrenceKeyPrefix: prefix })
    expect(keys(await list('serie-1:'))).toEqual(['serie-1:2026-11-05', 'serie-1:2026-12-05'])
    expect(keys(await list('serie-1'))).toHaveLength(3) // serie-1:..., serie-1:..., serie-10:...
    expect(keys(await list('das%'))).toEqual(['das%x:2026-11-20'])
    expect(keys(await list('a_'))).toEqual(['a_b:1'])
    expect(await list('inexistente:')).toMatchObject({ items: [] })
  })

  it('combina filtros e funciona dentro da unit of work (sem teto de página do serviço)', async () => {
    const env = await seed()
    const page = await env.svc.runInTransaction(env.ctx, (uow) =>
      uow.listTransactions({
        status: ['PLANNED', 'PENDING'],
        occurrenceKeyPrefix: 'serie-1:',
        categoryId: 'cat-2',
      }),
    )
    expect(keys(page)).toEqual(['serie-1:2026-12-05'])
  })
})

describe('unit of work: lockOccurrenceKeys e ordem de locks', () => {
  it('lockOccurrenceKeys valida a chave e é idempotente', async () => {
    const env = makeLedgerEnv()
    await env.svc.runInTransaction(env.ctx, async (uow) => {
      await uow.lockOccurrenceKeys(['b', 'a', 'a'])
      await uow.lockOccurrenceKeys(['a'])
      await expect(uow.lockOccurrenceKeys(['   '])).rejects.toMatchObject({
        code: 'LEDGER_INVALID_LINK',
      })
    })
  })

  it('travar as chaves antes de escrever evita deadlock entre uow mista e upsert avulso', async () => {
    const env = makeLedgerEnv()
    const key = 'serie-1:2026-11-05'
    const run = (i: number) =>
      i % 2 === 0
        ? env.svc.runInTransaction(env.ctx, async (uow) => {
            await uow.lockOccurrenceKeys([key])
            await uow.createTransaction({
              accountId: 'acc-a',
              kind: 'EXPENSE',
              amount: 100,
              date: day('2026-10-05'),
              description: 'x',
            })
            await uow.upsertPlannedByOccurrenceKey({
              accountId: 'acc-a',
              kind: 'EXPENSE',
              amount: 200 + i,
              date: day('2026-11-05'),
              description: 'prev',
              occurrenceKey: key,
            })
          })
        : env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
            accountId: 'acc-a',
            kind: 'EXPENSE',
            amount: 300 + i,
            date: day('2026-11-05'),
            description: 'prev',
            occurrenceKey: key,
          })
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => run(i)))
    expect(results.filter((r) => r.status === 'rejected')).toEqual([])
    expect(env.repo.txnsOf('acc-a').filter((t) => t.occurrenceKey === key)).toHaveLength(1)
    expectCacheMatchesLedger(env.repo)
  })
})

describe('transação aninhada: LEDGER_NESTED_TRANSACTION', () => {
  it('serviço dentro de runInTransaction falha na hora e a transação externa desfaz', async () => {
    const env = makeLedgerEnv()
    let error: unknown
    await env.svc
      .runInTransaction(env.ctx, async (uow) => {
        await uow.createTransaction({
          accountId: 'acc-a',
          kind: 'INCOME',
          amount: 100,
          date: day('2026-10-05'),
          description: 'externa',
        })
        await env.svc.createTransaction(env.ctx, {
          accountId: 'acc-a',
          kind: 'INCOME',
          amount: 200,
          date: day('2026-10-05'),
          description: 'interna',
        })
      })
      .catch((e: unknown) => {
        error = e
      })
    expect(isLedgerError(error) && error.code).toBe('LEDGER_NESTED_TRANSACTION')
    expect(env.repo.txns.size).toBe(0)
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual({ cleared: 0, pending: 0, planned: 0 })
  })

  it.each([
    [
      'runInTransaction',
      (env: ReturnType<typeof makeLedgerEnv>) => env.svc.runInTransaction(env.ctx, async () => 1),
    ],
    [
      'upsertPlannedByOccurrenceKey',
      (env: ReturnType<typeof makeLedgerEnv>) =>
        env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
          accountId: 'acc-a',
          kind: 'INCOME',
          amount: 100,
          date: day('2026-11-05'),
          description: 'p',
          occurrenceKey: 'k',
        }),
    ],
    [
      'openAccountBalance',
      (env: ReturnType<typeof makeLedgerEnv>) => env.svc.openAccountBalance(env.ctx, 'acc-a'),
    ],
  ])('%s aninhado lança o erro estável', async (_name, nested) => {
    const env = makeLedgerEnv()
    expect(
      await ledgerErrorCode(() => env.svc.runInTransaction(env.ctx, async () => nested(env))),
    ).toBe('LEDGER_NESTED_TRANSACTION')
  })

  it('depois do commit o serviço volta a funcionar e o hook pós-commit pode chamar o ledger', async () => {
    const repo = new InMemoryLedgerRepository()
    repo.addAccount({ id: 'a', userId: 'u', type: 'CHECKING' })
    const hookResults: string[] = []
    const deps: LedgerDeps = {
      repo,
      clock: () => new Date('2026-10-05T12:00:00.000Z'),
      uuid: () => '00000000-0000-4000-8000-000000000001',
      afterLedgerMutation: async () => {
        // pós-commit: fora do escopo da transação, sem erro de aninhamento
        const page = await svc.listTransactions({ userId: 'u' })
        const again = await svc.openAccountBalance({ userId: 'u' }, 'a')
        hookResults.push(`${page.items.length}:${again.accountId}`)
      },
    }
    const svc = createLedgerService(deps)
    await svc.runInTransaction({ userId: 'u' }, (uow) =>
      uow.createTransaction({
        accountId: 'a',
        kind: 'INCOME',
        amount: 100,
        date: day('2026-10-05'),
        description: 'x',
      }),
    )
    expect(hookResults).toEqual(['1:a'])
    await svc.createTransaction(
      { userId: 'u' },
      {
        accountId: 'a',
        kind: 'INCOME',
        amount: 100,
        date: day('2026-10-05'),
        description: 'y',
      },
    )
    expect(repo.txns.size).toBe(2)
  })

  it('transações simultâneas e independentes não são tratadas como aninhadas', async () => {
    const env = makeLedgerEnv()
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        env.svc.createTransaction(env.ctx, {
          accountId: 'acc-a',
          kind: 'INCOME',
          amount: 100 + i,
          date: day('2026-10-05'),
          description: `p${i}`,
        }),
      ),
    )
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
  })
})

describe('LEDGER_DUPLICATE_KEY no ponto da operação, dentro da fn (paridade memória × Prisma)', () => {
  it('createTransaction duplicada lança LedgerError que o consumidor consegue capturar', async () => {
    const env = makeLedgerEnv()
    await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'INCOME',
      amount: 100,
      date: day('2026-10-05'),
      description: 'a',
      occurrenceKey: 'k1',
      importHash: 'h1',
    })
    let inside: unknown
    await env.svc
      .runInTransaction(env.ctx, async (uow) => {
        try {
          await uow.createTransaction({
            accountId: 'acc-a',
            kind: 'INCOME',
            amount: 100,
            date: day('2026-10-05'),
            description: 'b',
            occurrenceKey: 'k1',
          })
        } catch (error) {
          inside = error
          throw error
        }
      })
      .catch(() => undefined)
    expect(isLedgerError(inside) && inside.code).toBe('LEDGER_DUPLICATE_KEY')
    expect(isLedgerError(inside) && inside.details).toEqual({ field: 'occurrenceKey' })

    const other = await env.svc.createTransaction(env.ctx, {
      accountId: 'acc-a',
      kind: 'INCOME',
      amount: 100,
      date: day('2026-10-05'),
      description: 'c',
    })
    expect(
      await ledgerErrorCode(() =>
        env.svc.runInTransaction(env.ctx, (uow) =>
          uow.setTransactionLinks(other.transaction.id, { importHash: 'h1' }),
        ),
      ),
    ).toBe('LEDGER_DUPLICATE_KEY')
  })
})

describe('upsertPlannedByOccurrenceKey atualiza categoria, estabelecimento, notas, tags e vínculos', () => {
  const base = {
    accountId: 'acc-a',
    kind: 'INCOME' as const,
    amount: 150000,
    date: day('2026-11-05'),
    description: 'Renda prevista',
    occurrenceKey: 'serie-1:2026-11-05',
  }

  it('aplica o que mudou num PLANNED existente; omitido não é tocado e null limpa', async () => {
    const env = makeLedgerEnv()
    const first = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      categoryId: 'cat-1',
      notes: 'n1',
      tags: ['a'],
      seriesId: 'serie-1',
    })
    expect(first.action).toBe('CREATED')

    const second = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      categoryId: 'cat-2',
      merchantId: 'm-1',
      notes: 'n2',
      tags: ['b', 'c'],
      seriesId: 'serie-2',
      categorySource: 'RULE',
      aiConfidence: 80,
    })
    expect(second.action).toBe('UPDATED')
    expect(second.transaction).toMatchObject({
      categoryId: 'cat-2',
      merchantId: 'm-1',
      notes: 'n2',
      tags: ['b', 'c'],
      seriesId: 'serie-2',
      categorySource: 'RULE',
      aiConfidence: 80,
      amount: 150000,
    })
    expect(second.skippedFields).toEqual([])

    // mesmo conteúdo: nada muda
    const same = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      categoryId: 'cat-2',
      tags: ['b', 'c'],
      seriesId: 'serie-2',
    })
    expect(same.action).toBe('UNCHANGED')

    // sem campos opcionais: nada é apagado; null limpa
    const omitted = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, base)
    expect(omitted.action).toBe('UNCHANGED')
    expect(omitted.transaction.categoryId).toBe('cat-2')
    const cleared = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      merchantId: null,
      notes: null,
      tags: [],
    })
    expect(cleared.action).toBe('UPDATED')
    expect(cleared.transaction).toMatchObject({ merchantId: null, notes: null, tags: [] })
    expectCacheMatchesLedger(env.repo)
  })

  it('só vínculo muda: UPDATED sem tocar saldo; vínculo inexistente falha', async () => {
    const env = makeLedgerEnv()
    await env.svc.upsertPlannedByOccurrenceKey(env.ctx, base)
    const before = cachedBuckets(env.repo, 'acc-a')
    const linked = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      seriesId: 'serie-9',
    })
    expect(linked).toMatchObject({ action: 'UPDATED', transaction: { seriesId: 'serie-9' } })
    expect(cachedBuckets(env.repo, 'acc-a')).toEqual(before)

    env.repo.missingLinks.add('serie-x')
    expect(
      await ledgerErrorCode(() =>
        env.svc.upsertPlannedByOccurrenceKey(env.ctx, { ...base, seriesId: 'serie-x' }),
      ),
    ).toBe('LEDGER_LINK_NOT_FOUND')
  })

  it('userLocked vence: categoria travada pelo usuário não muda (nem a origem da categoria)', async () => {
    const env = makeLedgerEnv()
    const created = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      categoryId: 'cat-1',
    })
    await env.svc.updateTransaction(env.ctx, created.transaction.id, {
      categoryId: 'cat-user',
      notes: 'nota do usuario',
    })
    const result = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      categoryId: 'cat-1',
      categorySource: 'RULE',
      aiConfidence: 70,
      notes: 'nota do sistema',
      tags: ['t'],
    })
    expect(result.action).toBe('UPDATED') // as tags entraram
    expect(result.skippedFields.sort()).toEqual(['categoryId', 'notes'])
    expect(result.transaction).toMatchObject({
      categoryId: 'cat-user',
      notes: 'nota do usuario',
      categorySource: null,
      aiConfidence: null,
      tags: ['t'],
    })

    // tudo travado: UNCHANGED
    const locked = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      categoryId: 'cat-1',
      categorySource: 'RULE',
      notes: 'outra',
    })
    expect(locked.action).toBe('UNCHANGED')
    expect(locked.skippedFields.sort()).toEqual(['categoryId', 'notes'])
  })

  it('o vínculo de fatura travado pelo usuário vence o upsert do sistema', async () => {
    const env = makeLedgerEnv()
    const created = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      accountId: 'acc-card',
      kind: 'EXPENSE',
      statementId: 'st-1',
      statementKey: '2026-11',
    })
    await env.svc.setTransactionLinks(
      env.ctx,
      created.transaction.id,
      { statementId: 'st-2', statementKey: '2026-12' },
      { actor: 'USER' },
    )
    const result = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      accountId: 'acc-card',
      kind: 'EXPENSE',
      statementId: 'st-1',
      statementKey: '2026-11',
    })
    expect(result.action).toBe('UNCHANGED')
    expect(result.skippedFields).toEqual(['statementId', 'statementKey'])
    expect(result.transaction).toMatchObject({ statementId: 'st-2', statementKey: '2026-12' })
  })

  it('previsto já confirmado continua intocado (SKIPPED)', async () => {
    const env = makeLedgerEnv()
    const created = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, base)
    await env.svc.changeTransactionStatus(env.ctx, created.transaction.id, 'CLEARED')
    const result = await env.svc.upsertPlannedByOccurrenceKey(env.ctx, {
      ...base,
      categoryId: 'cat-9',
    })
    expect(result).toMatchObject({ action: 'SKIPPED', skipped: 'NOT_PLANNED' })
    expect(result.transaction.categoryId).toBeNull()
  })
})
