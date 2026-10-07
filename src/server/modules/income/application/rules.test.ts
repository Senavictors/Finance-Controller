import { describe, expect, it } from 'vitest'
import { expectCacheMatchesLedger } from '@/server/modules/ledger/testing'
import { day, makeIncomeEnv, sampleRule, type IncomeEnv } from './test-helpers'

async function planned(env: IncomeEnv) {
  const page = await env.svc.listTransactions(env.ctx, {
    occurrenceKeyPrefix: 'income:',
    limit: 100,
  })
  return [...page.items].sort((a, b) => a.date.getTime() - b.date.getTime())
}

const dates = (txns: Awaited<ReturnType<typeof planned>>) =>
  txns.map((t) => t.date.toISOString().slice(0, 10))

describe('createIncomeRule (CA-14)', () => {
  it('grava a regra normalizada e materializa o horizonte', async () => {
    const env = makeIncomeEnv()
    const result = await env.income.createIncomeRule(env.ctx, sampleRule({ weekdays: [4, 2, 3] }))
    expect(result.rule).toMatchObject({
      name: 'Renda mensal',
      weekdays: [2, 3, 4],
      paymentAdjust: 'NEXT_BUSINESS_DAY',
      additionalBasis: 'PREVIOUS_MONTH',
      isActive: true,
    })
    expect(result.warnings).toEqual([])
    expect(result.planned.created).toBe(3)
  })

  it.each([
    ['weekdays=[7]', { weekdays: [7] }],
    ['payDay=0', { payDay: 0 }],
    ['payDay=32', { payDay: 32 }],
    ['baseCents negativo', { baseCents: -1 }],
    ['perDayCents negativo', { perDayCents: -5 }],
    ['extraDaysOff inválido', { extraDaysOff: ['2026-02-30'] }],
  ])('%s => INCOME_INVALID_INPUT (400)', async (_label, patch) => {
    const env = makeIncomeEnv()
    await expect(env.income.createIncomeRule(env.ctx, sampleRule(patch))).rejects.toMatchObject({
      code: 'INCOME_INVALID_INPUT',
      category: 'INVALID',
    })
    expect(env.incomeRepo.rules.size).toBe(0)
  })

  it('conta destino de outro usuário => 404; inexistente => 404', async () => {
    const env = makeIncomeEnv()
    await expect(
      env.income.createIncomeRule(env.ctx, sampleRule({ destinationAccountId: 'other' })),
    ).rejects.toMatchObject({ code: 'INCOME_ACCOUNT_NOT_FOUND', category: 'NOT_FOUND' })
    await expect(
      env.income.createIncomeRule(env.ctx, sampleRule({ destinationAccountId: 'nada' })),
    ).rejects.toMatchObject({ code: 'INCOME_ACCOUNT_NOT_FOUND' })
  })

  it('conta não-BUSINESS grava com aviso INCOME_ACCOUNT_NOT_BUSINESS; cartão é recusado', async () => {
    const env = makeIncomeEnv()
    const result = await env.income.createIncomeRule(
      env.ctx,
      sampleRule({ destinationAccountId: 'pf' }),
    )
    expect(result.warnings.map((w) => w.code)).toEqual(['INCOME_ACCOUNT_NOT_BUSINESS'])
    expect(result.rule.destinationAccountId).toBe('pf')
    await expect(
      env.income.createIncomeRule(env.ctx, sampleRule({ destinationAccountId: 'card' })),
    ).rejects.toMatchObject({ code: 'INCOME_INVALID_INPUT' })
  })

  it('sem a categoria de sistema: grava e avisa CATEGORY_NOT_FOUND (previsto sem categoria)', async () => {
    const env = makeIncomeEnv()
    env.incomeRepo.categories.clear()
    const result = await env.income.createIncomeRule(env.ctx, sampleRule())
    expect(result.warnings.map((w) => w.code)).toEqual(['CATEGORY_NOT_FOUND'])
    expect((await planned(env))[0]?.categoryId).toBeNull()
  })
})

describe('updateIncomeRule', () => {
  it('recalcula os previstos futuros: valor muda no previsto PLANNED', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    const result = await env.income.updateIncomeRule(env.ctx, rule.id, { perDayCents: 5_000 })
    expect(result.planned).toMatchObject({ updated: 3, created: 0, removed: 0 })
    expect((await planned(env)).map((t) => t.amount)).toEqual([
      300_000 + 14 * 5_000,
      300_000 + 13 * 5_000,
      300_000 + 12 * 5_000,
    ])
    expectCacheMatchesLedger(env.repo)
  })

  it('mudar o dia de pagamento move os previstos (remove os antigos, cria os novos)', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    const result = await env.income.updateIncomeRule(env.ctx, rule.id, { payDay: 20 })
    expect(result.planned.removed).toBe(3)
    expect(dates(await planned(env))).toEqual(['2026-10-20', '2026-11-23', '2026-12-21'])
    expectCacheMatchesLedger(env.repo)
  })

  it('confirmados não são removidos nem alterados ao mudar a regra', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await planned(env)
    await env.income.confirmIncomeReceipt(env.ctx, { transactionId: first!.id })
    await env.income.updateIncomeRule(env.ctx, rule.id, { payDay: 20, baseCents: 400_000 })
    const txns = await planned(env)
    expect(txns[0]).toMatchObject({ status: 'CLEARED', amount: 356_000 })
    expect(dates(txns)).toEqual(['2026-10-15', '2026-10-20', '2026-11-23', '2026-12-21'])
  })

  it('previsto com campo travado pelo usuário não é removido nem sobrescrito', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await planned(env)
    await env.svc.updateTransaction(env.ctx, first!.id, { amount: 999_000 })
    await env.income.updateIncomeRule(env.ctx, rule.id, { payDay: 20 })
    const txns = await planned(env)
    expect(txns.find((t) => t.id === first!.id)?.amount).toBe(999_000)
  })

  it('endDate antes dos próximos pagamentos remove os que saem da vigência', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    await env.income.updateIncomeRule(env.ctx, rule.id, { endDate: day('2026-11-30') })
    expect(dates(await planned(env))).toEqual(['2026-10-15', '2026-11-16'])
    await env.income.updateIncomeRule(env.ctx, rule.id, { endDate: null })
    expect(dates(await planned(env))).toEqual(['2026-10-15', '2026-11-16', '2026-12-15'])
  })

  it('trocar a conta destino move os previstos e avisa se não for PJ', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    const result = await env.income.updateIncomeRule(env.ctx, rule.id, {
      destinationAccountId: 'pf',
    })
    expect(result.warnings.map((w) => w.code)).toEqual(['INCOME_ACCOUNT_NOT_BUSINESS'])
    expect((await planned(env)).every((t) => t.accountId === 'pf')).toBe(true)
    expect(env.repo.balances.get('pj')?.balancePlanned).toBe(0)
    expectCacheMatchesLedger(env.repo)
  })

  it('valida o patch, a conta e a propriedade da regra', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    await expect(
      env.income.updateIncomeRule(env.ctx, rule.id, { payDay: 40 }),
    ).rejects.toMatchObject({ code: 'INCOME_INVALID_INPUT' })
    await expect(
      env.income.updateIncomeRule(env.ctx, rule.id, { destinationAccountId: 'other' }),
    ).rejects.toMatchObject({ code: 'INCOME_ACCOUNT_NOT_FOUND' })
    await expect(
      env.income.updateIncomeRule(env.otherCtx, rule.id, { baseCents: 1 }),
    ).rejects.toMatchObject({ code: 'INCOME_RULE_NOT_FOUND' })
    await expect(
      env.income.updateIncomeRule(env.ctx, 'nao-existe', { baseCents: 1 }),
    ).rejects.toMatchObject({ code: 'INCOME_RULE_NOT_FOUND' })
    // nada mudou
    expect((await env.income.getIncomeRule(env.ctx, rule.id)).payDay).toBe(15)
  })
})

describe('archiveIncomeRule', () => {
  it('desativa e remove os previstos futuros; confirmados ficam', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await planned(env)
    await env.income.confirmIncomeReceipt(env.ctx, { transactionId: first!.id })
    const result = await env.income.archiveIncomeRule(env.ctx, rule.id)
    expect(result.rule.isActive).toBe(false)
    expect(result.planned.removed).toBe(2)
    expect((await planned(env)).map((t) => t.status)).toEqual(['CLEARED'])
    expect(await env.income.listIncomeRules(env.ctx, { activeOnly: true })).toEqual([])
    expect(await env.income.listIncomeRules(env.ctx)).toHaveLength(1)
    // materializar de novo não ressuscita
    await env.income.materializeIncome(env.ctx)
    expect(await planned(env)).toHaveLength(1)
  })

  it('regra de outro usuário => 404', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    await expect(env.income.archiveIncomeRule(env.otherCtx, rule.id)).rejects.toMatchObject({
      code: 'INCOME_RULE_NOT_FOUND',
    })
  })
})

describe('setAttendanceOverride', () => {
  it('false remove um dia e recalcula o previsto afetado; null restaura', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    // 13/10 (terça) conta para o pagamento de novembro (competência outubro)
    await env.income.setAttendanceOverride(env.ctx, {
      ruleId: rule.id,
      date: '2026-10-13',
      present: false,
    })
    expect((await planned(env)).map((t) => t.amount)).toEqual([356_000, 348_000, 348_000])
    const stored = await env.income.getIncomeRule(env.ctx, rule.id)
    expect(stored.attendanceOverrides).toEqual({ '2026-10-13': false })

    await env.income.setAttendanceOverride(env.ctx, {
      ruleId: rule.id,
      date: '2026-10-13',
      present: null,
    })
    expect((await planned(env)).map((t) => t.amount)).toEqual([356_000, 352_000, 348_000])
    expect((await env.income.getIncomeRule(env.ctx, rule.id)).attendanceOverrides).toEqual({})
  })

  it('true inclui o feriado trabalhado (segunda 12/10) no pagamento de novembro', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    await env.income.setAttendanceOverride(env.ctx, {
      ruleId: rule.id,
      date: '2026-10-12',
      present: true,
    })
    expect((await planned(env))[1]?.amount).toBe(352_000 + 4_000)
  })

  it('valida data, regra e dono', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    await expect(
      env.income.setAttendanceOverride(env.ctx, {
        ruleId: rule.id,
        date: '2026-02-30',
        present: true,
      }),
    ).rejects.toMatchObject({ code: 'INCOME_INVALID_INPUT' })
    await expect(
      env.income.setAttendanceOverride(env.ctx, { ruleId: 'x', date: '2026-10-13', present: true }),
    ).rejects.toMatchObject({ code: 'INCOME_RULE_NOT_FOUND' })
    await expect(
      env.income.setAttendanceOverride(env.otherCtx, {
        ruleId: rule.id,
        date: '2026-10-13',
        present: true,
      }),
    ).rejects.toMatchObject({ code: 'INCOME_RULE_NOT_FOUND' })
  })
})

describe('relógio e fuso', () => {
  it('a data de hoje vem do fuso de São Paulo, não do UTC (virada de dia)', async () => {
    // 01:30 UTC de 08/10 ainda é 22:30 de 07/10 em São Paulo
    const env = makeIncomeEnv('2026-10-08T01:30:00.000Z')
    await env.income.createIncomeRule(env.ctx, sampleRule({ payDay: 7 }))
    expect(dates(await planned(env))[0]).toBe('2026-10-07')
  })
})
