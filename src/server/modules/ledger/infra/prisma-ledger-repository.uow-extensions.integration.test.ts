import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestDb } from '../../../../../tests/helpers/db'
import { computeBalances } from '../domain/balance'
import {
  createLedgerService,
  isLedgerError,
  prismaClientOf,
  type LedgerService,
  type TransactionHandle,
} from '../index'
import { PrismaLedgerRepository } from './prisma-ledger-repository'

/**
 * FC2-F1-09, ciclo 1 (Postgres real, só com `DATABASE_URL_TEST`): lock do vínculo de fatura,
 * filtros novos de `listTransactions`, ordem de locks, aninhamento, `LEDGER_DUPLICATE_KEY` no
 * ponto da operação e `upsertPlanned*` atualizando categoria/vínculos.
 */
const db = getTestDb()
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

/** Só compila se `prismaClientOf` não expuser os delegates do ledger (proteção estática). */
export function typeOnlyConsumerClientHidesLedgerTables(handle: TransactionHandle): void {
  const client = prismaClientOf(handle)
  // @ts-expect-error `transaction` pertence ao ledger
  void client.transaction
  // @ts-expect-error `accountBalance` pertence ao ledger
  void client.accountBalance
  void client.account
  void client.creditCardStatement
  void client.$queryRaw
  void client.$executeRaw
}

describe.skipIf(!db)(
  'ledger: extensões da unit of work, ciclo 1 (DATABASE_URL_TEST)',
  { timeout: 40_000 },
  () => {
    const client = db!
    const userId = `uowx-${randomUUID()}`
    const ctx = { userId }
    let svc: LedgerService

    async function newAccount(type: 'CHECKING' | 'CREDIT_CARD' = 'CHECKING') {
      return client.account.create({
        data: {
          userId,
          name: `X ${randomUUID().slice(0, 8)}`,
          type,
          ...(type === 'CREDIT_CARD' ? { creditLimit: 500000, closingDay: 10, dueDay: 17 } : {}),
        },
      })
    }

    async function newStatement(accountId: string, key: string, periodStart: string) {
      return client.creditCardStatement.create({
        data: {
          userId,
          accountId,
          periodStart: day(periodStart),
          periodEnd: day('2027-12-10'),
          closingDate: day('2027-12-10'),
          dueDate: day('2027-12-17'),
          statementKey: key,
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

    it('lock de fatura: usuário move, sync SYSTEM nao desfaz (e persiste userLocked.statement)', async () => {
      const card = await newAccount('CREDIT_CARD')
      const october = await newStatement(card.id, '2026-10', '2026-09-11')
      const november = await newStatement(card.id, '2026-11', '2026-10-11')
      const { transaction } = await svc.createTransaction(ctx, {
        accountId: card.id,
        kind: 'EXPENSE',
        amount: 5000,
        date: day('2026-10-05'),
        description: 'Compra',
        statementId: october.id,
        statementKey: '2026-10',
      })

      const moved = await svc.runInTransaction(ctx, (uow) =>
        uow.setTransactionLinks(
          transaction.id,
          { statementId: november.id, statementKey: '2026-11' },
          { actor: 'USER' },
        ),
      )
      expect(moved).toMatchObject({ statementId: november.id, userLocked: { statement: true } })

      const synced = await svc.runInTransaction(ctx, (uow) =>
        uow.setTransactionLinks(
          transaction.id,
          { statementId: october.id, statementKey: '2026-10', seriesId: null },
          { actor: 'SYSTEM' },
        ),
      )
      expect(synced.skippedFields).toEqual(['statementId', 'statementKey'])
      const row = await client.transaction.findUniqueOrThrow({ where: { id: transaction.id } })
      expect(row).toMatchObject({ statementId: november.id, statementKey: '2026-11' })
      expect(row.userLocked).toEqual({ statement: true })

      // serviço fora da uow: mesmo comportamento; sem actor o patch é neutro
      const viaService = await svc.setTransactionLinks(
        ctx,
        transaction.id,
        { statementId: october.id },
        { actor: 'SYSTEM' },
      )
      expect(viaService).toMatchObject({ statementId: november.id, skippedFields: ['statementId'] })
      await expectCacheMatchesLedger(card.id)
    })

    it('listTransactions: status multiplo, categoryId e occurrenceKeyPrefix (literal para % e _)', async () => {
      const acc = await newAccount()
      const catA = await client.category.create({
        data: { userId, key: `a-${randomUUID()}`, name: 'A', type: 'INCOME' },
      })
      const catB = await client.category.create({
        data: { userId, key: `b-${randomUUID()}`, name: 'B', type: 'INCOME' },
      })
      const tag = randomUUID().slice(0, 6)
      const mk = (over: Record<string, unknown>) =>
        svc.createTransaction(ctx, {
          accountId: acc.id,
          kind: 'INCOME',
          amount: 100,
          date: day('2026-10-05'),
          description: 'x',
          ...over,
        })
      await mk({ status: 'PLANNED', occurrenceKey: `${tag}s1:1`, categoryId: catA.id })
      await mk({ status: 'PENDING', occurrenceKey: `${tag}s1:2`, categoryId: catB.id })
      await mk({ status: 'CLEARED', occurrenceKey: `${tag}s10:1`, categoryId: catA.id })
      await mk({ status: 'CLEARED', occurrenceKey: `${tag}d%x:1` })
      await mk({ status: 'CLEARED', occurrenceKey: `${tag}dZx:1` })
      await mk({ status: 'CLEARED', occurrenceKey: `${tag}a_b:1` })
      await mk({ status: 'CLEARED', occurrenceKey: `${tag}aXb:1` })
      await mk({ status: 'CLEARED', occurrenceKey: `${tag}e\\x:1` })
      await mk({ status: 'CLEARED', occurrenceKey: `${tag}e%y:1` })
      await mk({ status: 'CLEARED' })

      const keys = (page: { items: Array<{ occurrenceKey: string | null }> }) =>
        page.items.map((t) => t.occurrenceKey?.slice(tag.length)).sort()
      const list = (filter: Parameters<LedgerService['listTransactions']>[1]) =>
        svc.listTransactions(ctx, { accountId: acc.id, ...filter })

      expect(
        (await list({ status: ['PLANNED', 'PENDING'] })).items.map((t) => t.status).sort(),
      ).toEqual(['PENDING', 'PLANNED'])
      expect((await list({ status: 'PLANNED' })).items).toHaveLength(1)
      expect((await list({ status: [] })).items).toEqual([])
      expect(keys(await list({ categoryId: catA.id }))).toEqual(['s10:1', 's1:1'])
      expect(keys(await list({ occurrenceKeyPrefix: `${tag}s1:` }))).toEqual(['s1:1', 's1:2'])
      expect(keys(await list({ occurrenceKeyPrefix: `${tag}d%` }))).toEqual(['d%x:1'])
      expect(keys(await list({ occurrenceKeyPrefix: `${tag}a_` }))).toEqual(['a_b:1'])
      expect(keys(await list({ occurrenceKeyPrefix: `${tag}e\\` }))).toEqual(['e\\x:1'])
      // injeção: o prefixo é parametrizado, nunca interpolado
      expect(
        (await list({ occurrenceKeyPrefix: "x'; DROP TABLE transactions; --" })).items,
      ).toEqual([])
      expect(await client.transaction.count({ where: { accountId: acc.id } })).toBe(10)

      const viaUow = await svc.runInTransaction(ctx, (uow) =>
        uow.listTransactions({
          accountId: acc.id,
          status: ['PLANNED', 'PENDING'],
          categoryId: catB.id,
          occurrenceKeyPrefix: tag,
        }),
      )
      expect(keys(viaUow)).toEqual(['s1:2'])
    })

    it('ordem de locks: lockOccurrenceKeys antes de escrever => uow mista e upsert avulso nunca falham', async () => {
      for (let round = 0; round < 3; round++) {
        const acc = await newAccount()
        const key = `x-order-${acc.id}`
        const run = (i: number) =>
          i % 2 === 0
            ? svc.runInTransaction(ctx, async (uow) => {
                await uow.lockOccurrenceKeys([key])
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
            : svc.upsertPlannedByOccurrenceKey(ctx, {
                accountId: acc.id,
                kind: 'EXPENSE',
                amount: 300 + i,
                date: day('2026-11-05'),
                description: 'prev',
                occurrenceKey: key,
              })
        const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => run(i)))
        expect(results.filter((r) => r.status === 'rejected')).toEqual([])
        expect(await client.transaction.count({ where: { userId, occurrenceKey: key } })).toBe(1)
        expect(
          await client.transaction.count({ where: { accountId: acc.id, description: 'x' } }),
        ).toBe(6)
        await expectCacheMatchesLedger(acc.id)
      }
    })

    it('aninhamento: servico dentro de runInTransaction falha na hora (nao espera o timeout) e desfaz', async () => {
      const acc = await newAccount()
      const started = Date.now()
      let error: unknown
      await svc
        .runInTransaction(ctx, async (uow) => {
          await uow.createTransaction({
            accountId: acc.id,
            kind: 'INCOME',
            amount: 100,
            date: day('2026-10-05'),
            description: 'externa',
          })
          await svc.createTransaction(ctx, {
            accountId: acc.id,
            kind: 'INCOME',
            amount: 200,
            date: day('2026-10-05'),
            description: 'interna',
          })
        })
        .catch((e: unknown) => {
          error = e
        })
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(isLedgerError(error) && error.code).toBe('LEDGER_NESTED_TRANSACTION')
      expect(await client.transaction.count({ where: { accountId: acc.id } })).toBe(0)

      // runInTransaction aninhado e o serviço depois do commit continuam funcionando
      let nested: unknown
      await svc
        .runInTransaction(ctx, async () => svc.runInTransaction(ctx, async () => 1))
        .catch((e: unknown) => {
          nested = e
        })
      expect(isLedgerError(nested) && nested.code).toBe('LEDGER_NESTED_TRANSACTION')
      await svc.createTransaction(ctx, {
        accountId: acc.id,
        kind: 'INCOME',
        amount: 100,
        date: day('2026-10-05'),
        description: 'depois',
      })
      expect(await client.transaction.count({ where: { accountId: acc.id } })).toBe(1)
    })

    it('LEDGER_DUPLICATE_KEY chega como LedgerError dentro da fn (insert e update)', async () => {
      const acc = await newAccount()
      const occurrenceKey = `x-dup-${acc.id}`
      const importHash = `h-${acc.id}`
      const first = await svc.createTransaction(ctx, {
        accountId: acc.id,
        kind: 'INCOME',
        amount: 100,
        date: day('2026-10-05'),
        description: 'a',
        occurrenceKey,
        importHash,
      })
      const other = await svc.createTransaction(ctx, {
        accountId: acc.id,
        kind: 'INCOME',
        amount: 100,
        date: day('2026-10-05'),
        description: 'b',
      })

      const caught: unknown[] = []
      for (const op of [
        (uow: Parameters<Parameters<LedgerService['runInTransaction']>[1]>[0]) =>
          uow.createTransaction({
            accountId: acc.id,
            kind: 'INCOME',
            amount: 100,
            date: day('2026-10-05'),
            description: 'c',
            occurrenceKey,
          }),
        (uow: Parameters<Parameters<LedgerService['runInTransaction']>[1]>[0]) =>
          uow.setTransactionLinks(other.transaction.id, { importHash }),
      ]) {
        let inside: unknown
        const outer = await svc
          .runInTransaction(ctx, async (uow) => {
            try {
              await op(uow)
            } catch (error) {
              inside = error // o consumidor ja ve o LedgerError aqui, nao o erro cru do Prisma
              throw error
            }
          })
          .catch((e: unknown) => e)
        caught.push(inside, outer)
      }
      for (const error of caught) {
        expect(isLedgerError(error) && error.code).toBe('LEDGER_DUPLICATE_KEY')
      }
      expect(caught.map((e) => isLedgerError(e) && e.details?.field)).toEqual([
        'occurrenceKey',
        'occurrenceKey',
        'importHash',
        'importHash',
      ])
      expect(first.transaction.occurrenceKey).toBe(occurrenceKey)
      await expectCacheMatchesLedger(acc.id)
    })

    it('upsertPlanned atualiza categoria, estabelecimento, notas, tags e vinculos e respeita userLocked', async () => {
      const acc = await newAccount()
      const catA = await client.category.create({
        data: { userId, key: `ua-${randomUUID()}`, name: 'A', type: 'INCOME' },
      })
      const catB = await client.category.create({
        data: { userId, key: `ub-${randomUUID()}`, name: 'B', type: 'INCOME' },
      })
      const merchant = await client.merchant.create({
        data: { userId, name: 'Pagador', normalizedKey: `pagador-${randomUUID()}` },
      })
      const series = await client.recurringSeries.create({
        data: {
          userId,
          kind: 'INCOME',
          name: 'Serie',
          accountId: acc.id,
          amount: 1000,
          rrule: 'FREQ=MONTHLY',
          dtstart: day('2026-10-01'),
        },
      })
      const base = {
        accountId: acc.id,
        kind: 'INCOME' as const,
        amount: 150000,
        date: day('2026-11-05'),
        description: 'Renda prevista',
        occurrenceKey: `${series.id}:2026-11-05`,
      }
      const created = await svc.upsertPlannedByOccurrenceKey(ctx, { ...base, categoryId: catA.id })
      expect(created.action).toBe('CREATED')

      const updated = await svc.upsertPlannedByOccurrenceKey(ctx, {
        ...base,
        categoryId: catB.id,
        merchantId: merchant.id,
        notes: 'n',
        tags: ['t1', 't2'],
        seriesId: series.id,
        categorySource: 'RULE',
        aiConfidence: 90,
      })
      expect(updated.action).toBe('UPDATED')
      expect(updated.skippedFields).toEqual([])
      expect(
        await client.transaction.findUniqueOrThrow({ where: { id: created.transaction.id } }),
      ).toMatchObject({
        categoryId: catB.id,
        merchantId: merchant.id,
        notes: 'n',
        tags: ['t1', 't2'],
        seriesId: series.id,
        categorySource: 'RULE',
        aiConfidence: 90,
        amount: 150000,
      })

      // o usuario edita a categoria: o sistema nao a desfaz
      await svc.updateTransaction(ctx, created.transaction.id, { categoryId: catA.id })
      const again = await svc.upsertPlannedByOccurrenceKey(ctx, {
        ...base,
        categoryId: catB.id,
        categorySource: 'LLM',
        merchantId: null,
      })
      expect(again.skippedFields).toEqual(['categoryId'])
      expect(again.transaction).toMatchObject({
        categoryId: catA.id,
        merchantId: null,
        categorySource: 'RULE',
      })
      await expectCacheMatchesLedger(acc.id)
    })
  },
)
