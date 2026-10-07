import { describe, expect, it } from 'vitest'
import { formatCalendarDate } from '../domain/calendar'
import { createLoan } from './create-loan'
import { estimateOverdraftCost } from './estimate-overdraft-cost'
import { getDebtDetail, getDebtSummary, listDebts } from './list-debts'
import { listPendingDebtObligations } from './list-pending-obligations'
import { registerInstallmentPayment } from './register-installment-payment'
import { simulatePayoff } from './simulate-payoff'
import { OTHER_USER, USER, day, debtErrorCode, makeDebtsEnv, seedBalance } from './test-helpers'

const NOW = new Date('2026-10-07T15:00:00.000Z')

async function setupFourDebts() {
  const env = makeDebtsEnv()
  // Cheque especial de R$ 500,00 em uso: saldo -50000 na conta com limite de R$ 1.000,00.
  await seedBalance(env, 'acc-a', -50_000)
  await createLoan(
    USER,
    {
      kind: 'CONSIGNADO',
      name: 'Consignado fictício',
      accountId: 'acc-b',
      principalCents: 1_000_000,
      monthlyRate: 0.019,
      installmentCount: 12,
      firstDueDate: day('2026-11-05'),
    },
    env.deps,
  )
  await createLoan(
    USER,
    {
      kind: 'PIX_CREDIT',
      name: 'Pix no crédito fictício',
      principalCents: 200_000,
      monthlyRate: 0.07,
      installmentCount: 6,
      firstDueDate: day('2026-11-05'),
    },
    env.deps,
  )
  await createLoan(
    USER,
    { kind: 'OVERDRAFT', name: 'Cheque especial', accountId: 'acc-a', monthlyRate: 0.08 },
    env.deps,
  )
  await createLoan(
    USER,
    { kind: 'CARD_REVOLVING', name: 'Rotativo', accountId: 'acc-card', monthlyRate: 0.12 },
    env.deps,
  )
  env.cards.balances.set('acc-card', {
    unpaid: 100_000,
    originalPrincipal: 100_000,
    since: day('2026-09-10'),
  })
  return env
}

describe('listDebts (CA-13)', () => {
  it('quatro dívidas ordenadas por taxa, com custo mensal em centavos e totais coerentes', async () => {
    const env = await setupFourDebts()
    const { debts, totals } = await listDebts(USER, { now: NOW }, env.deps)
    expect(debts.map((d) => d.name)).toEqual([
      'Rotativo',
      'Cheque especial',
      'Pix no crédito fictício',
      'Consignado fictício',
    ])
    expect(debts.map((d) => d.monthlyRate)).toEqual([0.12, 0.08, 0.07, 0.019])
    expect(debts.map((d) => d.monthlyInterestCost)).toEqual([12_000, 4000, 14_000, 19_000])
    expect(debts.map((d) => d.outstanding)).toEqual([100_000, 50_000, 200_000, 1_000_000])
    expect(totals).toEqual({
      totalOutstanding: 1_350_000,
      totalMonthlyInterestCost: 49_000,
      overdueAmount: 0,
    })
    expect(debts.every((d) => d.annualRate > d.monthlyRate && d.assumptions.length > 0)).toBe(true)
    expect(await getDebtSummary(USER, { now: NOW }, env.deps)).toEqual({ ...totals, debtCount: 4 })
  })

  it('a ordem vem da taxa: trocar as taxas troca a ordem, independente do tipo', async () => {
    const env = await setupFourDebts()
    const consignado = [...env.loans.loans.values()].find((l) => l.kind === 'CONSIGNADO')!
    env.loans.loans.set(consignado.id, { ...consignado, monthlyRate: 0.2 })
    const { debts } = await listDebts(USER, { now: NOW }, env.deps)
    expect(debts[0].name).toBe('Consignado fictício')
  })

  it('cheque especial sem uso não aparece (decisão); includeIdle mostra com custo 0', async () => {
    const env = makeDebtsEnv()
    await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque especial', accountId: 'acc-a', monthlyRate: 0.08 },
      env.deps,
    )
    expect((await listDebts(USER, { now: NOW }, env.deps)).debts).toEqual([])
    const idle = await listDebts(USER, { now: NOW, includeIdle: true }, env.deps)
    expect(idle.debts).toHaveLength(1)
    expect(idle.debts[0]).toMatchObject({ outstanding: 0, monthlyInterestCost: 0 })
  })

  it('cheque especial acima do limite: custo só sobre o uso dentro do limite e excedente reportado', async () => {
    const env = makeDebtsEnv()
    await seedBalance(env, 'acc-a', -130_000) // limite 100000
    await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque especial', accountId: 'acc-a', monthlyRate: 0.08 },
      env.deps,
    )
    const [debt] = (await listDebts(USER, { now: NOW }, env.deps)).debts
    expect(debt).toMatchObject({
      outstanding: 100_000,
      monthlyInterestCost: 8000,
      limitExcess: 30_000,
    })
  })

  it('rotativo respeita o teto: juros já cobrados vindos do ledger limitam o custo', async () => {
    const env = makeDebtsEnv()
    await createLoan(
      USER,
      { kind: 'CARD_REVOLVING', name: 'Rotativo', accountId: 'acc-card', monthlyRate: 0.12 },
      env.deps,
    )
    env.cards.balances.set('acc-card', {
      unpaid: 100_000,
      originalPrincipal: 100_000,
      since: day('2026-09-10'),
    })
    await env.ledger.svc.createTransaction(
      { userId: USER },
      {
        accountId: 'acc-card',
        kind: 'INTEREST',
        amount: 95_000,
        date: day('2026-09-20'),
        description: 'Juros do rotativo',
      },
    )
    // Juros anteriores ao vencimento da fatura não contam.
    await env.ledger.svc.createTransaction(
      { userId: USER },
      {
        accountId: 'acc-card',
        kind: 'INTEREST',
        amount: 7000,
        date: day('2026-08-01'),
        description: 'Juros antigos',
      },
    )
    const [debt] = (await listDebts(USER, { now: NOW }, env.deps)).debts
    expect(debt).toMatchObject({ monthlyInterestCost: 5000, revolvingCapped: true })
  })

  it('parcelas vencidas entram em overdueAmount com encargos e isolam por usuário', async () => {
    const env = makeDebtsEnv()
    await createLoan(
      USER,
      {
        kind: 'CONSIGNADO',
        name: 'Consignado atrasado',
        principalCents: 1_000_000,
        installmentAmountCents: 94_560,
        installmentCount: 12,
        firstDueDate: day('2026-09-05'),
      },
      env.deps,
    )
    const { debts, totals } = await listDebts(USER, { now: NOW }, env.deps)
    expect(debts[0].overdueCount).toBe(2)
    expect(totals.overdueAmount).toBe(debts[0].overdueAmount)
    expect(totals.overdueAmount).toBeGreaterThan(2 * 94_560)
    expect((await listDebts(OTHER_USER, { now: NOW }, env.deps)).debts).toEqual([])
  })

  it('dívida encerrada ou quitada não aparece', async () => {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(
      USER,
      {
        kind: 'PERSONAL',
        name: 'x',
        principalCents: 100_000,
        monthlyRate: 0.02,
        installmentCount: 2,
        firstDueDate: day('2026-11-05'),
      },
      env.deps,
    )
    env.loans.loans.set(loan.id, { ...loan, status: 'PAID_OFF' })
    expect((await listDebts(USER, { now: NOW }, env.deps)).debts).toEqual([])
  })
})

describe('getDebtDetail', () => {
  it('cronograma com status calculado e encargos nas vencidas', async () => {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(
      USER,
      {
        kind: 'CONSIGNADO',
        name: 'Consignado',
        principalCents: 1_000_000,
        installmentAmountCents: 94_560,
        installmentCount: 12,
        firstDueDate: day('2026-09-05'),
        alreadyPaidInstallments: 0,
      },
      env.deps,
    )
    const detail = await getDebtDetail(USER, loan.id, { now: NOW }, env.deps)
    expect(detail.installments).toHaveLength(12)
    expect(detail.installments.slice(0, 2).map((i) => i.status)).toEqual(['OVERDUE', 'OVERDUE'])
    expect(detail.installments[2].status).toBe('PENDING')
    expect(detail.installments[0].lateCharges.days).toBe(32)
    expect(detail.installments[0].amountDueNow).toBe(
      94_560 + detail.installments[0].lateCharges.total,
    )
    expect(detail.installments[2].lateCharges.total).toBe(0)
    expect(detail.summary.overdueCount).toBe(2)
    expect(
      await debtErrorCode(() => getDebtDetail(OTHER_USER, loan.id, { now: NOW }, env.deps)),
    ).toBe('DEBT_LOAN_NOT_FOUND')
    expect(await debtErrorCode(() => getDebtDetail(USER, 'nope', { now: NOW }, env.deps))).toBe(
      'DEBT_LOAN_NOT_FOUND',
    )
  })

  it('cheque especial: sem parcelas, resumo com uso do ledger', async () => {
    const env = makeDebtsEnv()
    await seedBalance(env, 'acc-a', -20_000)
    const { loan } = await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque especial', accountId: 'acc-a', monthlyRate: 0.1 },
      env.deps,
    )
    const detail = await getDebtDetail(USER, loan.id, { now: NOW }, env.deps)
    expect(detail.installments).toEqual([])
    expect(detail.summary).toMatchObject({ outstanding: 20_000, monthlyInterestCost: 2000 })
  })
})

describe('listPendingDebtObligations (CA-14)', () => {
  it('inclui atrasadas com valor corrigido, a vencer até o limite, e exclui pagas', async () => {
    const env = makeDebtsEnv()
    await seedBalance(env, 'acc-a', 2_000_000)
    const { loan } = await createLoan(
      USER,
      {
        kind: 'CONSIGNADO',
        name: 'Consignado',
        accountId: 'acc-a',
        principalCents: 1_000_000,
        installmentAmountCents: 94_560,
        installmentCount: 12,
        firstDueDate: day('2026-09-05'),
      },
      env.deps,
    )
    const until = day('2026-11-30')
    const before = await listPendingDebtObligations(USER, { until, now: NOW }, env.deps)
    expect(before.map((o) => [o.number, o.status])).toEqual([
      [1, 'OVERDUE'],
      [2, 'OVERDUE'],
      [3, 'PENDING'],
    ])
    const first = before[0]
    expect(first.lateCharges.days).toBe(32)
    expect(first.amountDueNow).toBe(first.amount + first.lateCharges.total)
    expect(first.amountDueNow).toBeGreaterThan(first.amount)
    expect(before[2]).toMatchObject({
      amountDueNow: before[2].amount,
      accountId: 'acc-a',
      loanName: 'Consignado',
      installmentCount: 12,
    })
    expect(formatCalendarDate(before[2].dueDate)).toBe('2026-11-05')

    await registerInstallmentPayment(
      USER,
      { loanId: loan.id, number: 1, payDate: day('2026-10-07'), accountId: 'acc-a' },
      env.deps,
    )
    const after = await listPendingDebtObligations(USER, { until, now: NOW }, env.deps)
    expect(after.map((o) => o.number)).toEqual([2, 3])

    // 'until' limita; outro usuário não vê nada; limite inválido é rejeitado
    const short = await listPendingDebtObligations(
      USER,
      { until: day('2026-10-06'), now: NOW },
      env.deps,
    )
    expect(short.map((o) => o.number)).toEqual([2])
    expect(await listPendingDebtObligations(OTHER_USER, { until, now: NOW }, env.deps)).toEqual([])
    expect(
      await debtErrorCode(() =>
        listPendingDebtObligations(USER, { until: new Date('x'), now: NOW }, env.deps),
      ),
    ).toBe('DEBT_INVALID_INPUT')
  })

  it('ordena por vencimento entre contratos e ignora cheque especial', async () => {
    const env = makeDebtsEnv()
    await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque', accountId: 'acc-a', monthlyRate: 0.08 },
      env.deps,
    )
    await createLoan(
      USER,
      {
        kind: 'PERSONAL',
        name: 'B',
        principalCents: 100_000,
        monthlyRate: 0.02,
        installmentCount: 2,
        firstDueDate: day('2026-11-20'),
      },
      env.deps,
    )
    await createLoan(
      USER,
      {
        kind: 'PERSONAL',
        name: 'A',
        principalCents: 100_000,
        monthlyRate: 0.02,
        installmentCount: 2,
        firstDueDate: day('2026-11-10'),
      },
      env.deps,
    )
    const list = await listPendingDebtObligations(
      USER,
      { until: day('2026-12-31'), now: NOW },
      env.deps,
    )
    expect(list.map((o) => [o.loanName, o.number])).toEqual([
      ['A', 1],
      ['B', 1],
      ['A', 2],
      ['B', 2],
    ])
  })
})

/** Simulação independente (mesmo contrato: juros arredondados por mês) para conferir a engine. */
function referenceSimulation(
  balance: number,
  rate: number,
  payment: number,
  lump = 0,
  lastMonth = 12,
) {
  let remaining = balance - Math.min(lump, balance)
  let interest = 0
  let months = 0
  while (remaining > 0 && months < 1200) {
    const i = Math.round(remaining * rate)
    // A parcela final do contrato (mês `lastMonth`) absorve o resíduo, como o cronograma Price.
    const pay = months + 1 >= lastMonth ? remaining + i : Math.min(payment, remaining + i)
    remaining = remaining + i - pay
    interest += i
    months += 1
  }
  return { months, interest }
}

describe('simulatePayoff (CA-15)', () => {
  async function setup() {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(
      USER,
      {
        kind: 'PERSONAL',
        name: 'Pessoal',
        principalCents: 1_000_000,
        installmentAmountCents: 94_560,
        installmentCount: 12,
        firstDueDate: day('2026-11-05'),
      },
      env.deps,
    )
    return { env, loan }
  }

  it('extra mensal reduz meses e juros em relação à linha de base (valores conferidos)', async () => {
    const { env, loan } = await setup()
    const result = await simulatePayoff(
      USER,
      { loanId: loan.id, extraMonthlyPayment: 50_000, now: NOW },
      env.deps,
    )
    const rate = loan.monthlyRate
    const base = referenceSimulation(1_000_000, rate, 94_560)
    const scenario = referenceSimulation(1_000_000, rate, 144_560)
    expect(result.balance).toBe(1_000_000)
    expect(result.baseline).toMatchObject({
      months: base.months,
      totalInterest: base.interest,
      monthlyPayment: 94_560,
    })
    expect(result.scenario).toMatchObject({
      months: scenario.months,
      totalInterest: scenario.interest,
      monthlyPayment: 144_560,
    })
    expect(result.scenario.months).toBeLessThan(result.baseline.months)
    expect(result.monthsSaved).toBe(base.months - scenario.months)
    expect(result.interestSaved).toBe(base.interest - scenario.interest)
    expect(result.interestSaved).toBeGreaterThan(0)
    // Datas: a última parcela do cenário cai (meses - 1) depois do 1º vencimento.
    expect(formatCalendarDate(result.baseline.payoffDate!)).toBe('2027-10-05')
    expect(result.scenario.payoffDate!.getTime()).toBeLessThan(
      result.baseline.payoffDate!.getTime(),
    )
    expect(result.assumptions.length).toBeGreaterThan(0)
  })

  it('pagamento à vista reduz juros; sem extra nem à vista o cenário é igual à base', async () => {
    const { env, loan } = await setup()
    const lump = await simulatePayoff(
      USER,
      { loanId: loan.id, lumpSum: 300_000, now: NOW },
      env.deps,
    )
    const reference = referenceSimulation(1_000_000, loan.monthlyRate, 94_560, 300_000)
    expect(lump.scenario).toMatchObject({
      months: reference.months,
      totalInterest: reference.interest,
      lumpSum: 300_000,
    })
    expect(lump.interestSaved).toBeGreaterThan(0)
    const same = await simulatePayoff(USER, { loanId: loan.id, now: NOW }, env.deps)
    expect(same.monthsSaved).toBe(0)
    expect(same.interestSaved).toBe(0)
  })

  it('só considera parcelas em aberto (contrato em andamento)', async () => {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(
      USER,
      {
        kind: 'CONSIGNADO',
        name: 'x',
        principalCents: 1_000_000,
        installmentAmountCents: 94_560,
        installmentCount: 12,
        firstDueDate: day('2026-11-05'),
        alreadyPaidInstallments: 6,
      },
      env.deps,
    )
    const result = await simulatePayoff(
      USER,
      { loanId: loan.id, extraMonthlyPayment: 20_000, now: NOW },
      env.deps,
    )
    expect(result.balance).toBe(loan.outstandingCents)
    expect(result.baseline.months).toBeLessThanOrEqual(6)
  })

  it('rejeita tipo sem parcelas, valores inválidos e dívida de outro usuário', async () => {
    const { env, loan } = await setup()
    const overdraft = await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque', accountId: 'acc-a', monthlyRate: 0.08 },
      env.deps,
    )
    expect(
      await debtErrorCode(() =>
        simulatePayoff(USER, { loanId: overdraft.loan.id, now: NOW }, env.deps),
      ),
    ).toBe('DEBT_NOT_INSTALLMENT_LOAN')
    expect(
      await debtErrorCode(() =>
        simulatePayoff(USER, { loanId: loan.id, extraMonthlyPayment: -1, now: NOW }, env.deps),
      ),
    ).toBe('DEBT_INVALID_INPUT')
    expect(
      await debtErrorCode(() =>
        simulatePayoff(USER, { loanId: loan.id, lumpSum: 1.5, now: NOW }, env.deps),
      ),
    ).toBe('DEBT_INVALID_INPUT')
    expect(
      await debtErrorCode(() =>
        simulatePayoff(OTHER_USER, { loanId: loan.id, now: NOW }, env.deps),
      ),
    ).toBe('DEBT_LOAN_NOT_FOUND')
  })
})

describe('estimateOverdraftCost', () => {
  const END_OF_MONTH = new Date('2026-10-31T15:00:00.000Z')

  async function setup() {
    const env = makeDebtsEnv()
    const create = (input: { kind: 'INCOME' | 'EXPENSE'; amount: number; date: string }) =>
      env.ledger.svc.createTransaction(
        { userId: USER },
        { accountId: 'acc-a', description: 'Lançamento fictício', ...input, date: day(input.date) },
      )
    await seedBalance(env, 'acc-a', 20_000, '2026-09-15')
    await create({ kind: 'EXPENSE', amount: 70_000, date: '2026-10-11' }) // saldo -50000 do dia 11
    await create({ kind: 'INCOME', amount: 50_000, date: '2026-10-21' }) // volta a 0 no dia 21
    await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque especial', accountId: 'acc-a', monthlyRate: 0.08 },
      env.deps,
    )
    return env
  }

  it('mês fechado: dias 11 a 20 no vermelho (10 dias x 50000 x 8% / 30 = 1333)', async () => {
    const env = await setup()
    const result = await estimateOverdraftCost(
      USER,
      'acc-a',
      { month: '2026-10', now: END_OF_MONTH },
      env.deps,
    )
    expect(result).toMatchObject({
      costCents: 1333,
      days: 31,
      daysInOverdraft: 10,
      exposureCentsDays: 500_000,
      maxUsed: 50_000,
      maxExcess: 0,
      isEstimate: true,
      monthlyRate: 0.08,
      overdraftLimit: 100_000,
    })
    expect(formatCalendarDate(result.from)).toBe('2026-10-01')
    expect(formatCalendarDate(result.to)).toBe('2026-10-31')
    expect(result.assumptions.length).toBeGreaterThan(0)
  })

  it('mês corrente vai só até hoje; mês anterior sem uso custa 0; mês futuro é vazio', async () => {
    const env = await setup()
    const partial = await estimateOverdraftCost(
      USER,
      'acc-a',
      { month: '2026-10', now: new Date('2026-10-15T15:00:00.000Z') },
      env.deps,
    )
    // Hoje 15/10, saldo atual = 20000 - 70000 + 50000 = 0; mas o dia 21 ainda não chegou no passado do 'agora'.
    // Posição atual inclui o lançamento do dia 21: o saldo reconstruído até o dia 15 desfaz o que veio depois.
    expect(partial.days).toBe(15)
    expect(partial.daysInOverdraft).toBe(5)
    expect(partial.costCents).toBe(Math.round((5 * 50_000 * 0.08) / 30))
    expect(formatCalendarDate(partial.to)).toBe('2026-10-15')

    const september = await estimateOverdraftCost(
      USER,
      'acc-a',
      { month: '2026-09', now: END_OF_MONTH },
      env.deps,
    )
    expect(september.costCents).toBe(0)
    const future = await estimateOverdraftCost(
      USER,
      'acc-a',
      { month: '2026-12', now: END_OF_MONTH },
      env.deps,
    )
    expect(future).toMatchObject({ costCents: 0, days: 0 })
  })

  it('excedente além do limite fica fora do custo e é reportado', async () => {
    const env = makeDebtsEnv()
    await seedBalance(env, 'acc-a', -130_000, '2026-09-15')
    await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque especial', accountId: 'acc-a', monthlyRate: 0.09 },
      env.deps,
    )
    const result = await estimateOverdraftCost(
      USER,
      'acc-a',
      { month: '2026-10', now: END_OF_MONTH },
      env.deps,
    )
    // 31 dias x 100000 (uso dentro do limite) x 9% / 30
    expect(result.costCents).toBe(9300)
    expect(result.maxExcess).toBe(30_000)
    expect(result.excessCentsDays).toBe(31 * 30_000)
  })

  it('exige a dívida de cheque especial da conta e mês válido', async () => {
    const env = makeDebtsEnv()
    expect(
      await debtErrorCode(() =>
        estimateOverdraftCost(USER, 'acc-a', { month: '2026-10', now: END_OF_MONTH }, env.deps),
      ),
    ).toBe('DEBT_LOAN_NOT_FOUND')
    await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque', accountId: 'acc-a', monthlyRate: 0.08 },
      env.deps,
    )
    expect(
      await debtErrorCode(() =>
        estimateOverdraftCost(USER, 'acc-a', { month: '2026-13', now: END_OF_MONTH }, env.deps),
      ),
    ).toBe('DEBT_INVALID_INPUT')
    expect(
      await debtErrorCode(() =>
        estimateOverdraftCost(
          OTHER_USER,
          'acc-a',
          { month: '2026-10', now: END_OF_MONTH },
          env.deps,
        ),
      ),
    ).toBe('DEBT_LOAN_NOT_FOUND')
  })
})
