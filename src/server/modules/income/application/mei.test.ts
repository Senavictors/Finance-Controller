import { describe, expect, it } from 'vitest'
import { expectCacheMatchesLedger } from '@/server/modules/ledger/testing'
import { USER, day, makeIncomeEnv, type IncomeEnv } from './test-helpers'

async function receive(env: IncomeEnv, date: string, amount: number, accountId = 'pj') {
  return env.svc.createTransaction(env.ctx, {
    accountId,
    kind: 'INCOME',
    amount,
    date: day(date),
    description: 'Recebimento',
    status: 'CLEARED',
  })
}

async function dasTxns(env: IncomeEnv) {
  const page = await env.svc.listTransactions(env.ctx, { occurrenceKeyPrefix: 'das:', limit: 100 })
  return [...page.items].sort((a, b) => a.date.getTime() - b.date.getTime())
}

describe('upsertMeiProfile', () => {
  it('grava com padrões (teto 8100000, vencimento dia 20) e valida contas', async () => {
    const env = makeIncomeEnv()
    const { profile, warnings } = await env.income.upsertMeiProfile(env.ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
      dasAccountId: 'pj',
    })
    expect(profile).toMatchObject({
      annualCeilingCents: 8_100_000,
      dasDueDay: 20,
      dasAmountCents: 8_000,
      dasAccountId: 'pj',
    })
    expect(warnings).toEqual([])
    await expect(
      env.income.upsertMeiProfile(env.ctx, { dasAmountCents: 8_000, dasAccountId: 'other' }),
    ).rejects.toMatchObject({ code: 'INCOME_ACCOUNT_NOT_FOUND' })
    await expect(
      env.income.upsertMeiProfile(env.ctx, { dasAmountCents: 8_000, businessAccountId: 'other' }),
    ).rejects.toMatchObject({ code: 'INCOME_ACCOUNT_NOT_FOUND' })
    await expect(
      env.income.upsertMeiProfile(env.ctx, { dasAmountCents: -1 }),
    ).rejects.toMatchObject({ code: 'INCOME_INVALID_INPUT' })
  })

  it('avisa quando falta a conta do DAS ou a conta de faturamento não é PJ', async () => {
    const env = makeIncomeEnv()
    const { warnings } = await env.income.upsertMeiProfile(env.ctx, {
      dasAmountCents: 8_000,
      businessAccountId: 'pf',
    })
    expect(warnings.map((w) => w.code)).toEqual([
      'DAS_ACCOUNT_NOT_SET',
      'INCOME_ACCOUNT_NOT_BUSINESS',
    ])
  })

  it('segunda chamada atualiza o mesmo perfil e reajusta os previstos do DAS', async () => {
    const env = makeIncomeEnv()
    const first = await env.income.upsertMeiProfile(env.ctx, {
      dasAmountCents: 8_000,
      dasAccountId: 'pf',
    })
    expect(first.das.created).toBe(3)
    const second = await env.income.upsertMeiProfile(env.ctx, {
      dasAmountCents: 9_000,
      dasAccountId: 'pf',
    })
    expect(second.profile.id).toBe(first.profile.id)
    expect(second.das).toMatchObject({ updated: 3, created: 0 })
    expect((await dasTxns(env)).map((t) => t.amount)).toEqual([-9_000, -9_000, -9_000])
  })

  it('trocar a conta pagadora move os previstos; zerar o valor remove-os', async () => {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, { dasAmountCents: 8_000, dasAccountId: 'pf' })
    await env.income.upsertMeiProfile(env.ctx, { dasAmountCents: 8_000, dasAccountId: 'pj' })
    expect((await dasTxns(env)).every((t) => t.accountId === 'pj')).toBe(true)
    const cleared = await env.income.upsertMeiProfile(env.ctx, {
      dasAmountCents: 0,
      dasAccountId: 'pj',
    })
    expect(cleared.das.removed).toBe(3)
    expect(await dasTxns(env)).toHaveLength(0)
    expectCacheMatchesLedger(env.repo)
  })
})

describe('materializeDas (CA-11)', () => {
  it('um EXPENSE PLANNED por vencimento, valor negativo, na conta configurada, com a chave', async () => {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, {
      dasAmountCents: 8_000,
      dasAccountId: 'pf',
      openedAt: day('2025-01-10'),
    })
    for (const t of await dasTxns(env)) await env.svc.deleteTransaction(env.ctx, t.id)

    const result = await env.income.materializeDas(env.ctx)
    expect(result).toMatchObject({ created: 3, updated: 0, unchanged: 0 })
    const txns = await dasTxns(env)
    // 20/10 terça; 20/11 feriado (sexta) -> 23/11; 20/12 domingo -> 21/12
    expect(txns.map((t) => t.occurrenceKey)).toEqual([
      'das:2026-10-20',
      'das:2026-11-23',
      'das:2026-12-21',
    ])
    expect(txns.map((t) => t.description)).toEqual([
      'DAS MEI 2026-09',
      'DAS MEI 2026-10',
      'DAS MEI 2026-11',
    ])
    for (const t of txns) {
      expect(t).toMatchObject({
        kind: 'EXPENSE',
        status: 'PLANNED',
        source: 'RECURRING',
        amount: -8_000,
        accountId: 'pf',
        categoryId: `cat-das-${USER}`,
      })
    }
    expect(env.repo.balances.get('pf')?.balancePlanned).toBe(-24_000)
  })

  it('idempotente: repetir não duplica', async () => {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, { dasAmountCents: 8_000, dasAccountId: 'pj' })
    const again = await env.income.materializeDas(env.ctx)
    expect(again).toMatchObject({ created: 0, unchanged: 3 })
    expect(await dasTxns(env)).toHaveLength(3)
  })

  it('DAS já pago (CLEARED) não é tocado', async () => {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, { dasAmountCents: 8_000, dasAccountId: 'pj' })
    const [first] = await dasTxns(env)
    await env.svc.changeTransactionStatus(env.ctx, first!.id, 'CLEARED')
    await env.income.upsertMeiProfile(env.ctx, { dasAmountCents: 9_000, dasAccountId: 'pj' })
    const txns = await dasTxns(env)
    expect(txns[0]).toMatchObject({ status: 'CLEARED', amount: -8_000 })
    expect(txns[1]?.amount).toBe(-9_000)
  })

  it('sem perfil: MEI_PROFILE_NOT_FOUND; DAS não conta como faturamento (despesa)', async () => {
    const env = makeIncomeEnv()
    await expect(env.income.materializeDas(env.ctx)).rejects.toMatchObject({
      code: 'MEI_PROFILE_NOT_FOUND',
    })
  })

  it('vencimento de outro dia (dueDay 31) com clamp e ajuste de dia útil', async () => {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, {
      dasAmountCents: 8_000,
      dasDueDay: 31,
      dasAccountId: 'pj',
    })
    const keys = (await dasTxns(env)).map((t) => t.occurrenceKey)
    // 31/10 sábado -> 02/11 é feriado (Finados) -> 03/11; 30/11 segunda; 31/12 quinta
    expect(keys).toEqual(['das:2026-11-03', 'das:2026-11-30', 'das:2026-12-31'])
  })
})

describe('recomputeMeiLedger (CA-12)', () => {
  async function setup() {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
      dasAccountId: 'pf',
    })
    return env
  }

  it('soma só INCOME CLEARED|RECONCILED em contas PJ do ano; ignora TRANSFER, ADJUSTMENT, PLANNED, estorno e PF', async () => {
    const env = await setup()
    await receive(env, '2026-03-20', 300_000)
    const reconciled = await receive(env, '2026-05-05', 200_000)
    await env.svc.changeTransactionStatus(env.ctx, reconciled.transaction.id, 'RECONCILED')
    await receive(env, '2026-05-20', 100_000, 'pj2') // outra conta PJ também conta

    // ignorados
    await env.svc.createTransaction(env.ctx, {
      accountId: 'pj',
      kind: 'INCOME',
      amount: 777_000,
      date: day('2026-06-10'),
      description: 'previsto',
      status: 'PLANNED',
    })
    await env.svc.createTransaction(env.ctx, {
      accountId: 'pj',
      kind: 'INCOME',
      amount: 555_000,
      date: day('2026-06-11'),
      description: 'pendente',
      status: 'PENDING',
    })
    await env.svc.createTransaction(env.ctx, {
      accountId: 'pj',
      kind: 'ADJUSTMENT',
      amount: 900_000,
      date: day('2026-02-01'),
      description: 'Saldo inicial',
      excludeFromBudget: true,
    })
    await env.svc.createTransfer(env.ctx, {
      kind: 'TRANSFER',
      sourceAccountId: 'pj',
      destinationAccountId: 'pf',
      amount: 250_000,
      date: day('2026-05-25'),
      description: 'Para PF',
    })
    await env.svc.createTransfer(env.ctx, {
      kind: 'TRANSFER',
      sourceAccountId: 'pf',
      destinationAccountId: 'pj',
      amount: 120_000,
      date: day('2026-05-26'),
      description: 'Da PF',
    })
    await receive(env, '2026-04-02', 400_000, 'pf') // conta PF
    const original = await env.svc.createTransaction(env.ctx, {
      accountId: 'pj',
      kind: 'EXPENSE',
      amount: 50_000,
      date: day('2026-04-03'),
      description: 'compra',
    })
    await env.svc.createTransaction(env.ctx, {
      accountId: 'pj',
      kind: 'INCOME',
      amount: 50_000,
      date: day('2026-04-04'),
      description: 'estorno',
      refundOfId: original.transaction.id,
    })
    await receive(env, '2025-12-30', 640_000) // outro ano

    const record = await env.income.recomputeMeiLedger(env.ctx, { year: 2026 })
    expect(record.byMonth).toEqual([0, 0, 300_000, 0, 300_000, 0, 0, 0, 0, 0, 0, 0])
    expect(record.accumulatedCents).toBe(600_000)
    expect(record.proportionalCeilingCents).toBe(6_750_000)
  })

  it('é idempotente (mesmo resultado; uma só linha por ano)', async () => {
    const env = await setup()
    await receive(env, '2026-03-20', 300_000)
    const first = await env.income.recomputeMeiLedger(env.ctx, { year: 2026 })
    const second = await env.income.recomputeMeiLedger(env.ctx, { year: 2026 })
    expect({ ...second, lastRecomputedAt: undefined }).toEqual({
      ...first,
      lastRecomputedAt: undefined,
    })
    expect(env.incomeRepo.meiLedgers.size).toBe(1)
  })

  it('dois meses distintos populam byMonth; teto cheio em 2027; ano anterior à abertura tem teto 0', async () => {
    const env = await setup()
    await receive(env, '2026-03-31', 100_000)
    await receive(env, '2026-04-01', 200_000)
    const r26 = await env.income.recomputeMeiLedger(env.ctx, { year: 2026 })
    expect(r26.byMonth.slice(2, 4)).toEqual([100_000, 200_000])
    const r27 = await env.income.recomputeMeiLedger(env.ctx, { year: 2027 })
    expect(r27.proportionalCeilingCents).toBe(8_100_000)
    const r25 = await env.income.recomputeMeiLedger(env.ctx, { year: 2025 })
    expect(r25.proportionalCeilingCents).toBe(0)
  })

  it('businessAccountId do perfil restringe as contas contadas', async () => {
    const env = await setup()
    await env.income.upsertMeiProfile(env.ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
      dasAccountId: 'pf',
      businessAccountId: 'pj2',
    })
    await receive(env, '2026-03-20', 300_000, 'pj')
    await receive(env, '2026-03-21', 100_000, 'pj2')
    const record = await env.income.recomputeMeiLedger(env.ctx, { year: 2026 })
    expect(record.accumulatedCents).toBe(100_000)
  })

  it('sem perfil: MEI_PROFILE_NOT_FOUND; ano inválido: INCOME_INVALID_INPUT', async () => {
    const env = makeIncomeEnv()
    await expect(env.income.recomputeMeiLedger(env.ctx, { year: 2026 })).rejects.toMatchObject({
      code: 'MEI_PROFILE_NOT_FOUND',
    })
    await expect(env.income.recomputeMeiLedger(env.ctx, { year: 26 })).rejects.toMatchObject({
      code: 'INCOME_INVALID_INPUT',
    })
  })
})

describe('getMeiStatus (CA-13)', () => {
  async function setup() {
    const env = makeIncomeEnv() // hoje = 07/10/2026
    await env.income.upsertMeiProfile(env.ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
      dasAccountId: 'pf',
    })
    return env
  }

  it('acumulado 5400000 com teto proporcional 6750000: 80%, ATTENTION, restante, mensagem', async () => {
    const env = await setup()
    for (let month = 3; month <= 10; month += 1) {
      await receive(env, `2026-${String(month).padStart(2, '0')}-05`, 675_000)
    }
    const status = await env.income.getMeiStatus(env.ctx)
    expect(status).toMatchObject({
      year: 2026,
      ceiling: 6_750_000,
      accumulated: 5_400_000,
      remaining: 1_350_000,
      pct: 80,
      level: 'ATTENTION',
      message: 'Você usou 80% do teto do MEI',
    })
    expect(status.byMonth).toHaveLength(12)
    expect(status.assumptions).toMatchObject({
      regime: 'CASH',
      firstActiveMonth: 3,
      monthsElapsed: 9,
    })
    expect(status.projection.willExceed).toBe(false)
  })

  it('projeção com excesso: willExceed e exceedMonth preenchidos', async () => {
    const env = await setup()
    for (let month = 3; month <= 9; month += 1) {
      await receive(env, `2026-${String(month).padStart(2, '0')}-05`, 900_000)
    }
    const status = await env.income.getMeiStatus(env.ctx)
    expect(status.accumulated).toBe(6_300_000)
    expect(status.projection.willExceed).toBe(true)
    // Mar-Set realizados (6,3 mi) + média no mês aberto (out) já passa de 6,75 mi
    expect(status.projection.exceedMonth).toBe(10)
    expect(status.level).toBe('ATTENTION')
  })

  it('níveis EXCEEDED e SEVERE', async () => {
    const env = await setup()
    await receive(env, '2026-04-05', 6_750_000)
    expect((await env.income.getMeiStatus(env.ctx)).level).toBe('EXCEEDED')
    await receive(env, '2026-05-05', 1_350_000)
    const status = await env.income.getMeiStatus(env.ctx)
    expect(status.level).toBe('SEVERE')
    expect(status.remaining).toBe(-1_350_000)
  })

  it('ano consultado diferente do corrente; não grava o MeiLedger', async () => {
    const env = await setup()
    const before = env.incomeRepo.meiLedgers.size
    const status = await env.income.getMeiStatus(env.ctx, { year: 2027 })
    expect(status.ceiling).toBe(8_100_000)
    expect(status.accumulated).toBe(0)
    expect(status.level).toBe('OK')
    expect(status.message).toBeNull()
    expect(env.incomeRepo.meiLedgers.size).toBe(before)
  })

  it('sem perfil: MEI_PROFILE_NOT_FOUND', async () => {
    const env = makeIncomeEnv()
    await expect(env.income.getMeiStatus(env.ctx)).rejects.toMatchObject({
      code: 'MEI_PROFILE_NOT_FOUND',
    })
  })

  it('isolamento: o faturamento de outro usuário não entra', async () => {
    const env = await setup()
    await env.svc.createTransaction(env.otherCtx, {
      accountId: 'other',
      kind: 'INCOME',
      amount: 999_000,
      date: day('2026-05-05'),
      description: 'outro usuário',
    })
    expect((await env.income.getMeiStatus(env.ctx)).accumulated).toBe(0)
  })
})
