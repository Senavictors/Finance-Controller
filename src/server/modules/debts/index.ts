/**
 * API pública do módulo `debts` (FC2-F1-05, ADR-028) para outros módulos de servidor (engine
 * Disponível F3-02, Planejar F3-05, metas F3-07, bot e MCP). Não importa `@/server/db`: use
 * `getDebtsDeps()` de `./infra/default-deps` na borda (rotas, jobs); testes passam repositórios
 * em memória. Documentação: `docs/domain/dividas.md`.
 */

// ---- use-cases -----------------------------------------------------------------------
export { createLoan, type CreateLoanResult } from './application/create-loan'
export {
  registerInstallmentPayment,
  type RegisterInstallmentPaymentInput,
  type RegisterInstallmentPaymentResult,
} from './application/register-installment-payment'
export {
  getDebtDetail,
  getDebtSummary,
  listDebts,
  type DebtDetail,
  type DebtTotals,
  type InstallmentDetail,
  type ListDebtsOptions,
  type ListDebtsResult,
} from './application/list-debts'
export {
  listPendingDebtObligations,
  type DebtObligation,
} from './application/list-pending-obligations'
export {
  simulatePayoff,
  type PayoffScenario,
  type SimulatePayoffInput,
  type SimulatePayoffResult,
} from './application/simulate-payoff'
export {
  estimateOverdraftCost,
  type EstimateOverdraftCostInput,
  type OverdraftCostEstimate,
} from './application/estimate-overdraft-cost'
export {
  archiveLoan,
  deleteLoan,
  updateLoan,
  type UpdateLoanInput,
} from './application/manage-loan'

// ---- portas --------------------------------------------------------------------------
export type {
  CardRevolvingReader,
  CategoryKeyLookup,
  DebtsDeps,
  LoanRepository,
  RevolvingBalance,
} from './application/ports'

// ---- domínio puro (cálculos reutilizáveis) ---------------------------------------------
export {
  buildAmortizationSchedule,
  impliedMonthlyRate,
  outstandingBalance,
  priceInstallment,
  type AmortizationRow,
} from './domain/price'
export { daysLate, installmentStatus, lateCharges, type LateCharges } from './domain/late-charges'
export { estimateOverdraftCostFromSeries, overdraftMonthlyCost } from './domain/overdraft'
export { revolvingMonthlyCost, revolvingMonthlyCostDetail } from './domain/revolving'
export { monthsToPayoff, payoffDate, simulateAmortization } from './domain/payoff'
export { annualEquivalent, rankDebtsByRate, type RankableDebt } from './domain/rate'
export { assessInstallment, summarizeDebt, type DebtSummary } from './domain/summary'
export { planNewLoan, type NewLoanInput } from './domain/new-loan'
export { DEBT_ERROR_CODES, DebtError, isDebtError, type DebtErrorCode } from './domain/errors'
export {
  INSTALLMENT_KINDS,
  LOAN_KINDS,
  type InstallmentRecord,
  type LoanKind,
  type LoanRecord,
  type LoanStatus,
} from './domain/types'
