import type { Prisma, PrismaClient, Transaction } from '@/generated/prisma/client'
import type {
  BalanceRow,
  LedgerAccount,
  LedgerReader,
  LedgerRepository,
  LedgerTx,
  TxnListFilter,
  TxnPage,
  TxnPatch,
} from '../application/ports'
import {
  LedgerError,
  type Buckets,
  type LedgerTxn,
  type NewLedgerTxn,
  type UserLocked,
} from '../domain/types'
import { isMissingRowError, isRetryableConcurrencyError } from './concurrency'

type Db = PrismaClient | Prisma.TransactionClient

/** Tentativas por transação em caso de deadlock/serialização (1 retry). */
const MAX_ATTEMPTS = 2

function toUserLocked(value: Prisma.JsonValue): UserLocked {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const locked: UserLocked = {}
  for (const [key, flag] of Object.entries(value)) {
    if (flag === true) locked[key] = true
  }
  return locked
}

function toLedgerTxn(row: Transaction): LedgerTxn {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    categoryId: row.categoryId,
    merchantId: row.merchantId,
    kind: row.kind,
    status: row.status,
    review: row.review,
    source: row.source,
    amount: row.amount,
    date: row.date,
    postedDate: row.postedDate,
    description: row.description,
    rawDescription: row.rawDescription,
    notes: row.notes,
    tags: row.tags,
    transferId: row.transferId,
    excludeFromBudget: row.excludeFromBudget,
    userLocked: toUserLocked(row.userLocked),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toBalanceRow(row: {
  accountId: string
  userId: string
  balanceCleared: number
  balancePending: number
  balancePlanned: number
  version: number
}): BalanceRow {
  return {
    accountId: row.accountId,
    userId: row.userId,
    balanceCleared: row.balanceCleared,
    balancePending: row.balancePending,
    balancePlanned: row.balancePlanned,
    version: row.version,
  }
}

/** Leituras sobre o cliente (ou o cliente transacional). Sempre filtram por `userId` (RN-08). */
class PrismaLedgerReader implements LedgerReader {
  constructor(protected readonly db: Db) {}

  async findAccount(userId: string, accountId: string): Promise<LedgerAccount | null> {
    return this.db.account.findFirst({
      where: { id: accountId, userId },
      select: {
        id: true,
        userId: true,
        type: true,
        isArchived: true,
        overdraftLimit: true,
        creditLimit: true,
      },
    })
  }

  async listAccounts(
    userId: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<LedgerAccount[]> {
    return this.db.account.findMany({
      where: { userId, ...(opts.includeArchived ? {} : { isArchived: false }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        userId: true,
        type: true,
        isArchived: true,
        overdraftLimit: true,
        creditLimit: true,
      },
    })
  }

  async findBalance(userId: string, accountId: string): Promise<BalanceRow | null> {
    const row = await this.db.accountBalance.findFirst({ where: { accountId, userId } })
    return row ? toBalanceRow(row) : null
  }

  async listBalances(userId: string): Promise<BalanceRow[]> {
    const rows = await this.db.accountBalance.findMany({ where: { userId } })
    return rows.map(toBalanceRow)
  }

  async findTxn(userId: string, id: string): Promise<LedgerTxn | null> {
    const row = await this.db.transaction.findFirst({ where: { id, userId } })
    return row ? toLedgerTxn(row) : null
  }

  async findTransferLegs(userId: string, transferId: string): Promise<LedgerTxn[]> {
    const rows = await this.db.transaction.findMany({
      where: { userId, transferId },
      orderBy: [{ amount: 'asc' }, { id: 'asc' }],
    })
    return rows.map(toLedgerTxn)
  }

  async refsExist(
    userId: string,
    refs: { categoryId?: string | null; merchantId?: string | null },
  ): Promise<{ category: boolean; merchant: boolean }> {
    const [category, merchant] = await Promise.all([
      refs.categoryId
        ? this.db.category.count({ where: { id: refs.categoryId, userId } })
        : Promise.resolve(1),
      refs.merchantId
        ? this.db.merchant.count({ where: { id: refs.merchantId, userId } })
        : Promise.resolve(1),
    ])
    return { category: category > 0, merchant: merchant > 0 }
  }

  async listTransactions(userId: string, filter: TxnListFilter): Promise<TxnPage> {
    const q = filter.q?.trim()
    const rows = await this.db.transaction.findMany({
      where: {
        userId,
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.from || filter.to
          ? {
              date: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
        ...(q ? { description: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    })
    const items = rows.slice(0, filter.limit).map(toLedgerTxn)
    const hasMore = rows.length > filter.limit
    return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null }
  }
}

/** Escritas, só dentro de `$transaction`. Único lugar que escreve em `transactions`/`account_balances`. */
class PrismaLedgerTx extends PrismaLedgerReader implements LedgerTx {
  async lockTxns(userId: string, ids: string[]): Promise<LedgerTxn[]> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return []
    // Um único SELECT ... FOR UPDATE: o Postgres trava as linhas na ordem do ORDER BY (mesma
    // ordem para todas as transações), então pernas opostas de um par não geram deadlock. Em
    // READ COMMITTED, quem esperou o lock relê a versão commitada; a leitura abaixo vê o
    // mesmo estado e ninguém mais escreve nelas até o fim da transação.
    await this.db.$queryRaw`
      SELECT id FROM transactions
      WHERE user_id = ${userId} AND id = ANY(${unique}::text[])
      ORDER BY id
      FOR UPDATE`
    const rows = await this.db.transaction.findMany({
      where: { userId, id: { in: unique } },
      orderBy: { id: 'asc' },
    })
    return rows.map(toLedgerTxn)
  }

  async insertTxns(rows: NewLedgerTxn[]): Promise<LedgerTxn[]> {
    const inserted: LedgerTxn[] = []
    // Sequencial: preserva a ordem (origem/destino) e a atomicidade é da transação.
    for (const row of rows) {
      const created = await this.db.transaction.create({
        data: { ...row, userLocked: row.userLocked as Prisma.InputJsonObject },
      })
      inserted.push(toLedgerTxn(created))
    }
    return inserted
  }

  async updateTxn(userId: string, id: string, patch: TxnPatch): Promise<LedgerTxn> {
    const { userLocked, ...rest } = patch
    const updated = await this.db.transaction.update({
      where: { id, userId },
      data: {
        ...rest,
        ...(userLocked !== undefined ? { userLocked: userLocked as Prisma.InputJsonObject } : {}),
      },
    })
    return toLedgerTxn(updated)
  }

  async deleteTxns(userId: string, ids: string[]): Promise<number> {
    const { count } = await this.db.transaction.deleteMany({ where: { userId, id: { in: ids } } })
    return count
  }

  async incrementBalance(userId: string, accountId: string, delta: Buckets): Promise<BalanceRow> {
    // Incremento atômico no banco (UPDATE ... SET x = x + $d); nunca ler-somar-gravar.
    const row = await this.db.accountBalance.upsert({
      where: { accountId },
      create: {
        accountId,
        userId,
        balanceCleared: delta.cleared,
        balancePending: delta.pending,
        balancePlanned: delta.planned,
        version: 1,
      },
      update: {
        balanceCleared: { increment: delta.cleared },
        balancePending: { increment: delta.pending },
        balancePlanned: { increment: delta.planned },
        version: { increment: 1 },
      },
    })
    return toBalanceRow(row)
  }

  async setBalance(userId: string, accountId: string, buckets: Buckets): Promise<BalanceRow> {
    const row = await this.db.accountBalance.upsert({
      where: { accountId },
      create: {
        accountId,
        userId,
        balanceCleared: buckets.cleared,
        balancePending: buckets.pending,
        balancePlanned: buckets.planned,
        version: 1,
      },
      update: {
        balanceCleared: buckets.cleared,
        balancePending: buckets.pending,
        balancePlanned: buckets.planned,
      },
    })
    return toBalanceRow(row)
  }

  async sumByBucket(userId: string, accountId: string): Promise<Buckets> {
    const groups = await this.db.transaction.groupBy({
      by: ['status'],
      where: { userId, accountId },
      _sum: { amount: true },
    })
    const total: Buckets = { cleared: 0, pending: 0, planned: 0 }
    for (const group of groups) {
      const sum = group._sum.amount ?? 0
      if (group.status === 'PLANNED') total.planned += sum
      else if (group.status === 'PENDING') total.pending += sum
      else total.cleared += sum
    }
    return total
  }
}

export class PrismaLedgerRepository extends PrismaLedgerReader implements LedgerRepository {
  constructor(private readonly client: PrismaClient) {
    super(client)
  }

  /**
   * Transação interativa. Deadlock/serialização (40P01/40001/P2034) refaz a transação inteira
   * uma vez (já foi desfeita); persistindo, e em mutação concorrente sobre linha que sumiu
   * (P2025), vira `LEDGER_CONCURRENT_UPDATE` (409) em vez de 500.
   */
  async withTransaction<T>(fn: (tx: LedgerTx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.client.$transaction((tx) => fn(new PrismaLedgerTx(tx)), {
          maxWait: 5_000,
          timeout: 15_000,
        })
      } catch (error) {
        const retryable = isRetryableConcurrencyError(error)
        if (retryable && attempt < MAX_ATTEMPTS) continue
        if (retryable || isMissingRowError(error)) {
          throw new LedgerError(
            'LEDGER_CONCURRENT_UPDATE',
            'O lançamento foi alterado por outra requisição ao mesmo tempo. Tente novamente.',
          )
        }
        throw error
      }
    }
  }
}
