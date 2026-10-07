import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { LedgerService } from '@/server/modules/ledger'
import { getLedgerService } from '@/server/modules/ledger/service'
import type { PrismaClient } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { createLoan } from '../application/create-loan'
import { getDebtDetail, listDebts } from '../application/list-debts'
import { listPendingDebtObligations } from '../application/list-pending-obligations'
import { deleteLoan } from '../application/manage-loan'
import type { DebtsDeps } from '../application/ports'
import { registerInstallmentPayment } from '../application/register-installment-payment'
import { createPrismaLoanRepository } from './prisma-loan-repository'
import { createPrismaCardRevolvingReader, createPrismaCategoryKeyLookup } from './prisma-readers'

/**
 * FC2-F1-05: repositório Prisma de dívidas com o ledger real no Postgres de teste. Cobre a
 * atomicidade do pagamento de parcela (parcela + multa + juros + `LoanInstallment` na mesma
 * transação), a corrida de pagamento duplicado e a conversão `Decimal` <-> fração. Só roda com
 * `DATABASE_URL_TEST` (database descartável).
 */
// `getLedgerService()` (API pública do ledger) usa `@/server/db`: aqui ele aponta para o banco de
// teste (ou `null`, e a suíte inteira é pulada).
vi.mock('@/server/db', async () => {
  const { getTestDb } = await import('../../../../../tests/helpers/db')
  return { prisma: getTestDb() }
})
const db = prisma as PrismaClient | null
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

const consignado = {
  kind: 'CONSIGNADO' as const,
  name: 'Consignado fictício',
  lenderName: 'Banco Exemplo',
  principalCents: 1_000_000,
  installmentAmountCents: 94_560,
  installmentCount: 12,
  firstDueDate: day('2026-09-01'),
}

describe.skipIf(!db)('debts: repositório Prisma (DATABASE_URL_TEST)', { timeout: 60_000 }, () => {
  const client = db!
  const userId = `debts-user-${randomUUID()}`
  const otherUserId = `debts-other-${randomUUID()}`
  let ledger: LedgerService
  let deps: DebtsDeps
  /** Quando > 0, o N-ésimo `createTransaction` do unit of work lança (simula falha no meio). */
  let failOnCall = 0
  let calls = 0
  let accountId = ''
  let overdraftAccountId = ''

  async function newAccount(name: string, extra: object = {}) {
    return client.account.create({
      data: { userId, name: `${name} ${randomUUID().slice(0, 8)}`, type: 'CHECKING', ...extra },
    })
  }

  async function seedBalance(id: string, amount: number) {
    await ledger.createTransaction(
      { userId },
      {
        accountId: id,
        kind: 'ADJUSTMENT',
        amount,
        date: day('2026-08-01'),
        description: 'Saldo inicial',
        excludeFromBudget: true,
      },
    )
  }

  async function currentBalance(id: string): Promise<number> {
    const position = await ledger.getAccountPosition({ userId }, id)
    return position.current
  }

  beforeAll(async () => {
    await client.user.createMany({
      data: [
        { id: userId, email: `${userId}@example.invalid`, password: 'x' },
        { id: otherUserId, email: `${otherUserId}@example.invalid`, password: 'x' },
      ],
    })
    await client.category.createMany({
      data: [
        { key: 'parcelas-emprestimos', name: 'Parcelas de empréstimos', type: 'EXPENSE' as const },
        { key: 'juros-encargos', name: 'Juros e encargos', type: 'EXPENSE' as const },
        { key: 'multas-atrasos', name: 'Multas e atrasos', type: 'EXPENSE' as const },
      ].map((category) => ({ ...category, userId, isSystem: true })),
    })
    const realLedger = getLedgerService()
    // Ledger com falha injetável: o `failOnCall`-ésimo createTransaction do UoW lança.
    ledger = {
      ...realLedger,
      runInTransaction: (ctx, fn) =>
        realLedger.runInTransaction(ctx, (uow) =>
          fn({
            ...uow,
            createTransaction: async (input) => {
              calls += 1
              if (failOnCall > 0 && calls === failOnCall) {
                throw new Error('falha injetada no lançamento')
              }
              return uow.createTransaction(input)
            },
          }),
        ),
    }
    deps = {
      loans: createPrismaLoanRepository(client),
      ledger,
      cardStatements: createPrismaCardRevolvingReader(client),
      categories: createPrismaCategoryKeyLookup(client),
      newId: () => randomUUID(),
    }
    accountId = (await newAccount('Corrente')).id
    overdraftAccountId = (await newAccount('Corrente com limite', { overdraftLimit: 100_000 })).id
    await seedBalance(accountId, 500_000)
  })

  afterAll(async () => {
    await client.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
    await client.$disconnect()
  })

  it('createLoan grava Loan + parcelas; Decimal vira fração e percentuais voltam como fração', async () => {
    const { loan } = await createLoan(
      userId,
      {
        ...consignado,
        accountId,
        lateFeeRate: 0.02,
        lateInterestMonthlyRate: 0.01,
        alreadyPaidInstallments: 0,
      },
      deps,
    )
    const row = await client.loan.findUniqueOrThrow({ where: { id: loan.id } })
    expect(row.monthlyRate.toNumber()).toBeGreaterThanOrEqual(0.019999)
    expect(row.monthlyRate.toNumber()).toBeLessThanOrEqual(0.020001)
    expect(row.lateFeePct.toNumber()).toBe(2)
    expect(row.lateInterestMonthlyPct.toNumber()).toBe(1)
    expect(row.outstandingCents).toBe(1_000_000)

    const installments = await client.loanInstallment.findMany({
      where: { loanId: loan.id },
      orderBy: { number: 'asc' },
    })
    expect(installments).toHaveLength(12)
    expect(installments.reduce((sum, item) => sum + item.principalCents, 0)).toBe(1_000_000)
    expect(installments[0]?.dueDate.toISOString()).toBe('2026-09-01T12:00:00.000Z')

    const detail = await getDebtDetail(userId, loan.id, { now: day('2026-09-11') }, deps)
    expect(detail.loan.monthlyRate).toBeCloseTo(0.02, 5)
    expect(detail.loan.lateFeeRate).toBe(0.02)
    await deleteLoan(userId, loan.id, deps)
    expect(await client.loan.count({ where: { id: loan.id } })).toBe(0)
  })

  it('CA-12: pagamento atrasado cria 3 lançamentos, marca a parcela e debita 96766', async () => {
    const { loan } = await createLoan(userId, { ...consignado, accountId }, deps)
    const before = await currentBalance(accountId)

    const result = await registerInstallmentPayment(
      userId,
      { loanId: loan.id, number: 1, payDate: day('2026-09-11'), accountId },
      deps,
    )
    expect(result.paidAmountCents).toBe(96_766)
    expect(result.lateChargesCents).toBe(2_206)
    expect(await currentBalance(accountId)).toBe(before - 96_766)

    const installment = await client.loanInstallment.findFirstOrThrow({
      where: { loanId: loan.id, number: 1 },
    })
    expect(installment.status).toBe('PAID')
    expect(installment.paidAmountCents).toBe(96_766)
    expect(installment.lateChargesCents).toBe(2_206)
    expect(installment.transactionId).toBe(result.transactionIds.installment)

    const txns = await client.transaction.findMany({
      where: { id: { in: Object.values(result.transactionIds).filter((id) => id !== null) } },
      include: { category: true },
    })
    const byKind = Object.fromEntries(txns.map((txn) => [txn.kind, txn]))
    expect(byKind.EXPENSE?.amount).toBe(-94_560)
    expect(byKind.EXPENSE?.category?.key).toBe('parcelas-emprestimos')
    expect(byKind.FEE?.amount).toBe(-1_891)
    expect(byKind.FEE?.category?.key).toBe('multas-atrasos')
    expect(byKind.INTEREST?.amount).toBe(-315)
    expect(byKind.INTEREST?.category?.key).toBe('juros-encargos')

    const reloaded = await client.loan.findUniqueOrThrow({ where: { id: loan.id } })
    expect(reloaded.outstandingCents).toBe(result.outstandingCents)

    await expect(
      registerInstallmentPayment(
        userId,
        { loanId: loan.id, number: 1, payDate: day('2026-09-11'), accountId },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'INSTALLMENT_ALREADY_PAID' })
  })

  it('atomicidade: falha no 3º lançamento desfaz parcela, multa, juros e a LoanInstallment', async () => {
    const { loan } = await createLoan(userId, { ...consignado, accountId }, deps)
    const balanceBefore = await currentBalance(accountId)
    const txnCountBefore = await client.transaction.count({ where: { accountId } })

    failOnCall = calls + 3
    await expect(
      registerInstallmentPayment(
        userId,
        { loanId: loan.id, number: 1, payDate: day('2026-09-11'), accountId },
        deps,
      ),
    ).rejects.toThrow('falha injetada')
    failOnCall = 0

    expect(await client.transaction.count({ where: { accountId } })).toBe(txnCountBefore)
    expect(await currentBalance(accountId)).toBe(balanceBefore)
    const installment = await client.loanInstallment.findFirstOrThrow({
      where: { loanId: loan.id, number: 1 },
    })
    expect(installment.status).toBe('PENDING')
    expect(installment.transactionId).toBeNull()
    expect(installment.paidAmountCents).toBeNull()
    const reloaded = await client.loan.findUniqueOrThrow({ where: { id: loan.id } })
    expect(reloaded.outstandingCents).toBe(1_000_000)

    // A mesma parcela ainda pode ser paga depois da falha.
    const retry = await registerInstallmentPayment(
      userId,
      { loanId: loan.id, number: 1, payDate: day('2026-09-01'), accountId },
      deps,
    )
    expect(retry.paidAmountCents).toBe(94_560)
  })

  it('corrida: dois pagamentos simultâneos da mesma parcela, só um vence e debita uma vez', async () => {
    const { loan } = await createLoan(userId, { ...consignado, accountId }, deps)
    const balanceBefore = await currentBalance(accountId)
    const attempts = await Promise.allSettled([
      registerInstallmentPayment(
        userId,
        { loanId: loan.id, number: 1, payDate: day('2026-09-01'), accountId },
        deps,
      ),
      registerInstallmentPayment(
        userId,
        { loanId: loan.id, number: 1, payDate: day('2026-09-01'), accountId },
        deps,
      ),
    ])
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1)
    const rejected = attempts.find((a) => a.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ code: 'INSTALLMENT_ALREADY_PAID' })
    expect(await currentBalance(accountId)).toBe(balanceBefore - 94_560)
  })

  it('quitar a última parcela marca o contrato como PAID_OFF', async () => {
    const { loan } = await createLoan(
      userId,
      {
        ...consignado,
        accountId,
        installmentCount: 2,
        principalCents: 100_000,
        installmentAmountCents: 51_000,
      },
      deps,
    )
    await registerInstallmentPayment(
      userId,
      { loanId: loan.id, number: 2, payDate: day('2026-09-01'), accountId },
      deps,
    )
    const last = await registerInstallmentPayment(
      userId,
      { loanId: loan.id, number: 1, payDate: day('2026-09-01'), accountId },
      deps,
    )
    expect(last.loanStatus).toBe('PAID_OFF')
    expect(last.outstandingCents).toBe(0)
    const row = await client.loan.findUniqueOrThrow({ where: { id: loan.id } })
    expect(row.status).toBe('PAID_OFF')
  })

  it('listDebts e listPendingDebtObligations leem Prisma + ledger; isolamento por usuário', async () => {
    await seedBalance(overdraftAccountId, -50_000)
    await createLoan(
      userId,
      {
        kind: 'OVERDRAFT',
        name: 'Cheque especial fictício',
        accountId: overdraftAccountId,
        monthlyRate: 0.08,
      },
      deps,
    )
    const { loan: pix } = await createLoan(
      userId,
      {
        kind: 'PIX_CREDIT',
        name: 'Pix no crédito fictício',
        accountId,
        principalCents: 200_000,
        monthlyRate: 0.07,
        installmentCount: 6,
        firstDueDate: day('2026-10-20'),
      },
      deps,
    )

    const now = day('2026-10-11')
    const { debts, totals } = await listDebts(userId, { now }, deps)
    const rates = debts.map((debt) => debt.monthlyRate)
    expect(rates).toEqual([...rates].sort((a, b) => b - a))
    const overdraft = debts.find((debt) => debt.kind === 'OVERDRAFT')
    expect(overdraft?.outstanding).toBe(50_000)
    expect(overdraft?.monthlyInterestCost).toBe(4_000)
    expect(totals.totalOutstanding).toBe(debts.reduce((sum, debt) => sum + debt.outstanding, 0))

    const obligations = await listPendingDebtObligations(
      userId,
      { until: day('2026-10-31'), now },
      deps,
    )
    const pixObligation = obligations.find((item) => item.loanId === pix.id)
    expect(pixObligation?.number).toBe(1)
    expect(pixObligation?.amountDueNow).toBe(pixObligation?.amount)
    expect(obligations.every((item) => item.amountDueNow >= item.amount)).toBe(true)

    expect((await listDebts(otherUserId, { now }, deps)).debts).toEqual([])
    await expect(deleteLoan(otherUserId, pix.id, deps)).rejects.toMatchObject({
      code: 'DEBT_LOAN_NOT_FOUND',
    })
  })

  it('deleteLoan recusa contrato com parcela paga', async () => {
    const { loan } = await createLoan(userId, { ...consignado, accountId }, deps)
    await registerInstallmentPayment(
      userId,
      { loanId: loan.id, number: 1, payDate: day('2026-09-01'), accountId },
      deps,
    )
    await expect(deleteLoan(userId, loan.id, deps)).rejects.toMatchObject({
      code: expect.stringMatching(/^DEBT_/),
    })
    expect(await client.loan.count({ where: { id: loan.id } })).toBe(1)
  })
})
