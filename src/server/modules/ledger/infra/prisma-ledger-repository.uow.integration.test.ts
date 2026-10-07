import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { getTestDb } from '../../../../../tests/helpers/db'
import { computeBalances } from '../domain/balance'
import { createLedgerService, type LedgerService } from '../index'
import { PrismaLedgerRepository } from './prisma-ledger-repository'
import { prismaClientOf } from './transaction-handle'

/**
 * FC2-F1-09: vínculos, unit of work, `upsertPlannedByOccurrenceKey` e `openAccountBalance` no
 * Postgres real. Só roda com `DATABASE_URL_TEST` (database descartável).
 */
const db = getTestDb()
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe.skipIf(!db)(
  'ledger: unit of work e vínculos (DATABASE_URL_TEST)',
  { timeout: 30_000 },
  () => {
    const client = db!
    const userId = `uow-user-${randomUUID()}`
    const otherUserId = `uow-other-${randomUUID()}`
    const ctx = { userId }
    let svc: LedgerService
    let transactionCalls = 0
    /** Quantas transações o repositório abriu; retry (deadlock mascarado) = chamada extra. */
    let failFirstAttemptAfterFn = false

    function countingClient(real: PrismaClient): PrismaClient {
      return new Proxy(real, {
        get(target, prop) {
          if (prop === '$transaction') {
            return (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => {
              transactionCalls += 1
              if (failFirstAttemptAfterFn) {
                failFirstAttemptAfterFn = false
                // Executa `fn` de verdade e depois simula deadlock (40P01): a transação desfaz.
                return (target.$transaction as (...a: unknown[]) => Promise<unknown>)(
                  async (tx: unknown) => {
                    await fn(tx)
                    throw Object.assign(new Error('deadlock detected'), { code: 'P2034' })
                  },
                  opts,
                )
              }
              return (target.$transaction as (...a: unknown[]) => unknown)(fn, opts)
            }
          }
          return Reflect.get(target, prop, target)
        },
      })
    }

    async function newAccount(name: string, type: 'CHECKING' | 'CREDIT_CARD' = 'CHECKING') {
      return client.account.create({
        data: {
          userId,
          name: `${name} ${randomUUID().slice(0, 8)}`,
          type,
          ...(type === 'CREDIT_CARD' ? { creditLimit: 500000, closingDay: 10, dueDay: 17 } : {}),
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

    async function newStatement(accountId: string, owner = userId, key = '2026-11') {
      return client.creditCardStatement.create({
        data: {
          userId: owner,
          accountId,
          periodStart: day(`${key}-01`),
          periodEnd: day('2026-11-10'),
          closingDate: day('2026-11-10'),
          dueDate: day('2026-11-17'),
          statementKey: key,
        },
      })
    }

    beforeAll(async () => {
      await client.user.createMany({
        data: [
          { id: userId, email: `${userId}@example.invalid`, password: 'x' },
          { id: otherUserId, email: `${otherUserId}@example.invalid`, password: 'x' },
        ],
      })
      svc = createLedgerService({
        repo: new PrismaLedgerRepository(countingClient(client)),
        clock: () => new Date('2026-10-05T12:00:00.000Z'),
        uuid: () => randomUUID(),
      })
    })

    afterAll(async () => {
      await client.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
      await client.$disconnect()
    })

    // ---- CA-01 / CA-02: vínculos ---------------------------------------------------------

    it('CA-01: createTransaction persiste statementId/statementKey/refundOfId/seriesId/occurrenceKey e demais', async () => {
      const card = await newAccount('Cartão', 'CREDIT_CARD')
      const statement = await newStatement(card.id)
      const series = await client.recurringSeries.create({
        data: {
          userId,
          kind: 'INCOME',
          name: 'Série',
          accountId: card.id,
          amount: 1000,
          rrule: 'FREQ=MONTHLY',
          dtstart: day('2026-10-01'),
        },
      })
      const batch = await client.importBatch.create({
        data: { userId, kind: 'CSV', fileSha256: randomUUID() },
      })
      const original = await svc.createTransaction(ctx, {
        accountId: card.id,
        kind: 'EXPENSE',
        amount: 10000,
        date: day('2026-10-05'),
        description: 'Compra',
        statementId: statement.id,
        statementKey: '2026-11',
      })
      const key = `${series.id}:2026-11-05`
      const created = await svc.createTransaction(ctx, {
        accountId: card.id,
        kind: 'INCOME',
        amount: 4000,
        date: day('2026-10-06'),
        description: 'Estorno',
        statementId: statement.id,
        statementKey: '2026-11',
        refundOfId: original.transaction.id,
        seriesId: series.id,
        occurrenceKey: key,
        importBatchId: batch.id,
        importHash: `h-${randomUUID()}`,
        categorySource: 'RULE',
        aiConfidence: 90,
      })
      const row = await client.transaction.findUniqueOrThrow({
        where: { id: created.transaction.id },
      })
      expect(row).toMatchObject({
        statementId: statement.id,
        statementKey: '2026-11',
        refundOfId: original.transaction.id,
        seriesId: series.id,
        occurrenceKey: key,
        importBatchId: batch.id,
        categorySource: 'RULE',
        aiConfidence: 90,
      })
      expect(created.transaction.statementId).toBe(statement.id)
      await expectCacheMatchesLedger(card.id)

      const byStatement = await svc.listTransactions(ctx, { statementId: statement.id })
      expect(byStatement.items).toHaveLength(2)
      const refunds = await svc.listTransactions(ctx, { refundOfId: original.transaction.id })
      expect(refunds.items.map((t) => t.id)).toEqual([created.transaction.id])
    })

    it('vínculo de outro usuário ou inexistente: LEDGER_LINK_NOT_FOUND, sem gravar nada', async () => {
      const acc = await newAccount('Corrente')
      const otherAcc = await client.account.create({
        data: { userId: otherUserId, name: `Outra ${randomUUID().slice(0, 8)}`, type: 'CHECKING' },
      })
      const foreign = await newStatement(otherAcc.id, otherUserId)
      const before = await client.transaction.count({ where: { userId } })
      await expect(
        svc.createTransaction(ctx, {
          accountId: acc.id,
          kind: 'EXPENSE',
          amount: 100,
          date: day('2026-10-05'),
          description: 'x',
          statementId: foreign.id,
        }),
      ).rejects.toMatchObject({ code: 'LEDGER_LINK_NOT_FOUND' })
      await expect(
        svc.createTransaction(ctx, {
          accountId: acc.id,
          kind: 'EXPENSE',
          amount: 100,
          date: day('2026-10-05'),
          description: 'x',
          refundOfId: 'nao-existe',
        }),
      ).rejects.toMatchObject({ code: 'LEDGER_LINK_NOT_FOUND' })
      expect(await client.transaction.count({ where: { userId } })).toBe(before)
    })

    it('occurrenceKey e importHash duplicados viram LEDGER_DUPLICATE_KEY e desfazem tudo', async () => {
      const acc = await newAccount('Corrente')
      const base = {
        accountId: acc.id,
        kind: 'INCOME' as const,
        amount: 500,
        date: day('2026-10-05'),
        description: 'x',
      }
      const key = `dup-${randomUUID()}`
      await svc.createTransaction(ctx, { ...base, occurrenceKey: key, importHash: `${key}-h` })
      await expect(
        svc.createTransaction(ctx, { ...base, occurrenceKey: key }),
      ).rejects.toMatchObject({ code: 'LEDGER_DUPLICATE_KEY', details: { field: 'occurrenceKey' } })
      await expect(
        svc.createTransaction(ctx, { ...base, importHash: `${key}-h` }),
      ).rejects.toMatchObject({ code: 'LEDGER_DUPLICATE_KEY', details: { field: 'importHash' } })
      await expectCacheMatchesLedger(acc.id)
      expect(await client.transaction.count({ where: { accountId: acc.id } })).toBe(1)
    })

    it('CA-02: CARD_PAYMENT grava o vínculo da fatura só na perna do cartão', async () => {
      const checking = await newAccount('Corrente')
      const card = await newAccount('Cartão', 'CREDIT_CARD')
      const statement = await newStatement(card.id, userId, '2026-12')
      const result = await svc.createTransfer(ctx, {
        kind: 'CARD_PAYMENT',
        sourceAccountId: checking.id,
        destinationAccountId: card.id,
        amount: 25000,
        date: day('2026-11-17'),
        description: 'Pagamento da fatura',
        incoming: { statementId: statement.id, statementKey: '2026-12' },
      })
      const legs = await client.transaction.findMany({ where: { transferId: result.transferId } })
      const cardLeg = legs.find((l) => l.accountId === card.id)!
      const checkingLeg = legs.find((l) => l.accountId === checking.id)!
      expect(cardLeg).toMatchObject({
        statementId: statement.id,
        statementKey: '2026-12',
        amount: 25000,
      })
      expect(checkingLeg).toMatchObject({ statementId: null, statementKey: null, amount: -25000 })
      await expectCacheMatchesLedger(card.id)
      await expectCacheMatchesLedger(checking.id)
    })

    it('setTransactionLinks move a compra de fatura sem mexer em saldo', async () => {
      const card = await newAccount('Cartão', 'CREDIT_CARD')
      const s1 = await newStatement(card.id, userId, '2026-10')
      const s2 = await newStatement(card.id, userId, '2026-11')
      const created = await svc.createTransaction(ctx, {
        accountId: card.id,
        kind: 'EXPENSE',
        amount: 3000,
        date: day('2026-10-05'),
        description: 'Compra',
        statementId: s1.id,
        statementKey: '2026-10',
      })
      const moved = await svc.setTransactionLinks(ctx, created.transaction.id, {
        statementId: s2.id,
        statementKey: '2026-11',
      })
      expect(moved).toMatchObject({ statementId: s2.id, statementKey: '2026-11' })
      await expectCacheMatchesLedger(card.id)
    })

    // ---- CA-03 / CA-08: unit of work -----------------------------------------------------

    it('CA-03: escrita do módulo consumidor pelo handle; falha depois do ledger desfaz tudo', async () => {
      const card = await newAccount('Cartão', 'CREDIT_CARD')
      const purchaseId = randomUUID() // gerado ANTES da transação (retry-safe)

      await expect(
        svc.runInTransaction(ctx, async (uow) => {
          const t = await uow.createTransaction({
            accountId: card.id,
            kind: 'EXPENSE',
            amount: 20000,
            date: day('2026-10-05'),
            description: 'Compra parcelada',
            statementKey: '2026-11',
          })
          await prismaClientOf(uow.tx).cardPurchase.create({
            data: {
              id: purchaseId,
              userId,
              accountId: card.id,
              description: 'Compra parcelada',
              purchaseDate: day('2026-10-05'),
              totalAmount: 20000,
              installmentCount: 1,
            },
          })
          expect(t.transaction.id).toBeTruthy()
          throw new Error('falha injetada depois das escritas')
        }),
      ).rejects.toThrow('falha injetada')

      expect(await client.transaction.count({ where: { accountId: card.id } })).toBe(0)
      expect(await client.accountBalance.findUnique({ where: { accountId: card.id } })).toBeNull()
      expect(await client.cardPurchase.count({ where: { id: purchaseId } })).toBe(0)
    })

    it('CA-03: falha na escrita do módulo consumidor (FK inválida) desfaz o lançamento já feito', async () => {
      const card = await newAccount('Cartão', 'CREDIT_CARD')
      await expect(
        svc.runInTransaction(ctx, async (uow) => {
          await uow.createTransaction({
            accountId: card.id,
            kind: 'EXPENSE',
            amount: 20000,
            date: day('2026-10-05'),
            description: 'Compra',
          })
          await prismaClientOf(uow.tx).cardPurchase.create({
            data: {
              userId,
              accountId: 'conta-que-nao-existe',
              description: 'x',
              purchaseDate: day('2026-10-05'),
              totalAmount: 1,
              installmentCount: 1,
            },
          })
        }),
      ).rejects.toThrow()
      expect(await client.transaction.count({ where: { accountId: card.id } })).toBe(0)
      expect(await client.accountBalance.findUnique({ where: { accountId: card.id } })).toBeNull()
    })

    it('CA-03: sucesso grava lançamento, saldo e a compra juntos; leituras no uow veem as escritas', async () => {
      const card = await newAccount('Cartão', 'CREDIT_CARD')
      const purchaseId = randomUUID()
      const result = await svc.runInTransaction(ctx, async (uow) => {
        await prismaClientOf(uow.tx).cardPurchase.create({
          data: {
            id: purchaseId,
            userId,
            accountId: card.id,
            description: 'Compra',
            purchaseDate: day('2026-10-05'),
            totalAmount: 20000,
            installmentCount: 1,
          },
        })
        await uow.createTransaction({
          accountId: card.id,
          kind: 'EXPENSE',
          amount: 20000,
          date: day('2026-10-05'),
          description: 'Compra',
        })
        return uow.getAccountPosition(card.id)
      })
      expect(result.balanceCleared).toBe(-20000)
      expect(await client.cardPurchase.count({ where: { id: purchaseId } })).toBe(1)
      await expectCacheMatchesLedger(card.id)
    })

    it('retry de deadlock refaz a fn inteira e o resultado final não duplica (fn idempotente)', async () => {
      const acc = await newAccount('Corrente')
      let runs = 0
      const before = transactionCalls
      failFirstAttemptAfterFn = true
      await svc.runInTransaction(ctx, async (uow) => {
        runs += 1
        await uow.createTransaction({
          accountId: acc.id,
          kind: 'INCOME',
          amount: 800,
          date: day('2026-10-05'),
          description: 'Entrada',
        })
      })
      expect(runs).toBe(2)
      expect(transactionCalls - before).toBe(2)
      expect(await client.transaction.count({ where: { accountId: acc.id } })).toBe(1)
      await expectCacheMatchesLedger(acc.id)
    })

    it('CA-08: conta + AccountBalance + ADJUSTMENT inicial numa única unit of work', async () => {
      const accountId = randomUUID()
      const position = await svc.runInTransaction(ctx, async (uow) => {
        await prismaClientOf(uow.tx).account.create({
          data: { id: accountId, userId, name: `Nova ${accountId.slice(0, 8)}`, type: 'CHECKING' },
        })
        await uow.openAccountBalance(accountId)
        await uow.createTransaction({
          accountId,
          kind: 'ADJUSTMENT',
          amount: 123456,
          date: day('2026-10-05'),
          description: 'Saldo inicial',
          excludeFromBudget: true,
        })
        return uow.getAccountPosition(accountId)
      })
      expect(position.balanceCleared).toBe(123456)
      const txns = await client.transaction.findMany({ where: { accountId } })
      expect(txns).toHaveLength(1)
      expect(txns[0]).toMatchObject({
        kind: 'ADJUSTMENT',
        status: 'CLEARED',
        excludeFromBudget: true,
      })
      await expectCacheMatchesLedger(accountId)
    })

    it.each([
      'depois de criar a conta',
      'depois de abrir o saldo',
      'depois do ADJUSTMENT inicial',
    ] as const)(
      'CA-08: falha injetada %s não deixa conta sem saldo nem saldo sem conta',
      async (when) => {
        const accountId = randomUUID()
        await expect(
          svc.runInTransaction(ctx, async (uow) => {
            await prismaClientOf(uow.tx).account.create({
              data: {
                id: accountId,
                userId,
                name: `Falha ${accountId.slice(0, 8)}`,
                type: 'CHECKING',
              },
            })
            if (when === 'depois de criar a conta') throw new Error('falha injetada')
            await uow.openAccountBalance(accountId)
            if (when === 'depois de abrir o saldo') throw new Error('falha injetada')
            await uow.createTransaction({
              accountId,
              kind: 'ADJUSTMENT',
              amount: 5000,
              date: day('2026-10-05'),
              description: 'Saldo inicial',
              excludeFromBudget: true,
            })
            throw new Error('falha injetada')
          }),
        ).rejects.toThrow('falha injetada')
        expect(await client.account.count({ where: { id: accountId } })).toBe(0)
        expect(await client.accountBalance.count({ where: { accountId } })).toBe(0)
        expect(await client.transaction.count({ where: { accountId } })).toBe(0)
      },
    )

    it('openAccountBalance: idempotente, não altera linha existente e é seguro sob concorrência', async () => {
      const acc = await newAccount('Corrente')
      const before = transactionCalls
      const positions = await Promise.all(
        Array.from({ length: 8 }, () => svc.openAccountBalance(ctx, acc.id)),
      )
      expect(positions.every((p) => p.balanceCleared === 0)).toBe(true)
      expect(transactionCalls - before).toBe(8) // sem retry/deadlock
      expect(await client.accountBalance.count({ where: { accountId: acc.id } })).toBe(1)

      await svc.createTransaction(ctx, {
        accountId: acc.id,
        kind: 'INCOME',
        amount: 900,
        date: day('2026-10-05'),
        description: 'x',
      })
      const again = await svc.openAccountBalance(ctx, acc.id)
      expect(again.balanceCleared).toBe(900)
      await expect(svc.openAccountBalance(ctx, 'nao-existe')).rejects.toMatchObject({
        code: 'LEDGER_ACCOUNT_NOT_FOUND',
      })
    })

    // ---- CA-04: upsert por occurrenceKey -------------------------------------------------

    it('CA-04: duas chamadas não duplicam; valor novo atualiza o PLANNED e o balancePlanned', async () => {
      const acc = await newAccount('PJ')
      const key = `occ-${randomUUID()}`
      const input = {
        accountId: acc.id,
        kind: 'INCOME' as const,
        amount: 150000,
        date: day('2026-11-05'),
        description: 'Renda prevista',
        occurrenceKey: key,
      }
      const first = await svc.upsertPlannedByOccurrenceKey(ctx, input)
      expect(first).toMatchObject({ action: 'CREATED', skipped: null })
      expect(first.transaction).toMatchObject({ status: 'PLANNED', source: 'RECURRING' })
      const second = await svc.upsertPlannedByOccurrenceKey(ctx, input)
      expect(second.action).toBe('UNCHANGED')
      expect(await client.transaction.count({ where: { userId, occurrenceKey: key } })).toBe(1)

      const updated = await svc.upsertPlannedByOccurrenceKey(ctx, {
        ...input,
        amount: 172000,
        date: day('2026-11-06'),
      })
      expect(updated.action).toBe('UPDATED')
      const row = await client.accountBalance.findUniqueOrThrow({ where: { accountId: acc.id } })
      expect(row.balancePlanned).toBe(172000)
      expect(row.balanceCleared).toBe(0)
      await expectCacheMatchesLedger(acc.id)
    })

    it('CA-04: já CLEARED não altera e devolve skipped NOT_PLANNED', async () => {
      const acc = await newAccount('PJ')
      const key = `occ-${randomUUID()}`
      const input = {
        accountId: acc.id,
        kind: 'INCOME' as const,
        amount: 150000,
        date: day('2026-11-05'),
        description: 'Renda prevista',
        occurrenceKey: key,
      }
      const first = await svc.upsertPlannedByOccurrenceKey(ctx, input)
      await svc.changeTransactionStatus(ctx, first.transaction.id, 'CLEARED')
      const again = await svc.upsertPlannedByOccurrenceKey(ctx, { ...input, amount: 1 })
      expect(again).toMatchObject({ action: 'SKIPPED', skipped: 'NOT_PLANNED' })
      const row = await client.transaction.findUniqueOrThrow({
        where: { id: first.transaction.id },
      })
      expect(row).toMatchObject({ amount: 150000, status: 'CLEARED' })
      await expectCacheMatchesLedger(acc.id)
    })

    it('CA-04: 10 chamadas concorrentes com a mesma chave resultam em 1 lançamento e saldo correto', async () => {
      for (let round = 0; round < 5; round++) {
        const acc = await newAccount(`PJ ${round}`)
        const key = `occ-${randomUUID()}`
        const before = transactionCalls
        const results = await Promise.allSettled(
          Array.from({ length: 10 }, (_, i) =>
            svc.upsertPlannedByOccurrenceKey(ctx, {
              accountId: acc.id,
              kind: 'INCOME',
              amount: 150000 + (i % 3),
              date: day('2026-11-05'),
              description: 'Renda prevista',
              occurrenceKey: key,
            }),
          ),
        )
        expect(results.filter((r) => r.status === 'rejected')).toEqual([])
        expect(transactionCalls - before).toBe(10) // nenhum retry: sem deadlock mascarado
        const rows = await client.transaction.findMany({ where: { userId, occurrenceKey: key } })
        expect(rows).toHaveLength(1)
        const balance = await client.accountBalance.findUniqueOrThrow({
          where: { accountId: acc.id },
        })
        expect(balance.balancePlanned).toBe(rows[0]!.amount)
        await expectCacheMatchesLedger(acc.id)
      }
    })

    it('CA-04: lotes concorrentes com chaves em ordens cruzadas não geram deadlock', async () => {
      const acc = await newAccount('PJ lote')
      const keys = Array.from({ length: 6 }, (_, i) => `batch-${randomUUID()}-${i}`)
      const mk = (ordered: string[]) =>
        ordered.map((occurrenceKey, i) => ({
          accountId: acc.id,
          kind: 'INCOME' as const,
          amount: 1000 + i,
          date: day('2026-11-05'),
          description: `Renda ${occurrenceKey.slice(-1)}`,
          occurrenceKey,
        }))
      const before = transactionCalls
      const results = await Promise.allSettled([
        svc.upsertPlannedBatch(ctx, mk(keys)),
        svc.upsertPlannedBatch(ctx, mk([...keys].reverse())),
        svc.upsertPlannedBatch(ctx, mk([keys[3]!, keys[0]!, keys[5]!])),
        svc.upsertPlannedBatch(ctx, mk([keys[5]!, keys[1]!])),
      ])
      expect(results.filter((r) => r.status === 'rejected')).toEqual([])
      expect(transactionCalls - before).toBe(4)
      expect(await client.transaction.count({ where: { accountId: acc.id } })).toBe(6)
      await expectCacheMatchesLedger(acc.id)
    })

    it('upsert concorrente com confirmação (CLEARED): estado final consistente', async () => {
      for (let round = 0; round < 5; round++) {
        const acc = await newAccount(`PJ conf ${round}`)
        const key = `occ-${randomUUID()}`
        const input = {
          accountId: acc.id,
          kind: 'INCOME' as const,
          amount: 100000,
          date: day('2026-11-05'),
          description: 'Renda',
          occurrenceKey: key,
        }
        const first = await svc.upsertPlannedByOccurrenceKey(ctx, input)
        const results = await Promise.allSettled([
          svc.changeTransactionStatus(ctx, first.transaction.id, 'CLEARED'),
          svc.upsertPlannedByOccurrenceKey(ctx, { ...input, amount: 120000 }),
          svc.upsertPlannedByOccurrenceKey(ctx, { ...input, amount: 130000 }),
        ])
        expect(results.filter((r) => r.status === 'rejected')).toEqual([])
        expect(await client.transaction.count({ where: { accountId: acc.id } })).toBe(1)
        await expectCacheMatchesLedger(acc.id)
      }
    })

    it('o previsto criado dentro da unit of work desfaz junto quando a fn falha', async () => {
      const acc = await newAccount('PJ rollback')
      const key = `occ-${randomUUID()}`
      await expect(
        svc.runInTransaction(ctx, async (uow) => {
          await uow.upsertPlannedByOccurrenceKey({
            accountId: acc.id,
            kind: 'INCOME',
            amount: 1000,
            date: day('2026-11-05'),
            description: 'x',
            occurrenceKey: key,
          })
          throw new Error('falha injetada')
        }),
      ).rejects.toThrow('falha injetada')
      expect(await client.transaction.count({ where: { userId, occurrenceKey: key } })).toBe(0)
      expect(await client.accountBalance.findUnique({ where: { accountId: acc.id } })).toBeNull()
    })
  },
)

describe.runIf(!db)('ledger: unit of work e vínculos (DATABASE_URL_TEST)', () => {
  it.skip('pulado: defina DATABASE_URL_TEST (database descartável com "test" no nome e migrations aplicadas)', () => {})
})
