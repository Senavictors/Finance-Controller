import { businessCalendarDay } from '../domain/calendar'
import { DebtError } from '../domain/errors'
import { payoffDate, simulateAmortization, type PayoffSimulation } from '../domain/payoff'
import { isInstallmentKind } from '../domain/types'
import type { DebtsDeps } from './ports'
import { requireLoan } from './shared'

export interface SimulatePayoffInput {
  loanId: string
  /** Valor extra por mês, além da parcela do contrato, centavos. */
  extraMonthlyPayment?: number
  /** Pagamento à vista hoje (quitação antecipada simples), centavos. */
  lumpSum?: number
  now: Date
}

export interface PayoffScenario extends Pick<
  PayoffSimulation,
  'months' | 'totalInterest' | 'totalPaid' | 'neverPaysOff'
> {
  monthlyPayment: number
  lumpSum: number
  payoffDate: Date | null
}

export interface SimulatePayoffResult {
  loanId: string
  /** Saldo devedor (Σ principal das parcelas em aberto), centavos. */
  balance: number
  baseline: PayoffScenario
  scenario: PayoffScenario
  monthsSaved: number
  interestSaved: number
  assumptions: string[]
}

function scenarioOf(
  simulation: PayoffSimulation,
  monthlyPayment: number,
  lumpSum: number,
  anchor: Date,
): PayoffScenario {
  return {
    months: simulation.months,
    totalInterest: simulation.totalInterest,
    totalPaid: simulation.totalPaid,
    neverPaysOff: simulation.neverPaysOff,
    monthlyPayment,
    lumpSum: simulation.lumpSumApplied,
    // A 1ª parcela do cenário cai em `anchor`; a última em `anchor + (meses - 1)`.
    payoffDate: Number.isFinite(simulation.months)
      ? payoffDate(anchor, Math.max(0, simulation.months - 1))
      : null,
  }
}

/**
 * Simulação somente leitura: quanto prazo e juros se economizam pagando um extra mensal e/ou
 * um valor à vista. Baseline e cenário usam o MESMO método (mês a mês, juros arredondados).
 */
export async function simulatePayoff(
  userId: string,
  input: SimulatePayoffInput,
  deps: DebtsDeps,
): Promise<SimulatePayoffResult> {
  const extra = input.extraMonthlyPayment ?? 0
  const lumpSum = input.lumpSum ?? 0
  if (!Number.isInteger(extra) || extra < 0 || !Number.isInteger(lumpSum) || lumpSum < 0) {
    throw new DebtError(
      'DEBT_INVALID_INPUT',
      'Extra mensal e valor à vista devem ser inteiros >= 0.',
    )
  }
  const loan = await requireLoan(deps, userId, input.loanId)
  if (!isInstallmentKind(loan.kind)) {
    throw new DebtError('DEBT_NOT_INSTALLMENT_LOAN', 'A simulação vale para dívidas parceladas.')
  }
  const installments = await deps.loans.listInstallments(userId, loan.id)
  const open = installments
    .filter((item) => item.status === 'PENDING')
    .sort((a, b) => a.number - b.number)
  const balance = open.reduce((sum, item) => sum + item.principalCents, 0)
  const today = businessCalendarDay(input.now)
  const anchor = open[0]?.dueDate ?? today
  const basePayment = loan.installmentAmountCents ?? open[0]?.amountCents ?? 0

  const baseline = simulateAmortization({
    balance,
    monthlyRate: loan.monthlyRate,
    monthlyPayment: basePayment,
    forcePayoffAtMonth: open.length,
  })
  const scenario = simulateAmortization({
    balance,
    monthlyRate: loan.monthlyRate,
    monthlyPayment: basePayment + extra,
    lumpSum,
    forcePayoffAtMonth: open.length,
  })
  const monthsSaved =
    Number.isFinite(baseline.months) && Number.isFinite(scenario.months)
      ? baseline.months - scenario.months
      : 0
  const interestSaved =
    baseline.neverPaysOff || scenario.neverPaysOff
      ? 0
      : baseline.totalInterest - scenario.totalInterest

  return {
    loanId: loan.id,
    balance,
    baseline: scenarioOf(baseline, basePayment, 0, anchor),
    scenario: scenarioOf(scenario, basePayment + extra, lumpSum, anchor),
    monthsSaved,
    interestSaved,
    assumptions: [
      'Juros mensais = saldo devedor x taxa do contrato, arredondados ao centavo a cada mês.',
      'O pagamento à vista abate o saldo hoje; o extra mensal soma à parcela do contrato.',
      'Encargos de atraso e IOF/seguros do contrato não entram na simulação.',
    ],
  }
}
