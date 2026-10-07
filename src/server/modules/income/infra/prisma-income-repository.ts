import type { PrismaClient } from '@/generated/prisma/client'
import { prismaClientOf, type ConsumerTransactionClient } from '@/server/modules/ledger'
import type { TransactionHandle } from '@/server/modules/ledger'
import type {
  IncomeAccountRef,
  IncomeRepository,
  IncomeRuleRecord,
  MeiLedgerRecord,
  MeiProfileRecord,
} from '../application/ports'

/**
 * Repositório Prisma do módulo de renda. Recebe o cliente por parâmetro (app usa `@/server/db`;
 * testes de integração usam `getTestDb()`). Toda consulta filtra por `userId`. Com `tx` (handle
 * da unit of work do ledger) lê/escreve na MESMA transação; nunca toca `transactions` nem
 * `account_balances` (só o ledger).
 */
type Db = Pick<
  ConsumerTransactionClient,
  'incomeRule' | 'meiProfile' | 'meiLedger' | 'account' | 'category' | '$queryRaw'
>

type RuleRow = Awaited<ReturnType<Db['incomeRule']['findFirstOrThrow']>>

function toRule(row: RuleRow): IncomeRuleRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    baseCents: row.baseCents,
    perDayCents: row.perDayCents,
    weekdays: [...row.weekdays].sort((a, b) => a - b),
    payDay: row.payDay,
    paymentAdjust: row.paymentAdjust,
    additionalBasis: row.additionalBasis,
    destinationAccountId: row.destinationAccountId,
    extraDaysOff: [...row.extraDaysOff].sort(),
    attendanceOverrides: toOverrides(row.attendanceOverrides),
    startDate: row.startDate,
    endDate: row.endDate,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toOverrides(value: unknown): Record<string, boolean> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, boolean> = {}
  for (const [key, flag] of Object.entries(value)) {
    if (typeof flag === 'boolean') result[key] = flag
  }
  return result
}

function toNumbers(value: unknown): number[] {
  const list = Array.isArray(value) ? value : []
  return Array.from({ length: 12 }, (_, i) => (typeof list[i] === 'number' ? list[i] : 0))
}

export function createPrismaIncomeRepository(client: PrismaClient): IncomeRepository {
  const dbOf = (tx?: TransactionHandle): Db => (tx ? prismaClientOf(tx) : client)

  return {
    async findAccount(userId, accountId): Promise<IncomeAccountRef | null> {
      const row = await client.account.findFirst({
        where: { id: accountId, userId },
        select: { id: true, userId: true, type: true, isArchived: true },
      })
      return row
    },

    async listBusinessAccountIds(userId) {
      const rows = await client.account.findMany({
        where: { userId, type: 'BUSINESS' },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
      return rows.map((r) => r.id)
    },

    async resolveCategoryId(userId, key) {
      const row = await client.category.findFirst({
        where: { userId, key, isArchived: false },
        select: { id: true },
      })
      return row?.id ?? null
    },

    async listRules(userId, opts = {}) {
      const rows = await client.incomeRule.findMany({
        where: { userId, ...(opts.activeOnly ? { isActive: true } : {}) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
      return rows.map(toRule)
    },

    async findRule(userId, id) {
      const row = await client.incomeRule.findFirst({ where: { id, userId } })
      return row ? toRule(row) : null
    },

    async lockRules(userId, opts, tx) {
      const db = dbOf(tx)
      const ruleId = opts.ruleId ?? null
      const activeOnly = opts.activeOnly === true
      // Trava em ordem de id (mesma ordem em todos os use-cases) antes de ler o estado commitado.
      const locked = await db.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM income_rules
        WHERE user_id = ${userId}
          AND (${ruleId}::text IS NULL OR id = ${ruleId})
          AND (${!activeOnly}::boolean OR is_active = true)
        ORDER BY id
        FOR UPDATE`
      if (locked.length === 0) return []
      const rows = await db.incomeRule.findMany({
        where: { userId, id: { in: locked.map((r) => r.id) } },
        orderBy: { id: 'asc' },
      })
      return rows.map(toRule)
    },

    async insertRule(rule, tx) {
      const row = await dbOf(tx).incomeRule.create({
        data: {
          id: rule.id,
          userId: rule.userId,
          name: rule.name,
          baseCents: rule.baseCents,
          perDayCents: rule.perDayCents,
          weekdays: rule.weekdays,
          payDay: rule.payDay,
          paymentAdjust: rule.paymentAdjust,
          additionalBasis: rule.additionalBasis,
          destinationAccountId: rule.destinationAccountId,
          extraDaysOff: rule.extraDaysOff,
          attendanceOverrides: rule.attendanceOverrides,
          startDate: rule.startDate,
          endDate: rule.endDate,
          isActive: rule.isActive,
        },
      })
      return toRule(row)
    },

    async updateRule(userId, id, patch, tx) {
      const db = dbOf(tx)
      const result = await db.incomeRule.updateMany({ where: { id, userId }, data: patch })
      if (result.count !== 1) throw new Error('income_rule não encontrada para atualização')
      return toRule(await db.incomeRule.findFirstOrThrow({ where: { id, userId } }))
    },

    async findProfile(userId) {
      return client.meiProfile.findUnique({ where: { userId } })
    },

    async lockProfile(userId, tx) {
      const db = dbOf(tx)
      const locked = await db.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM mei_profiles WHERE user_id = ${userId} FOR UPDATE`
      if (locked.length === 0) return null
      return db.meiProfile.findUnique({ where: { userId } })
    },

    async upsertProfile(userId, id, data, tx): Promise<MeiProfileRecord> {
      return dbOf(tx).meiProfile.upsert({
        where: { userId },
        create: { id, userId, ...data },
        update: data,
      })
    },

    async findMeiLedger(userId, year) {
      const row = await client.meiLedger.findUnique({ where: { userId_year: { userId, year } } })
      return row ? toMeiLedger(row) : null
    },

    async upsertMeiLedger(record, tx) {
      const data = {
        accumulatedCents: record.accumulatedCents,
        proportionalCeilingCents: record.proportionalCeilingCents,
        byMonth: record.byMonth,
        lastRecomputedAt: record.lastRecomputedAt,
      }
      const row = await dbOf(tx).meiLedger.upsert({
        where: { userId_year: { userId: record.userId, year: record.year } },
        create: { userId: record.userId, year: record.year, ...data },
        update: data,
      })
      return toMeiLedger(row)
    },
  }
}

function toMeiLedger(row: {
  userId: string
  year: number
  accumulatedCents: number
  proportionalCeilingCents: number
  byMonth: unknown
  lastRecomputedAt: Date
}): MeiLedgerRecord {
  return {
    userId: row.userId,
    year: row.year,
    accumulatedCents: row.accumulatedCents,
    proportionalCeilingCents: row.proportionalCeilingCents,
    byMonth: toNumbers(row.byMonth),
    lastRecomputedAt: row.lastRecomputedAt,
  }
}
