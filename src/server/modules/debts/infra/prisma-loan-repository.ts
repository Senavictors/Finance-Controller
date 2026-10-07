import type { Loan, LoanInstallment, PrismaClient } from '@/generated/prisma/client'
import { prismaClientOf, type TransactionHandle } from '@/server/modules/ledger'
import type {
  LoanRepository,
  LoanStatePatch,
  LoanUpdateFields,
  MarkInstallmentPaidInput,
  OpenInstallmentRow,
} from '../application/ports'
import type { PlannedInstallment, PlannedLoan } from '../domain/new-loan'
import type { InstallmentRecord, LoanRecord } from '../domain/types'

/** Percentual do banco (Decimal(5,2): 2 = 2%) <-> fração do domínio (0.02). */
const pctToRate = (pct: { toNumber(): number }): number => pct.toNumber() / 100
const rateToPct = (rate: number): number => Number((rate * 100).toFixed(2))

/** `Decimal` -> `number` só aqui, na borda do repositório. */
export function toLoanRecord(row: Loan): LoanRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    name: row.name,
    lenderName: row.lenderName,
    accountId: row.accountId,
    principalCents: row.principalCents,
    monthlyRate: row.monthlyRate.toNumber(),
    installmentCount: row.installmentCount,
    installmentAmountCents: row.installmentAmountCents,
    firstDueDate: row.firstDueDate,
    contractedAt: row.contractedAt,
    outstandingCents: row.outstandingCents,
    lateFeeRate: pctToRate(row.lateFeePct),
    lateInterestMonthlyRate: pctToRate(row.lateInterestMonthlyPct),
    status: row.status,
    categoryId: row.categoryId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function toInstallmentRecord(row: LoanInstallment): InstallmentRecord {
  return {
    id: row.id,
    loanId: row.loanId,
    number: row.number,
    dueDate: row.dueDate,
    principalCents: row.principalCents,
    interestCents: row.interestCents,
    amountCents: row.amountCents,
    status: row.status,
    paidAt: row.paidAt,
    paidAmountCents: row.paidAmountCents,
    lateChargesCents: row.lateChargesCents,
    transactionId: row.transactionId,
  }
}

/**
 * Repositório Prisma de dívidas. Recebe o cliente por parâmetro (app: `@/server/db`; testes de
 * integração: `getTestDb()`). Com `tx` (handle do unit of work do ledger) a escrita entra na
 * mesma transação dos lançamentos. Todas as consultas filtram por `userId`.
 */
export function createPrismaLoanRepository(db: PrismaClient): LoanRepository {
  const clientOf = (tx?: TransactionHandle) => (tx ? prismaClientOf(tx) : db)

  return {
    async insertLoan(userId, id, loan: PlannedLoan, installments: readonly PlannedInstallment[]) {
      const { rateInferred: _rateInferred, lateFeeRate, lateInterestMonthlyRate, ...fields } = loan
      void _rateInferred
      const row = await db.loan.create({
        data: {
          ...fields,
          id,
          userId,
          lateFeePct: rateToPct(lateFeeRate),
          lateInterestMonthlyPct: rateToPct(lateInterestMonthlyRate),
          installments: {
            create: installments.map((item) => ({
              number: item.number,
              dueDate: item.dueDate,
              principalCents: item.principalCents,
              interestCents: item.interestCents,
              amountCents: item.amountCents,
              status: item.status,
              paidAt: item.paidAt,
              paidAmountCents: item.paidAmountCents,
            })),
          },
        },
      })
      return toLoanRecord(row)
    },

    async findLoan(userId, loanId, tx) {
      const row = await clientOf(tx).loan.findFirst({ where: { id: loanId, userId } })
      return row ? toLoanRecord(row) : null
    },

    async listLoans(userId, filter = {}) {
      const rows = await db.loan.findMany({
        where: {
          userId,
          ...(filter.statuses ? { status: { in: [...filter.statuses] } } : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
      return rows.map(toLoanRecord)
    },

    async findLoanByAccount(userId, accountId, kind) {
      const row = await db.loan.findFirst({
        where: { userId, accountId, kind, status: { not: 'PAID_OFF' } },
      })
      return row ? toLoanRecord(row) : null
    },

    async listInstallments(userId, loanId, tx) {
      const rows = await clientOf(tx).loanInstallment.findMany({
        where: { loanId, loan: { userId } },
        orderBy: { number: 'asc' },
      })
      return rows.map(toInstallmentRecord)
    },

    async listInstallmentsByLoans(userId, loanIds) {
      const result = new Map<string, InstallmentRecord[]>()
      if (loanIds.length === 0) return result
      const rows = await db.loanInstallment.findMany({
        where: { loanId: { in: [...loanIds] }, loan: { userId } },
        orderBy: [{ loanId: 'asc' }, { number: 'asc' }],
      })
      for (const row of rows) {
        const list = result.get(row.loanId) ?? []
        list.push(toInstallmentRecord(row))
        result.set(row.loanId, list)
      }
      return result
    },

    async listOpenInstallments(userId, until): Promise<OpenInstallmentRow[]> {
      const rows = await db.loanInstallment.findMany({
        where: {
          status: 'PENDING',
          dueDate: { lte: until },
          loan: { userId, status: { in: ['ACTIVE', 'DEFAULTED'] } },
        },
        include: { loan: true },
        orderBy: [{ dueDate: 'asc' }, { loanId: 'asc' }, { number: 'asc' }],
      })
      return rows.map(({ loan, ...installment }) => {
        const record = toLoanRecord(loan)
        return {
          installment: toInstallmentRecord(installment),
          loan: {
            id: record.id,
            kind: record.kind,
            name: record.name,
            accountId: record.accountId,
            installmentCount: record.installmentCount,
            lateFeeRate: record.lateFeeRate,
            lateInterestMonthlyRate: record.lateInterestMonthlyRate,
            categoryId: record.categoryId,
          },
        }
      })
    },

    async lockLoan(userId, loanId, tx) {
      await prismaClientOf(tx)
        .$queryRaw`SELECT id FROM loans WHERE id = ${loanId} AND user_id = ${userId} FOR UPDATE`
    },

    async markInstallmentPaid(userId, input: MarkInstallmentPaidInput, tx) {
      const result = await prismaClientOf(tx).loanInstallment.updateMany({
        where: {
          loanId: input.loanId,
          number: input.number,
          status: 'PENDING',
          loan: { userId },
        },
        data: {
          status: 'PAID',
          paidAt: input.paidAt,
          paidAmountCents: input.paidAmountCents,
          lateChargesCents: input.lateChargesCents,
          transactionId: input.transactionId,
        },
      })
      return result.count === 1
    },

    async updateLoanState(userId, loanId, patch: LoanStatePatch, tx) {
      await prismaClientOf(tx).loan.updateMany({
        where: { id: loanId, userId },
        data: { outstandingCents: patch.outstandingCents, status: patch.status },
      })
    },

    async updateLoan(userId, loanId, patch: LoanUpdateFields) {
      const { lateFeeRate, lateInterestMonthlyRate, ...rest } = patch
      const result = await db.loan.updateMany({
        where: { id: loanId, userId },
        data: {
          ...rest,
          ...(lateFeeRate !== undefined ? { lateFeePct: rateToPct(lateFeeRate) } : {}),
          ...(lateInterestMonthlyRate !== undefined
            ? { lateInterestMonthlyPct: rateToPct(lateInterestMonthlyRate) }
            : {}),
        },
      })
      if (result.count === 0) return null
      const row = await db.loan.findFirst({ where: { id: loanId, userId } })
      return row ? toLoanRecord(row) : null
    },

    async deleteLoan(userId, loanId) {
      const result = await db.loan.deleteMany({ where: { id: loanId, userId } })
      return result.count > 0
    },
  }
}
