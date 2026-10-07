import { describe, expect, it } from 'vitest'
import { expectCacheMatchesLedger } from '@/server/modules/ledger/testing'
import { USER, day, makeIncomeEnv, sampleRule, type IncomeEnv } from './test-helpers'

/** Revisão QA (FC2-F1-06): cenários de aplicação adicionais, valores fictícios e redondos. */

async function incomeTxns(env: IncomeEnv) {
  const page = await env.svc.listTransactions(env.ctx, {
    occurrenceKeyPrefix: 'income:',
    limit: 100,
  })
  return [...page.items].sort((a, b) => a.date.getTime() - b.date.getTime())
}

describe('QA: materializeIncome concorrente (repositório em memória)', () => {
  it('duas chamadas simultâneas resultam em 1 lançamento por data', async () => {
    const env = makeIncomeEnv()
    await env.income.createIncomeRule(env.ctx, sampleRule())
    for (const t of await incomeTxns(env)) await env.svc.deleteTransaction(env.ctx, t.id)

    await Promise.all([
      env.income.materializeIncome(env.ctx),
      env.income.materializeIncome(env.ctx),
      env.income.materializeIncome(env.ctx),
    ])
    const txns = await incomeTxns(env)
    expect(txns).toHaveLength(3)
    expect(new Set(txns.map((t) => t.occurrenceKey)).size).toBe(3)
    expectCacheMatchesLedger(env.repo)
  })
})

describe('QA: confirmação com data/valor diferentes', () => {
  it('previsto confirmado em outra data não é recriado nem alterado ao materializar de novo', async () => {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
    })
    await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await incomeTxns(env)
    const confirmed = await env.income.confirmIncomeReceipt(env.ctx, {
      transactionId: first!.id,
      receivedAmount: 350_000,
      receivedDate: day('2026-10-19'),
    })
    expect(confirmed.transaction.status).toBe('CLEARED')

    const again = await env.income.materializeIncome(env.ctx)
    expect(again.created).toBe(0)
    expect(again.skipped).toBe(1)
    expect(again.removed).toBe(0)
    const txns = await incomeTxns(env)
    expect(txns).toHaveLength(3)
    const same = txns.find((t) => t.id === first!.id)
    expect(same).toMatchObject({ amount: 350_000, status: 'CLEARED' })
    expect(same?.date.toISOString().slice(0, 10)).toBe('2026-10-19')
    expectCacheMatchesLedger(env.repo)
  })

  it('recebimento em janeiro de um previsto de dezembro move o faturamento (caixa) para o novo ano', async () => {
    const env = makeIncomeEnv('2026-12-01T15:00:00.000Z')
    await env.income.upsertMeiProfile(env.ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
    })
    await env.income.createIncomeRule(env.ctx, sampleRule({ payDay: 31 }))
    const dec = (await incomeTxns(env)).find((t) => t.date.toISOString().startsWith('2026-12'))!
    await env.income.confirmIncomeReceipt(env.ctx, {
      transactionId: dec.id,
      receivedAmount: 400_000,
      receivedDate: day('2027-01-04'),
    })
    const y2026 = await env.incomeRepo.findMeiLedger(USER, 2026)
    const y2027 = await env.incomeRepo.findMeiLedger(USER, 2027)
    expect(y2026?.accumulatedCents).toBe(0)
    expect(y2027?.accumulatedCents).toBe(400_000)
    expect(y2027?.byMonth[0]).toBe(400_000)
    expect(y2027?.proportionalCeilingCents).toBe(8_100_000)
  })

  it('transferência PJ -> PF do valor recebido não infla o faturamento (dupla contagem)', async () => {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
    })
    await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await incomeTxns(env)
    await env.income.confirmIncomeReceipt(env.ctx, { transactionId: first!.id })
    await env.svc.createTransfer(env.ctx, {
      sourceAccountId: 'pj',
      destinationAccountId: 'pf',
      amount: first!.amount,
      date: day('2026-10-16'),
      description: 'Repasse',
    })
    const mei = await env.income.recomputeMeiLedger(env.ctx, { year: 2026 })
    expect(mei.accumulatedCents).toBe(first!.amount)
    const status = await env.income.getMeiStatus(env.ctx, { year: 2026 })
    expect(status.accumulated).toBe(first!.amount)
  })
})

describe('QA: regra alterada com previstos mistos', () => {
  it('mudar perDayCents atualiza PLANNED e preserva CLEARED', async () => {
    const env = makeIncomeEnv()
    const { rule } = await env.income.createIncomeRule(env.ctx, sampleRule())
    const [first] = await incomeTxns(env)
    await env.income.confirmIncomeReceipt(env.ctx, { transactionId: first!.id })
    await env.income.updateIncomeRule(env.ctx, rule.id, { perDayCents: 5_000 })
    const txns = await incomeTxns(env)
    expect(txns[0]).toMatchObject({ status: 'CLEARED', amount: first!.amount })
    // nov/16: outubro (13 dias) => 300000 + 5000 x 13; dez/15: novembro (12) => 360000
    expect(txns.slice(1).map((t) => t.amount)).toEqual([365_000, 360_000])
    expect(txns.slice(1).every((t) => t.status === 'PLANNED')).toBe(true)
    expectCacheMatchesLedger(env.repo)
  })
})

describe('QA: DAS e isolamento de usuário', () => {
  it('materializeDas e materializeIncome de outro usuário não tocam nos meus lançamentos', async () => {
    const env = makeIncomeEnv()
    await env.income.upsertMeiProfile(env.ctx, {
      openedAt: day('2026-03-10'),
      dasAmountCents: 8_000,
      dasAccountId: 'pf',
    })
    await env.income.materializeDas(env.ctx)
    const mine = await env.svc.listTransactions(env.ctx, { occurrenceKeyPrefix: 'das:', limit: 50 })
    expect(mine.items.length).toBeGreaterThan(0)
    expect(mine.items.every((t) => t.amount === -8_000 && t.status === 'PLANNED')).toBe(true)
    await expect(env.income.materializeDas(env.otherCtx)).rejects.toMatchObject({
      code: 'MEI_PROFILE_NOT_FOUND',
    })
    const theirs = await env.svc.listTransactions(env.otherCtx, { occurrenceKeyPrefix: 'das:' })
    expect(theirs.items).toHaveLength(0)
  })
})
