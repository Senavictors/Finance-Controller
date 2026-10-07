import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computeBalancesFromRows } from './integration-helpers'
import { getTestDb } from '../../../../../tests/helpers/db'

/**
 * FC2-F1-06 no Postgres real: previstos idempotentes sob concorrência, unicidade de
 * `(userId, occurrenceKey)`, atomicidade da regra + ledger e recálculo do `MeiLedger`.
 * Só roda com `DATABASE_URL_TEST` (database descartável). O ledger real é o do app
 * (`getLedgerService`), ligado ao banco de teste pelo mock de `@/server/db`.
 */
const db = getTestDb()

vi.mock('@/server/db', async () => {
  const { getTestDb: testDb } = await import('../../../../../tests/helpers/db')
  return { prisma: testDb() }
})

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe.skipIf(!db)('renda MEI (DATABASE_URL_TEST)', { timeout: 60_000 }, () => {
  const client = db!
  let userId = `inc-user-${randomUUID()}`
  const otherUserId = `inc-other-${randomUUID()}`
  let ctx = { userId }
  let income: Awaited<ReturnType<typeof makeService>>['income']
  let ledger: Awaited<ReturnType<typeof makeService>>['ledger']
  let pj: string
  let pf: string

  async function makeService() {
    const { getLedgerService } = await import('@/server/modules/ledger/service')
    const { createPrismaIncomeRepository } = await import('./prisma-income-repository')
    const { createIncomeService } = await import('../application/income-service')
    const ledgerService = getLedgerService()
    return {
      ledger: ledgerService,
      income: createIncomeService({
        repo: createPrismaIncomeRepository(client),
        ledger: ledgerService,
        clock: () => new Date('2026-10-07T15:00:00.000Z'),
        newId: () => randomUUID(),
      }),
    }
  }

  async function newAccount(
    owner: string,
    name: string,
    type: 'BUSINESS' | 'CHECKING',
    archived = false,
  ) {
    return client.account.create({
      data: {
        userId: owner,
        name: `${name} ${randomUUID().slice(0, 8)}`,
        type,
        isArchived: archived,
      },
    })
  }

  const rule = (over: Record<string, unknown> = {}) => ({
    name: 'Renda mensal',
    baseCents: 300_000,
    perDayCents: 4_000,
    weekdays: [2, 3, 4],
    payDay: 15,
    destinationAccountId: pj,
    startDate: day('2026-01-01'),
    ...over,
  })

  async function plannedIncome() {
    return client.transaction.findMany({
      where: { userId, occurrenceKey: { startsWith: 'income:' } },
      orderBy: { date: 'asc' },
    })
  }

  async function expectCache(accountId: string) {
    const txns = await client.transaction.findMany({ where: { accountId } })
    const row = await client.accountBalance.findUnique({ where: { accountId } })
    expect(
      row
        ? { cleared: row.balanceCleared, pending: row.balancePending, planned: row.balancePlanned }
        : { cleared: 0, pending: 0, planned: 0 },
    ).toEqual(computeBalancesFromRows(txns))
  }

  beforeAll(async () => {
    await client.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.invalid`, password: 'x' },
        { id: otherUserId, email: `${otherUserId}@example.invalid`, password: 'x' },
      ],
    })
    for (const owner of [userId, otherUserId]) {
      await client.category.createMany({
        data: [
          { userId: owner, key: 'renda-mei', name: 'Renda MEI', type: 'INCOME', isSystem: true },
          { userId: owner, key: 'das-mei', name: 'DAS do MEI', type: 'EXPENSE', isSystem: true },
        ],
      })
    }
    pj = (await newAccount(userId, 'PJ', 'BUSINESS')).id
    pf = (await newAccount(userId, 'PF', 'CHECKING')).id
    ;({ income, ledger } = await makeService())
  })

  afterAll(async () => {
    await client.user.deleteMany({ where: { id: { startsWith: 'inc-' } } })
    await client.$disconnect()
  })

  it('cria a regra, materializa o horizonte e persiste JSON/arrays corretamente', async () => {
    const created = await income.createIncomeRule(ctx, rule())
    expect(created.planned.created).toBe(3)
    const txns = await plannedIncome()
    expect(txns.map((t) => t.amount)).toEqual([356_000, 352_000, 348_000])
    expect(txns.every((t) => t.status === 'PLANNED' && t.kind === 'INCOME')).toBe(true)
    expect(txns[0]?.occurrenceKey).toBe(`income:${created.rule.id}:2026-10-15`)
    expect(txns[0]?.categoryId).not.toBeNull()
    await expectCache(pj)

    const withOverride = await income.setAttendanceOverride(ctx, {
      ruleId: created.rule.id,
      date: '2026-10-13',
      present: false,
    })
    expect(withOverride.rule.attendanceOverrides).toEqual({ '2026-10-13': false })
    expect((await plannedIncome()).map((t) => t.amount)).toEqual([356_000, 348_000, 348_000])
    const reloaded = await income.getIncomeRule(ctx, created.rule.id)
    expect(reloaded.weekdays).toEqual([2, 3, 4])
    await income.archiveIncomeRule(ctx, created.rule.id)
    expect(await plannedIncome()).toHaveLength(0)
    await expectCache(pj)
  })

  it('duas chamadas concorrentes de materializeIncome resultam em 1 lançamento por data', async () => {
    const { rule: r } = await income.createIncomeRule(ctx, rule({ name: 'Concorrência' }))
    await ledger.runInTransaction(ctx, async (uow) => {
      for (const t of (await uow.listTransactions({ occurrenceKeyPrefix: `income:${r.id}:` }))
        .items) {
        await uow.deleteTransaction(t.id)
      }
    })
    expect((await plannedIncome()).filter((t) => t.occurrenceKey?.includes(r.id))).toHaveLength(0)

    const results = await Promise.allSettled([
      income.materializeIncome(ctx),
      income.materializeIncome(ctx),
      income.materializeIncome(ctx),
    ])
    expect(results.every((x) => x.status === 'fulfilled')).toBe(true)
    const mine = (await plannedIncome()).filter((t) =>
      t.occurrenceKey?.startsWith(`income:${r.id}:`),
    )
    expect(mine).toHaveLength(3)
    expect(new Set(mine.map((t) => t.occurrenceKey)).size).toBe(3)
    const created = results.reduce(
      (sum, x) => sum + (x.status === 'fulfilled' ? x.value.created : 0),
      0,
    )
    expect(created).toBe(3)
    await expectCache(pj)
  })

  it('materializeIncome concorrente com updateIncomeRule não duplica nem trava', async () => {
    const { rule: r } = await income.createIncomeRule(ctx, rule({ name: 'Update concorrente' }))
    const results = await Promise.allSettled([
      income.updateIncomeRule(ctx, r.id, { perDayCents: 5_000 }),
      income.materializeIncome(ctx),
      income.updateIncomeRule(ctx, r.id, { baseCents: 310_000 }),
      income.materializeIncome(ctx),
    ])
    expect(results.map((x) => x.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ])
    const mine = (await plannedIncome()).filter((t) =>
      t.occurrenceKey?.startsWith(`income:${r.id}:`),
    )
    expect(mine).toHaveLength(3)
    // estado final = regra final (perDay 5000, base 310000), sem previsto defasado
    expect(mine.map((t) => t.amount)).toEqual([
      310_000 + 14 * 5_000,
      310_000 + 13 * 5_000,
      310_000 + 12 * 5_000,
    ])
    await expectCache(pj)
  })

  it('unique (userId, occurrenceKey): duplicata no mesmo usuário é barrada; outro usuário pode repetir', async () => {
    const other = await newAccount(otherUserId, 'PJ outro', 'BUSINESS')
    const base = {
      kind: 'INCOME' as const,
      amount: 1_000,
      date: day('2026-11-02'),
      description: 'x',
      status: 'PLANNED' as const,
      occurrenceKey: 'income:manual:2026-11-02',
    }
    await ledger.createTransaction(ctx, { ...base, accountId: pj })
    await expect(ledger.createTransaction(ctx, { ...base, accountId: pj })).rejects.toMatchObject({
      code: 'LEDGER_DUPLICATE_KEY',
    })
    await expect(
      ledger.createTransaction({ userId: otherUserId }, { ...base, accountId: other.id }),
    ).resolves.toBeDefined()
  })

  it('regra + previstos desfazem juntos quando o ledger falha (conta arquivada)', async () => {
    const archived = await newAccount(userId, 'PJ arquivada', 'BUSINESS', true)
    const before = await client.incomeRule.count({ where: { userId } })
    await expect(
      income.createIncomeRule(ctx, rule({ name: 'Falha', destinationAccountId: archived.id })),
    ).rejects.toMatchObject({ code: 'LEDGER_ACCOUNT_ARCHIVED' })
    expect(await client.incomeRule.count({ where: { userId } })).toBe(before)
  })

  it('conta de outro usuário => INCOME_ACCOUNT_NOT_FOUND; outra regra de outro usuário => 404', async () => {
    const other = await newAccount(otherUserId, 'PJ alheia', 'BUSINESS')
    await expect(
      income.createIncomeRule(ctx, rule({ destinationAccountId: other.id })),
    ).rejects.toMatchObject({ code: 'INCOME_ACCOUNT_NOT_FOUND' })
    const mine = await client.incomeRule.findFirstOrThrow({ where: { userId } })
    await expect(
      income.updateIncomeRule({ userId: otherUserId }, mine.id, { baseCents: 1 }),
    ).rejects.toMatchObject({ code: 'INCOME_RULE_NOT_FOUND' })
  })

  it('perfil do MEI, DAS e fluxo de confirmação: baixa o previsto, soma o MeiLedger e o status', async () => {
    // usuario novo: o fluxo parte de um ledger vazio (so o modulo ledger escreve em transactions)
    userId = `inc-flow-${randomUUID()}`
    ctx = { userId }
    await client.user.create({
      data: { id: userId, email: `${userId}@example.invalid`, password: 'x' },
    })
    await client.category.createMany({
      data: [
        { userId, key: 'renda-mei', name: 'Renda MEI', type: 'INCOME', isSystem: true },
        { userId, key: 'das-mei', name: 'DAS do MEI', type: 'EXPENSE', isSystem: true },
      ],
    })
    pj = (await newAccount(userId, 'PJ fluxo', 'BUSINESS')).id
    pf = (await newAccount(userId, 'PF fluxo', 'CHECKING')).id

    const { profile, das } = await income.upsertMeiProfile(ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
      dasAccountId: pf,
    })
    expect(profile.annualCeilingCents).toBe(8_100_000)
    expect(das.created).toBe(3)
    const dasTxns = await client.transaction.findMany({
      where: { userId, occurrenceKey: { startsWith: 'das:' } },
      orderBy: { date: 'asc' },
    })
    expect(dasTxns.map((t) => t.occurrenceKey)).toEqual([
      'das:2026-10-20',
      'das:2026-11-23',
      'das:2026-12-21',
    ])
    expect(dasTxns.every((t) => t.amount === -8_000 && t.status === 'PLANNED')).toBe(true)
    expect((await income.materializeDas(ctx)).unchanged).toBe(3)

    const { rule: r } = await income.createIncomeRule(ctx, rule({ name: 'Fluxo' }))
    const [first, second] = (await plannedIncome()).filter((t) =>
      t.occurrenceKey?.startsWith(`income:${r.id}:`),
    )
    // duas confirmações simultâneas: o MeiLedger final precisa somar as duas
    await Promise.all([
      income.confirmIncomeReceipt(ctx, {
        transactionId: first!.id,
        receivedAmount: 340_000,
        receivedDate: day('2026-10-16'),
      }),
      income.confirmIncomeReceipt(ctx, { transactionId: second!.id, receivedAmount: 350_000 }),
    ])
    const confirmed = await client.transaction.findUniqueOrThrow({ where: { id: first!.id } })
    expect(confirmed).toMatchObject({ status: 'CLEARED', amount: 340_000 })
    expect(confirmed.notes).toContain('Previsto: R$ 3.560,00 em 2026-10-15')
    await expectCache(pj)

    const ledgerRow = await client.meiLedger.findUniqueOrThrow({
      where: { userId_year: { userId, year: 2026 } },
    })
    expect(ledgerRow.accumulatedCents).toBe(690_000)
    expect(ledgerRow.proportionalCeilingCents).toBe(6_750_000)
    expect(ledgerRow.byMonth).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 340_000, 350_000, 0])

    // recálculo é idempotente e ignora transferência PJ -> PF
    await ledger.createTransfer(ctx, {
      kind: 'TRANSFER',
      sourceAccountId: pj,
      destinationAccountId: pf,
      amount: 500_000,
      date: day('2026-10-20'),
      description: 'Para PF',
    })
    const again = await income.recomputeMeiLedger(ctx, { year: 2026 })
    expect(again.accumulatedCents).toBe(690_000)
    expect(await client.meiLedger.count({ where: { userId, year: 2026 } })).toBe(1)

    const status = await income.getMeiStatus(ctx)
    expect(status).toMatchObject({
      ceiling: 6_750_000,
      accumulated: 690_000,
      level: 'OK',
      remaining: 6_060_000,
    })
    await expectCache(pj)
    await expectCache(pf)
  })
})
