import { describe, expect, it } from 'vitest'
import { expectCacheMatchesLedger, ledgerErrorCode } from '@/server/modules/ledger/testing'
import { IncomeError } from '../domain/errors'
import { USER, day, makeIncomeEnv, sampleRule } from './test-helpers'

async function plannedIncome(env: ReturnType<typeof makeIncomeEnv>) {
  const page = await env.svc.listTransactions(env.ctx, {
    occurrenceKeyPrefix: 'income:',
    limit: 100,
  })
  return [...page.items].sort((a, b) => a.date.getTime() - b.date.getTime())
}

describe('materializeIncome (CA-09)', () => {
  it('cria um PLANNED INCOME por pagamento do horizonte, na conta destino, com a chave esperada', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    // createIncomeRule já materializa; limpar para provar a materialização explícita
    for (const t of await plannedIncome(env)) await env.svc.deleteTransaction(env.ctx, t.id)

    const result = await env.income.materializeIncome(env.ctx)
    expect(result).toMatchObject({ created: 3, updated: 0, unchanged: 0, skipped: 0, removed: 0 })

    const txns = await plannedIncome(env)
    expect(txns.map((t) => t.occurrenceKey)).toEqual([
      `income:${rule.id}:2026-10-15`,
      `income:${rule.id}:2026-11-16`,
      `income:${rule.id}:2026-12-15`,
    ])
    expect(txns.map((t) => t.date.toISOString().slice(0, 10))).toEqual([
      '2026-10-15',
      '2026-11-16',
      '2026-12-15',
    ])
    // out/15: competência setembro (14 dias) | nov/16: outubro (13) | dez/15: novembro (12)
    expect(txns.map((t) => t.amount)).toEqual([356_000, 352_000, 348_000])
    for (const t of txns) {
      expect(t).toMatchObject({
        kind: 'INCOME',
        status: 'PLANNED',
        source: 'RECURRING',
        accountId: 'pj',
        categoryId: `cat-renda-${USER}`,
      })
    }
    expect(txns[0]?.description).toBe('Renda prevista 2026-10')
    expect(env.repo.balances.get('pj')).toMatchObject({
      balancePlanned: 356_000 + 352_000 + 348_000,
      balanceCleared: 0,
    })
    expectCacheMatchesLedger(env.repo)
  })

  it('chamar duas vezes não duplica', async () => {
    const env = makeIncomeEnv()
    await env.income.createIncomeRule(env.ctx, sampleRule())
    const again = await env.income.materializeIncome(env.ctx)
    const third = await env.income.materializeIncome(env.ctx)
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 3, removed: 0 })
    expect(third.unchanged).toBe(3)
    expect(await plannedIncome(env)).toHaveLength(3)
  })

  it('alterar perDayCents e materializar de novo atualiza o previsto ainda PLANNED', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    // mudança direta no repositório (como um job veria depois de outra via de edição)
    env.incomeRepo.rules.set(rule.id, { ...rule, perDayCents: 5_000 })

    const result = await env.income.materializeIncome(env.ctx)
    expect(result).toMatchObject({ created: 0, updated: 3, unchanged: 0 })
    expect((await plannedIncome(env)).map((t) => t.amount)).toEqual([
      300_000 + 14 * 5_000,
      300_000 + 13 * 5_000,
      300_000 + 12 * 5_000,
    ])
    expectCacheMatchesLedger(env.repo)
  })

  it('um previsto já CLEARED não é alterado', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await plannedIncome(env)
    await env.income.confirmIncomeReceipt(env.ctx, { transactionId: first!.id })
    env.incomeRepo.rules.set(rule.id, { ...rule, perDayCents: 5_000 })

    const result = await env.income.materializeIncome(env.ctx)
    expect(result).toMatchObject({ updated: 2, skipped: 1 })
    const txns = await plannedIncome(env)
    expect(txns[0]).toMatchObject({ status: 'CLEARED', amount: 356_000 })
    expect(txns[1]?.amount).toBe(300_000 + 13 * 5_000)
  })

  it('pagamento de hoje conta (não é passado); pagamentos passados não são criados', async () => {
    const env = makeIncomeEnv() // hoje = 07/10/2026
    await env.income.createIncomeRule(env.ctx, sampleRule({ payDay: 7 }))
    const keys = (await plannedIncome(env)).map((t) => t.date.toISOString().slice(0, 10))
    expect(keys).toEqual(
      ['2026-10-07', '2026-11-09', '2026-12-07', '2027-01-07'].slice(0, keys.length),
    )
    expect(keys[0]).toBe('2026-10-07')
    expect(keys).not.toContain('2026-09-07')
  })

  it('horizonte `until` explícito', async () => {
    const env = makeIncomeEnv()
    await env.income.createIncomeRule(env.ctx, sampleRule())
    const result = await env.income.materializeIncome(env.ctx, { until: day('2027-03-31') })
    expect(result.created).toBe(3) // jan, fev, mar/2027 (os 3 de 2026 já existiam)
    expect(await plannedIncome(env)).toHaveLength(6)
  })

  it('regra com total zero não gera previsto; sem regras ativas não faz nada', async () => {
    const env = makeIncomeEnv()
    await env.income.createIncomeRule(env.ctx, sampleRule({ baseCents: 0, weekdays: [] }))
    expect(await plannedIncome(env)).toHaveLength(0)
    const result = await env.income.materializeIncome(env.otherCtx)
    expect(result).toMatchObject({ created: 0, rules: 0 })
  })

  it('campo editado pelo usuário vence (userLocked): o previsto editado não é sobrescrito', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await plannedIncome(env)
    await env.svc.updateTransaction(env.ctx, first!.id, { amount: 999_000 })
    env.incomeRepo.rules.set(rule.id, { ...rule, perDayCents: 5_000 })

    await env.income.materializeIncome(env.ctx)
    const txns = await plannedIncome(env)
    expect(txns[0]?.amount).toBe(999_000)
    expect(txns[1]?.amount).toBe(300_000 + 13 * 5_000)
  })

  it('isolamento: materializar outro usuário não toca nos meus previstos', async () => {
    const env = makeIncomeEnv()
    await env.income.createIncomeRule(env.ctx, sampleRule())
    await env.income.materializeIncome(env.otherCtx)
    expect(await plannedIncome(env)).toHaveLength(3)
  })

  it('SAME_MONTH usa os dias do mês do pagamento', async () => {
    const env = makeIncomeEnv()
    await env.income.createIncomeRule(env.ctx, sampleRule({ additionalBasis: 'SAME_MONTH' }))
    // out/15: outubro (13) | nov/16: novembro (12) | dez/15: dezembro (15)
    expect((await plannedIncome(env)).map((t) => t.amount)).toEqual([
      300_000 + 13 * 4_000,
      300_000 + 12 * 4_000,
      300_000 + 15 * 4_000,
    ])
  })
})

describe('confirmIncomeReceipt (CA-10)', () => {
  async function setup() {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
      dasAccountId: 'pj',
    })
    const created = await env.income.createIncomeRule(env.ctx, sampleRule())
    const txns = await plannedIncome(env)
    return { env, rule: created.rule, txns }
  }

  it('valor real diferente: grava o real, vira CLEARED, ajusta os baldes e o MeiLedger', async () => {
    const { env, txns } = await setup()
    const target = txns[0]! // 15/10, previsto 356000
    const before = env.repo.balances.get('pj')!

    const result = await env.income.confirmIncomeReceipt(env.ctx, {
      transactionId: target.id,
      receivedAmount: 340_000,
      receivedDate: day('2026-10-16'),
    })
    expect(result.transaction).toMatchObject({ status: 'CLEARED', amount: 340_000 })
    expect(result.transaction.date.toISOString().slice(0, 10)).toBe('2026-10-16')
    expect(result.differenceCents).toBe(-16_000)
    expect(result.planned.amount).toBe(356_000)
    expect(result.transaction.notes).toBe('Previsto: R$ 3.560,00 em 2026-10-15')

    const after = env.repo.balances.get('pj')!
    expect(after.balancePlanned).toBe(before.balancePlanned - 356_000)
    expect(after.balanceCleared).toBe(before.balanceCleared + 340_000)
    expectCacheMatchesLedger(env.repo)

    const mei = await env.incomeRepo.findMeiLedger(USER, 2026)
    expect(mei?.accumulatedCents).toBe(340_000)
    expect(mei?.byMonth[9]).toBe(340_000)
    expect(mei?.proportionalCeilingCents).toBe(6_750_000)
  })

  it('sem valor/data informados confirma o previsto, sem nota', async () => {
    const { env, txns } = await setup()
    const result = await env.income.confirmIncomeReceipt(env.ctx, { transactionId: txns[1]!.id })
    expect(result.transaction).toMatchObject({ status: 'CLEARED', amount: 352_000 })
    expect(result.transaction.notes).toBeNull()
    expect(result.differenceCents).toBe(0)
  })

  it('preserva notas existentes ao registrar o previsto', async () => {
    const { env, txns } = await setup()
    await env.svc.updateTransaction(env.ctx, txns[0]!.id, { notes: 'combinado por mensagem' })
    const result = await env.income.confirmIncomeReceipt(env.ctx, {
      transactionId: txns[0]!.id,
      receivedAmount: 350_000,
    })
    expect(result.transaction.notes).toBe(
      'combinado por mensagem\nPrevisto: R$ 3.560,00 em 2026-10-15',
    )
  })

  it('confirmar duas vezes, lançamento que não é renda prevista e valor inválido são rejeitados', async () => {
    const { env, txns } = await setup()
    await env.income.confirmIncomeReceipt(env.ctx, { transactionId: txns[0]!.id })
    await expect(
      env.income.confirmIncomeReceipt(env.ctx, { transactionId: txns[0]!.id }),
    ).rejects.toMatchObject({ code: 'INCOME_NOT_PLANNED_INCOME' })

    const manual = await env.svc.createTransaction(env.ctx, {
      accountId: 'pj',
      kind: 'INCOME',
      amount: 1_000,
      date: day('2026-10-02'),
      description: 'avulso',
      status: 'PLANNED',
    })
    await expect(
      env.income.confirmIncomeReceipt(env.ctx, { transactionId: manual.transaction.id }),
    ).rejects.toBeInstanceOf(IncomeError)
    await expect(
      env.income.confirmIncomeReceipt(env.ctx, { transactionId: 'nao-existe' }),
    ).rejects.toMatchObject({ code: 'INCOME_NOT_PLANNED_INCOME' })
    await expect(
      env.income.confirmIncomeReceipt(env.ctx, { transactionId: txns[1]!.id, receivedAmount: 0 }),
    ).rejects.toMatchObject({ code: 'INCOME_INVALID_INPUT' })
  })

  it('isolamento: previsto de outro usuário não pode ser confirmado', async () => {
    const { env, txns } = await setup()
    await expect(
      env.income.confirmIncomeReceipt(env.otherCtx, { transactionId: txns[0]!.id }),
    ).rejects.toMatchObject({ code: 'INCOME_NOT_PLANNED_INCOME' })
  })

  it('sem perfil do MEI confirma normalmente (não há MeiLedger a recalcular)', async () => {
    const env = makeIncomeEnv()
    await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await plannedIncome(env)
    await env.income.confirmIncomeReceipt(env.ctx, { transactionId: first!.id })
    expect(await env.incomeRepo.findMeiLedger(USER, 2026)).toBeNull()
  })

  it('falha no recálculo desfaz a confirmação (atomicidade)', async () => {
    const { env, txns } = await setup()
    const original = env.incomeRepo.upsertMeiLedger.bind(env.incomeRepo)
    env.incomeRepo.upsertMeiLedger = async () => {
      throw new Error('falha injetada')
    }
    await expect(
      env.income.confirmIncomeReceipt(env.ctx, { transactionId: txns[0]!.id }),
    ).rejects.toThrow('falha injetada')
    env.incomeRepo.upsertMeiLedger = original
    const [first] = await plannedIncome(env)
    expect(first?.status).toBe('PLANNED')
    expectCacheMatchesLedger(env.repo)
  })

  it('erro do ledger propaga com código estável (conta arquivada)', async () => {
    const env = makeIncomeEnv()
    const code = await ledgerErrorCode(() =>
      env.income.createIncomeRule(env.ctx, sampleRule({ destinationAccountId: 'old' })),
    )
    expect(code).toBe('LEDGER_ACCOUNT_ARCHIVED')
    expect(env.incomeRepo.rules.size).toBe(0) // a regra desfez junto
  })
})

describe('projectIncome', () => {
  it('eventos com componentes, vínculo com o lançamento e total pendente', async () => {
    const env = makeIncomeEnv()
    await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await plannedIncome(env)
    await env.income.confirmIncomeReceipt(env.ctx, {
      transactionId: first!.id,
      receivedAmount: 350_000,
    })

    const projection = await env.income.projectIncome(env.ctx, {
      from: day('2026-10-01'),
      to: day('2026-12-31'),
    })
    expect(projection.events.map((e) => e.dateKey)).toEqual([
      '2026-10-15',
      '2026-11-16',
      '2026-12-15',
    ])
    const [oct, nov] = projection.events
    expect(oct).toMatchObject({
      base: 300_000,
      additional: 56_000,
      presentialDays: 14,
      total: 356_000,
    })
    expect(oct?.transaction).toMatchObject({ status: 'CLEARED', amount: 350_000 })
    expect(nov?.transaction?.status).toBe('PLANNED')
    expect(projection.expectedCents).toBe(356_000 + 352_000 + 348_000)
    expect(projection.pendingCents).toBe(352_000 + 348_000) // out já recebido
  })

  it('evento ainda não materializado conta como pendente; período invertido é erro', async () => {
    const env = makeIncomeEnv()
    await env.income.createIncomeRule(env.ctx, sampleRule())
    const projection = await env.income.projectIncome(env.ctx, {
      from: day('2027-01-01'),
      to: day('2027-01-31'),
    })
    expect(projection.events).toHaveLength(1)
    expect(projection.events[0]?.transaction).toBeNull()
    expect(projection.pendingCents).toBe(projection.events[0]?.total)
    await expect(
      env.income.projectIncome(env.ctx, { from: day('2027-02-01'), to: day('2027-01-01') }),
    ).rejects.toMatchObject({ code: 'INCOME_INVALID_PERIOD' })
  })

  it('só regras ativas e só do usuário', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    await env.income.archiveIncomeRule(env.ctx, rule.id)
    const mine = await env.income.projectIncome(env.ctx, {
      from: day('2026-10-01'),
      to: day('2026-12-31'),
    })
    expect(mine.events).toEqual([])
    const theirs = await env.income.projectIncome(env.otherCtx, {
      from: day('2026-10-01'),
      to: day('2026-12-31'),
    })
    expect(theirs.events).toEqual([])
  })
})
