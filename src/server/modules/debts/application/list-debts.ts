import { businessCalendarDay } from '../domain/calendar'
import { rankDebtsByRate } from '../domain/rate'
import {
  assessInstallment,
  summarizeDebt,
  type DebtSummary,
  type InstallmentAssessment,
} from '../domain/summary'
import { isInstallmentKind, type InstallmentRecord, type LoanRecord } from '../domain/types'
import type { DebtsDeps } from './ports'
import { buildSummaryInput, requireLoan } from './shared'

export interface DebtTotals {
  totalOutstanding: number
  totalMonthlyInterestCost: number
  /** Σ valor devido hoje das parcelas vencidas (principal + encargos), centavos. */
  overdueAmount: number
}

export interface ListDebtsResult {
  /** Ordenadas por taxa mensal decrescente (`rankDebtsByRate`). */
  debts: DebtSummary[]
  totals: DebtTotals
}

export interface ListDebtsOptions {
  now: Date
  /**
   * Inclui cheque especial/rotativo sem uso (custo 0). Padrão `false`: dívida sem saldo não
   * aparece na lista de Planejar (decisão FC2-F1-05).
   */
  includeIdle?: boolean
}

export function totalsOf(debts: readonly DebtSummary[]): DebtTotals {
  return {
    totalOutstanding: debts.reduce((sum, debt) => sum + debt.outstanding, 0),
    totalMonthlyInterestCost: debts.reduce((sum, debt) => sum + debt.monthlyInterestCost, 0),
    overdueAmount: debts.reduce((sum, debt) => sum + debt.overdueAmount, 0),
  }
}

/** Dívidas ativas com resumo (saldo, custo mensal, prazo), ordenadas por taxa, mais os totais. */
export async function listDebts(
  userId: string,
  options: ListDebtsOptions,
  deps: DebtsDeps,
): Promise<ListDebtsResult> {
  const today = businessCalendarDay(options.now)
  const loans = await deps.loans.listLoans(userId, { statuses: ['ACTIVE', 'DEFAULTED'] })
  const installmentLoanIds = loans.filter((loan) => isInstallmentKind(loan.kind)).map((l) => l.id)
  const installmentsByLoan = await deps.loans.listInstallmentsByLoans(userId, installmentLoanIds)

  const summaries: DebtSummary[] = []
  for (const loan of loans) {
    const input = await buildSummaryInput(
      deps,
      userId,
      loan,
      installmentsByLoan.get(loan.id) ?? [],
      today,
    )
    const summary = summarizeDebt(input, options.now)
    const idle = summary.outstanding === 0 && summary.overdueCount === 0
    if (idle && !options.includeIdle) continue
    summaries.push(summary)
  }

  const ranking = rankDebtsByRate(
    summaries.map((summary) => ({
      id: summary.id,
      monthlyRate: summary.monthlyRate,
      monthlyCost: summary.monthlyInterestCost,
      outstanding: summary.outstanding,
    })),
  )
  const byId = new Map(summaries.map((summary) => [summary.id, summary]))
  const debts = ranking.map((item) => byId.get(item.id)!)
  return { debts, totals: totalsOf(debts) }
}

/** Só os totais ("juros que você paga por mês", dívida total) para o cabeçalho de Planejar. */
export async function getDebtSummary(
  userId: string,
  options: ListDebtsOptions,
  deps: DebtsDeps,
): Promise<DebtTotals & { debtCount: number }> {
  const { debts, totals } = await listDebts(userId, options, deps)
  return { ...totals, debtCount: debts.length }
}

export interface InstallmentDetail extends InstallmentAssessment {
  id: string
  /** Status persistido (`PENDING|PAID|SKIPPED`); `status` é o calculado. */
  storedStatus: InstallmentRecord['status']
  paidAt: Date | null
  paidAmountCents: number | null
  /** Encargos efetivamente pagos (parcelas pagas). */
  paidLateChargesCents: number
  transactionId: string | null
}

export interface DebtDetail {
  loan: LoanRecord
  summary: DebtSummary
  installments: InstallmentDetail[]
}

/** Cronograma com status calculado e encargos de atraso de cada parcela vencida. */
export async function getDebtDetail(
  userId: string,
  loanId: string,
  options: { now: Date },
  deps: DebtsDeps,
): Promise<DebtDetail> {
  const today = businessCalendarDay(options.now)
  const loan = await requireLoan(deps, userId, loanId)
  const records = isInstallmentKind(loan.kind)
    ? await deps.loans.listInstallments(userId, loanId)
    : []
  const summary = summarizeDebt(
    await buildSummaryInput(deps, userId, loan, records, today),
    options.now,
  )
  const installments = records
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((record): InstallmentDetail => {
      const assessed = assessInstallment(record, loan, options.now)
      return {
        ...assessed,
        id: record.id,
        storedStatus: record.status,
        paidAt: record.paidAt,
        paidAmountCents: record.paidAmountCents,
        paidLateChargesCents: record.lateChargesCents,
        transactionId: record.transactionId,
      }
    })
  return { loan, summary, installments }
}
