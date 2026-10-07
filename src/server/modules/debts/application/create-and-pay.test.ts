import { describe, expect, it } from 'vitest'
import { formatCalendarDate } from '../domain/calendar'
import { expectCacheMatchesLedger } from '@/server/modules/ledger/testing'
import { buildAmortizationSchedule, outstandingBalance } from '../domain/price'
import { createLoan } from './create-loan'
import { deleteLoan, archiveLoan, updateLoan } from './manage-loan'
import { registerInstallmentPayment } from './register-installment-payment'
import { OTHER_USER, USER, day, debtErrorCode, makeDebtsEnv, seedBalance } from './test-helpers'

const consignado = {
  kind: 'CONSIGNADO' as const,
  name: 'Consignado fictício',
  lenderName: 'Banco Exemplo',
  accountId: 'acc-a',
  principalCents: 1_000_000,
  installmentAmountCents: 94_560,
  installmentCount: 12,
  firstDueDate: day('2026-11-05'),
}

describe('createLoan (CA-10, CA-11)', () => {
  it('consignado com parcela informada: 12 parcelas, datas mensais, taxa inferida ~2%', async () => {
    const env = makeDebtsEnv()
    const result = await createLoan(USER, consignado, env.deps)
    expect(result.rateInferred).toBe(true)
    expect(result.loan.monthlyRate).toBeGreaterThanOrEqual(0.019999)
    expect(result.loan.monthlyRate).toBeLessThanOrEqual(0.020001)
    expect(result.loan.outstandingCents).toBe(1_000_000)
    expect(result.loan.status).toBe('ACTIVE')
    expect(result.loan.installmentAmountCents).toBe(94_560)

    const installments = await env.loans.listInstallments(USER, result.loan.id)
    expect(installments).toHaveLength(12)
    expect(installments.map((i) => formatCalendarDate(i.dueDate))).toEqual([
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
      '2027-02-05',
      '2027-03-05',
      '2027-04-05',
      '2027-05-05',
      '2027-06-05',
      '2027-07-05',
      '2027-08-05',
      '2027-09-05',
      '2027-10-05',
    ])
    expect(installments.reduce((sum, i) => sum + i.principalCents, 0)).toBe(1_000_000)
    expect(installments.every((i) => i.status === 'PENDING')).toBe(true)
    expect(installments.every((i) => i.amountCents === i.principalCents + i.interestCents)).toBe(
      true,
    )
  })

  it('contrato em andamento: as primeiras ficam PAID (sem lançamento) e o saldo é ajustado', async () => {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(USER, { ...consignado, alreadyPaidInstallments: 3 }, env.deps)
    const installments = await env.loans.listInstallments(USER, loan.id)
    expect(
      installments.slice(0, 3).every((i) => i.status === 'PAID' && i.transactionId === null),
    ).toBe(true)
    expect(installments.slice(3).every((i) => i.status === 'PENDING')).toBe(true)
    const schedule = buildAmortizationSchedule({
      principal: 1_000_000,
      monthlyRate: loan.monthlyRate,
      installments: 12,
      firstDueDate: day('2026-11-05'),
      installmentAmount: 94_560,
    })
    expect(loan.outstandingCents).toBe(outstandingBalance(schedule, 3))
    expect(env.ledger.repo.txns.size).toBe(0)
  })

  it('só com taxa: calcula a parcela Price (R$ 945,60) e guarda a taxa como informada', async () => {
    const env = makeDebtsEnv()
    const { loan, rateInferred } = await createLoan(
      USER,
      {
        kind: 'PIX_CREDIT',
        name: 'Pix no crédito',
        principalCents: 1_000_000,
        monthlyRate: 0.02,
        installmentCount: 12,
        firstDueDate: day('2026-11-05'),
      },
      env.deps,
    )
    expect(rateInferred).toBe(false)
    expect(loan.monthlyRate).toBe(0.02)
    expect(loan.installmentAmountCents).toBe(94_560)
    expect(loan.lateFeeRate).toBe(0.02)
    expect(loan.lateInterestMonthlyRate).toBe(0.01)
  })

  it('CA-11: vencimento dia 31 gera 28/fev, 31/mar, 30/abr (clamp sem acúmulo)', async () => {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(
      USER,
      {
        kind: 'PERSONAL',
        name: 'Pessoal fictício',
        principalCents: 400_000,
        monthlyRate: 0.03,
        installmentCount: 4,
        firstDueDate: day('2026-01-31'),
      },
      env.deps,
    )
    const installments = await env.loans.listInstallments(USER, loan.id)
    expect(installments.map((i) => formatCalendarDate(i.dueDate))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('cheque especial e rotativo: exigem conta do tipo certo e taxa; sem cronograma', async () => {
    const env = makeDebtsEnv()
    const overdraft = await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque especial', accountId: 'acc-a', monthlyRate: 0.08 },
      env.deps,
    )
    expect(overdraft.loan).toMatchObject({
      kind: 'OVERDRAFT',
      principalCents: 0,
      installmentCount: null,
      monthlyRate: 0.08,
    })
    expect(await env.loans.listInstallments(USER, overdraft.loan.id)).toEqual([])
    const revolving = await createLoan(
      USER,
      { kind: 'CARD_REVOLVING', name: 'Rotativo', accountId: 'acc-card', monthlyRate: 0.12 },
      env.deps,
    )
    expect(revolving.loan.kind).toBe('CARD_REVOLVING')

    expect(
      await debtErrorCode(() =>
        createLoan(
          USER,
          { kind: 'OVERDRAFT', name: 'x', accountId: 'acc-card', monthlyRate: 0.08 },
          env.deps,
        ),
      ),
    ).toBe('DEBT_INVALID_INPUT')
    expect(
      await debtErrorCode(() =>
        createLoan(
          USER,
          { kind: 'CARD_REVOLVING', name: 'x', accountId: 'acc-a', monthlyRate: 0.12 },
          env.deps,
        ),
      ),
    ).toBe('DEBT_INVALID_INPUT')
    expect(
      await debtErrorCode(() =>
        createLoan(USER, { kind: 'OVERDRAFT', name: 'x', monthlyRate: 0.08 }, env.deps),
      ),
    ).toBe('DEBT_INVALID_INPUT')
    expect(
      await debtErrorCode(() =>
        createLoan(USER, { kind: 'OVERDRAFT', name: 'x', accountId: 'acc-b' }, env.deps),
      ),
    ).toBe('DEBT_INVALID_INPUT')
    // Duplicado na mesma conta
    expect(
      await debtErrorCode(() =>
        createLoan(
          USER,
          { kind: 'OVERDRAFT', name: 'y', accountId: 'acc-a', monthlyRate: 0.08 },
          env.deps,
        ),
      ),
    ).toBe('DEBT_INVALID_INPUT')
  })

  it('conta de outro usuário ou inexistente: DEBT_ACCOUNT_NOT_FOUND; parcelas não debitam cartão', async () => {
    const env = makeDebtsEnv()
    expect(
      await debtErrorCode(() =>
        createLoan(USER, { ...consignado, accountId: 'acc-other' }, env.deps),
      ),
    ).toBe('DEBT_ACCOUNT_NOT_FOUND')
    expect(
      await debtErrorCode(() =>
        createLoan(USER, { ...consignado, accountId: 'nao-existe' }, env.deps),
      ),
    ).toBe('DEBT_ACCOUNT_NOT_FOUND')
    expect(
      await debtErrorCode(() =>
        createLoan(USER, { ...consignado, accountId: 'acc-card' }, env.deps),
      ),
    ).toBe('DEBT_INVALID_INPUT')
  })

  it('validações do contrato e do texto livre (sem CPF/CNPJ/conta)', async () => {
    const env = makeDebtsEnv()
    const bad = async (patch: object) =>
      debtErrorCode(() => createLoan(USER, { ...consignado, ...patch }, env.deps))
    expect(await bad({ lenderName: 'Banco 1.1.1.1.1.1.1.1.1.1.1' })).toBe('DEBT_INVALID_INPUT')
    expect(await bad({ name: 'Ref 11111111111111' })).toBe('DEBT_INVALID_INPUT')
    expect(await bad({ name: '   ' })).toBe('DEBT_INVALID_INPUT')
    expect(await bad({ monthlyRate: 0.31, installmentAmountCents: undefined })).toBe(
      'DEBT_INVALID_INPUT',
    )
    expect(await bad({ installmentCount: 121 })).toBe('DEBT_INVALID_INPUT')
    expect(await bad({ installmentCount: 0 })).toBe('DEBT_INVALID_INPUT')
    expect(await bad({ principalCents: 0 })).toBe('DEBT_INVALID_INPUT')
    expect(await bad({ firstDueDate: undefined })).toBe('DEBT_INVALID_INPUT')
    expect(await bad({ alreadyPaidInstallments: 12 })).toBe('DEBT_INVALID_INPUT')
    expect(await bad({ installmentAmountCents: undefined })).toBe('DEBT_INVALID_INPUT')
    // soma das parcelas menor que o contratado
    expect(await bad({ installmentAmountCents: 50_000 })).toBe('DEBT_INCONSISTENT_CONTRACT')
    // taxa informada incompatível com a parcela
    expect(await bad({ monthlyRate: 0.02, installmentAmountCents: 300_000 })).toBe(
      'DEBT_INCONSISTENT_CONTRACT',
    )
    expect(env.loans.loans.size).toBe(0)
  })
})

describe('registerInstallmentPayment (CA-12)', () => {
  /** Contrato com 1ª parcela em 2026-10-01 (para ter atraso de 10 dias em 2026-10-11). */
  async function setup() {
    const env = makeDebtsEnv()
    await seedBalance(env, 'acc-a', 500_000)
    const { loan } = await createLoan(
      USER,
      { ...consignado, firstDueDate: day('2026-10-01') },
      env.deps,
    )
    const balanceOf = async () =>
      (await env.ledger.svc.getAccountPosition({ userId: USER }, 'acc-a')).current
    return { env, loan, balanceOf }
  }

  it('parcela atrasada em 10 dias: 3 lançamentos (EXPENSE, FEE, INTEREST) e a conta reduz 96766', async () => {
    const { env, loan, balanceOf } = await setup()
    const before = await balanceOf()
    const result = await registerInstallmentPayment(
      USER,
      { loanId: loan.id, number: 1, payDate: day('2026-10-11'), accountId: 'acc-a' },
      env.deps,
    )

    expect(result.paidAmountCents).toBe(96_766)
    expect(result.lateChargesCents).toBe(2206)
    expect(result.computedCharges).toEqual({ fee: 1891, interest: 315, total: 2206, days: 10 })
    expect(before - (await balanceOf())).toBe(96_766)

    const txns = [...env.ledger.repo.txns.values()].filter((t) => t.kind !== 'ADJUSTMENT')
    expect(txns.map((t) => [t.kind, t.amount, t.categoryId]).sort()).toEqual(
      [
        ['EXPENSE', -94_560, 'cat-parcelas-emprestimos'],
        ['FEE', -1891, 'cat-multas-atrasos'],
        ['INTEREST', -315, 'cat-juros-encargos'],
      ].sort(),
    )
    expect(
      txns.every((t) => t.accountId === 'acc-a' && formatCalendarDate(t.date) === '2026-10-11'),
    ).toBe(true)

    const [first] = await env.loans.listInstallments(USER, loan.id)
    expect(first).toMatchObject({
      status: 'PAID',
      lateChargesCents: 2206,
      paidAmountCents: 96_766,
      transactionId: result.transactionIds.installment,
    })
    expect(formatCalendarDate(first.paidAt!)).toBe('2026-10-11')
    expect(result.outOfOrder).toBe(false)
    expect(expectCacheMatchesLedger(env.ledger.repo)).toBeUndefined()
  })

  it('no vencimento: só o lançamento da parcela, sem FEE/INTEREST', async () => {
    const { env, loan } = await setup()
    const result = await registerInstallmentPayment(
      USER,
      { loanId: loan.id, number: 1, payDate: day('2026-10-01'), accountId: 'acc-a' },
      env.deps,
    )
    expect(result.lateChargesCents).toBe(0)
    expect(result.transactionIds.fee).toBeNull()
    expect(result.transactionIds.interest).toBeNull()
    expect([...env.ledger.repo.txns.values()].filter((t) => t.kind !== 'ADJUSTMENT')).toHaveLength(
      1,
    )
  })

  it('pagar de novo: INSTALLMENT_ALREADY_PAID e nada novo no ledger', async () => {
    const { env, loan } = await setup()
    const input = { loanId: loan.id, number: 1, payDate: day('2026-10-01'), accountId: 'acc-a' }
    await registerInstallmentPayment(USER, input, env.deps)
    const count = env.ledger.repo.txns.size
    expect(await debtErrorCode(() => registerInstallmentPayment(USER, input, env.deps))).toBe(
      'INSTALLMENT_ALREADY_PAID',
    )
    expect(env.ledger.repo.txns.size).toBe(count)
  })

  it('saldo devedor recalculado a cada pagamento e a última parcela quita o contrato', async () => {
    const { env, loan } = await setup()
    const schedule = buildAmortizationSchedule({
      principal: 1_000_000,
      monthlyRate: loan.monthlyRate,
      installments: 12,
      firstDueDate: day('2026-10-01'),
      installmentAmount: 94_560,
    })
    for (let n = 1; n <= 12; n += 1) {
      const result = await registerInstallmentPayment(
        USER,
        { loanId: loan.id, number: n, payDate: day('2026-10-01'), accountId: 'acc-a' },
        env.deps,
      )
      expect(result.outstandingCents).toBe(outstandingBalance(schedule, n))
      expect(result.loanStatus).toBe(n === 12 ? 'PAID_OFF' : 'ACTIVE')
    }
    const stored = await env.loans.findLoan(USER, loan.id)
    expect(stored).toMatchObject({ status: 'PAID_OFF', outstandingCents: 0 })
    expect(expectCacheMatchesLedger(env.ledger.repo)).toBeUndefined()
  })

  it('fora de ordem é permitido e sinalizado; saldo sai da parcela paga', async () => {
    const { env, loan } = await setup()
    const result = await registerInstallmentPayment(
      USER,
      { loanId: loan.id, number: 3, payDate: day('2026-10-01'), accountId: 'acc-a' },
      env.deps,
    )
    expect(result.outOfOrder).toBe(true)
    const installments = await env.loans.listInstallments(USER, loan.id)
    expect(result.outstandingCents).toBe(
      installments
        .filter((i) => i.status === 'PENDING')
        .reduce((sum, i) => sum + i.principalCents, 0),
    )
  })

  it('valor real debitado pelo banco (amountPaid) prevalece; menor que a parcela é rejeitado', async () => {
    const { env, loan } = await setup()
    const result = await registerInstallmentPayment(
      USER,
      {
        loanId: loan.id,
        number: 1,
        payDate: day('2026-10-11'),
        accountId: 'acc-a',
        amountPaid: 96_000,
      },
      env.deps,
    )
    // extra = 96000 - 94560 = 1440: multa limitada a 1440, sem juros separados.
    expect(result.lateChargesCents).toBe(1440)
    expect(result.paidAmountCents).toBe(96_000)
    const kinds = [...env.ledger.repo.txns.values()].filter((t) => t.kind !== 'ADJUSTMENT')
    expect(kinds.map((t) => [t.kind, t.amount]).sort()).toEqual(
      [
        ['EXPENSE', -94_560],
        ['FEE', -1440],
      ].sort(),
    )

    expect(
      await debtErrorCode(() =>
        registerInstallmentPayment(
          USER,
          {
            loanId: loan.id,
            number: 2,
            payDate: day('2026-10-11'),
            accountId: 'acc-a',
            amountPaid: 90_000,
          },
          env.deps,
        ),
      ),
    ).toBe('DEBT_PARTIAL_PAYMENT_UNSUPPORTED')
  })

  it('atomicidade: falha no 3º lançamento desfaz os dois primeiros e a parcela segue PENDING', async () => {
    const { env, loan, balanceOf } = await setup()
    const before = await balanceOf()
    const txnCount = env.ledger.repo.txns.size
    env.ledger.repo.failOn('insertTxn', 3)
    await expect(
      registerInstallmentPayment(
        USER,
        { loanId: loan.id, number: 1, payDate: day('2026-10-11'), accountId: 'acc-a' },
        env.deps,
      ),
    ).rejects.toThrow(/falha injetada/)
    expect(env.ledger.repo.txns.size).toBe(txnCount)
    expect(await balanceOf()).toBe(before)
    const [first] = await env.loans.listInstallments(USER, loan.id)
    expect(first).toMatchObject({ status: 'PENDING', transactionId: null, lateChargesCents: 0 })
    expect((await env.loans.findLoan(USER, loan.id))?.outstandingCents).toBe(1_000_000)
    expect(expectCacheMatchesLedger(env.ledger.repo)).toBeUndefined()
  })

  it('conta de cheque especial: pagar a parcela usa o limite e devolve o aviso do ledger', async () => {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(
      USER,
      { ...consignado, firstDueDate: day('2026-10-01') },
      env.deps,
    )
    const result = await registerInstallmentPayment(
      USER,
      { loanId: loan.id, number: 1, payDate: day('2026-10-01'), accountId: 'acc-a' },
      env.deps,
    )
    expect(result.warnings.map((w) => w.code)).toContain('OVERDRAFT_USED')
  })

  it('rejeita: parcela inexistente, dívida de outro usuário, tipo sem parcelas, cartão como origem, data inválida', async () => {
    const { env, loan } = await setup()
    const pay = (patch: object, user = USER) =>
      debtErrorCode(() =>
        registerInstallmentPayment(
          user,
          { loanId: loan.id, number: 1, payDate: day('2026-10-01'), accountId: 'acc-a', ...patch },
          env.deps,
        ),
      )
    expect(await pay({ number: 99 })).toBe('DEBT_INSTALLMENT_NOT_FOUND')
    expect(await pay({ number: 0 })).toBe('DEBT_INVALID_INPUT')
    expect(await pay({ payDate: new Date('x') })).toBe('DEBT_INVALID_INPUT')
    expect(await pay({ accountId: 'acc-card' })).toBe('DEBT_INVALID_INPUT')
    expect(await pay({ accountId: 'nao-existe' })).toBe('DEBT_ACCOUNT_NOT_FOUND')
    expect(await pay({ amountPaid: 0 })).toBe('DEBT_INVALID_INPUT')
    expect(await pay({}, OTHER_USER)).toBe('DEBT_LOAN_NOT_FOUND')
    const overdraft = await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'x', accountId: 'acc-a', monthlyRate: 0.08 },
      env.deps,
    )
    expect(
      await debtErrorCode(() =>
        registerInstallmentPayment(
          USER,
          { loanId: overdraft.loan.id, number: 1, payDate: day('2026-10-01'), accountId: 'acc-a' },
          env.deps,
        ),
      ),
    ).toBe('DEBT_NOT_INSTALLMENT_LOAN')
  })

  it('parcela ignorada (SKIPPED) não é paga', async () => {
    const { env, loan } = await setup()
    const list = env.loans.installments.get(loan.id)!
    list[0] = { ...list[0], status: 'SKIPPED' }
    expect(
      await debtErrorCode(() =>
        registerInstallmentPayment(
          USER,
          { loanId: loan.id, number: 1, payDate: day('2026-10-01'), accountId: 'acc-a' },
          env.deps,
        ),
      ),
    ).toBe('DEBT_INSTALLMENT_NOT_PAYABLE')
  })

  it('multa e mora personalizadas por contrato valem no pagamento', async () => {
    const env = makeDebtsEnv()
    await seedBalance(env, 'acc-a', 500_000)
    const { loan } = await createLoan(
      USER,
      {
        ...consignado,
        firstDueDate: day('2026-10-01'),
        lateFeeRate: 0.05,
        lateInterestMonthlyRate: 0.03,
      },
      env.deps,
    )
    const result = await registerInstallmentPayment(
      USER,
      { loanId: loan.id, number: 1, payDate: day('2026-10-11'), accountId: 'acc-a' },
      env.deps,
    )
    expect(result.computedCharges.fee).toBe(Math.round(94_560 * 0.05))
    expect(result.computedCharges.interest).toBe(Math.round((94_560 * 0.03 * 10) / 30))
  })
})

describe('updateLoan, archiveLoan, deleteLoan', () => {
  it('edita campos descritivos; taxa de parcelado não muda; status DEFAULTED; sem patch devolve igual', async () => {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(USER, consignado, env.deps)
    const updated = await updateLoan(
      USER,
      loan.id,
      { name: 'Novo nome', notes: ' anotação ', lateFeeRate: 0.1, status: 'DEFAULTED' },
      env.deps,
    )
    expect(updated).toMatchObject({
      name: 'Novo nome',
      notes: 'anotação',
      lateFeeRate: 0.1,
      status: 'DEFAULTED',
    })
    expect(
      await debtErrorCode(() => updateLoan(USER, loan.id, { monthlyRate: 0.05 }, env.deps)),
    ).toBe('DEBT_INVALID_INPUT')
    expect(
      await debtErrorCode(() => updateLoan(USER, loan.id, { name: 'CPF 12345678901' }, env.deps)),
    ).toBe('DEBT_INVALID_INPUT')
    expect(
      await debtErrorCode(() => updateLoan(USER, loan.id, { accountId: 'acc-other' }, env.deps)),
    ).toBe('DEBT_ACCOUNT_NOT_FOUND')
    expect(await debtErrorCode(() => updateLoan(USER, loan.id, { lateFeeRate: 2 }, env.deps))).toBe(
      'DEBT_INVALID_INPUT',
    )
    expect(await updateLoan(USER, loan.id, {}, env.deps)).toMatchObject({ name: 'Novo nome' })
    expect(
      await debtErrorCode(() => updateLoan(OTHER_USER, loan.id, { name: 'x' }, env.deps)),
    ).toBe('DEBT_LOAN_NOT_FOUND')
  })

  it('cheque especial aceita nova taxa; encerrado não reabre', async () => {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(
      USER,
      { kind: 'OVERDRAFT', name: 'Cheque especial', accountId: 'acc-a', monthlyRate: 0.08 },
      env.deps,
    )
    expect((await updateLoan(USER, loan.id, { monthlyRate: 0.09 }, env.deps)).monthlyRate).toBe(
      0.09,
    )
    await archiveLoan(USER, loan.id, env.deps)
    expect(
      await debtErrorCode(() => updateLoan(USER, loan.id, { status: 'ACTIVE' }, env.deps)),
    ).toBe('DEBT_INVALID_INPUT')
  })

  it('apagar: bloqueado com parcela paga no sistema; livre com parcelas pré-pagas ou sem pagamentos', async () => {
    const env = makeDebtsEnv()
    await seedBalance(env, 'acc-a', 500_000)
    const paid = await createLoan(
      USER,
      { ...consignado, firstDueDate: day('2026-10-01') },
      env.deps,
    )
    await registerInstallmentPayment(
      USER,
      { loanId: paid.loan.id, number: 1, payDate: day('2026-10-01'), accountId: 'acc-a' },
      env.deps,
    )
    expect(await debtErrorCode(() => deleteLoan(USER, paid.loan.id, env.deps))).toBe(
      'DEBT_LOAN_HAS_PAID_INSTALLMENTS',
    )
    expect(env.loans.loans.has(paid.loan.id)).toBe(true)

    const prePaid = await createLoan(USER, { ...consignado, alreadyPaidInstallments: 2 }, env.deps)
    await deleteLoan(USER, prePaid.loan.id, env.deps)
    expect(env.loans.loans.has(prePaid.loan.id)).toBe(false)
    expect(env.loans.installments.has(prePaid.loan.id)).toBe(false)
    expect(await debtErrorCode(() => deleteLoan(USER, prePaid.loan.id, env.deps))).toBe(
      'DEBT_LOAN_NOT_FOUND',
    )
    expect(await debtErrorCode(() => deleteLoan(OTHER_USER, paid.loan.id, env.deps))).toBe(
      'DEBT_LOAN_NOT_FOUND',
    )
  })

  it('encerrar (archive) tira a dívida de listas e obrigações sem apagar o histórico', async () => {
    const env = makeDebtsEnv()
    const { loan } = await createLoan(USER, consignado, env.deps)
    const archived = await archiveLoan(USER, loan.id, env.deps)
    expect(archived.status).toBe('PAID_OFF')
    expect(env.loans.installments.get(loan.id)).toHaveLength(12)
    expect(await env.loans.listOpenInstallments(USER, day('2030-01-01'))).toEqual([])
  })
})
