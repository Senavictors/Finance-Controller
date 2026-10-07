/**
 * Resumo explicável de uma dívida (ADR-028): saldo, taxa, custo mensal, próxima parcela e prazo.
 * Função pura; "hoje" é o dia de calendário de São Paulo derivado do `now` recebido.
 */
import { businessCalendarDay } from './calendar'
import { DebtError } from './errors'
import {
  installmentStatus,
  lateCharges,
  type InstallmentState,
  type LateCharges,
} from './late-charges'
import { monthsToPayoff, payoffDate } from './payoff'
import { overdraftMonthlyCost } from './overdraft'
import { annualEquivalent } from './rate'
import { revolvingMonthlyCostDetail } from './revolving'
import { isInstallmentKind, type LoanKind, type StoredInstallmentStatus } from './types'

export interface SummaryInstallment {
  number: number
  dueDate: Date
  principalCents: number
  interestCents: number
  amountCents: number
  status: StoredInstallmentStatus
}

export interface LateRates {
  /** Multa única (fração). */
  lateFeeRate: number
  /** Juros de mora mensais (fração). */
  lateInterestMonthlyRate: number
}

export interface InstallmentAssessment {
  number: number
  dueDate: Date
  principalCents: number
  interestCents: number
  amountCents: number
  status: InstallmentState
  /** Encargos de atraso até hoje (zerados se não vencida ou já paga). */
  lateCharges: LateCharges
  /** Valor a pagar hoje: parcela + encargos (parcela paga/ignorada = 0). */
  amountDueNow: number
}

/** Avalia uma parcela em `now`: status calculado, encargos de atraso e valor devido agora. */
export function assessInstallment(
  installment: SummaryInstallment,
  rates: LateRates,
  now: Date,
): InstallmentAssessment {
  const status = installmentStatus(installment, now)
  const charges: LateCharges =
    status === 'OVERDUE'
      ? lateCharges({
          amount: installment.amountCents,
          dueDate: installment.dueDate,
          payDate: businessCalendarDay(now),
          lateFeePct: rates.lateFeeRate,
          lateInterestMonthly: rates.lateInterestMonthlyRate,
        })
      : { fee: 0, interest: 0, total: 0, days: 0 }
  const open = status === 'PENDING' || status === 'OVERDUE'
  return {
    number: installment.number,
    dueDate: installment.dueDate,
    principalCents: installment.principalCents,
    interestCents: installment.interestCents,
    amountCents: installment.amountCents,
    status,
    lateCharges: charges,
    amountDueNow: open ? installment.amountCents + charges.total : 0,
  }
}

export interface OverdraftUsage {
  /** Uso dentro do limite (do ledger), centavos. */
  used: number
  /** Excedente além do limite (do ledger), centavos. */
  excess?: number
  limit?: number
  iofMonthly?: number
  /** Pagamento mensal planejado: habilita a data prevista de quitação. */
  plannedMonthlyPayment?: number
}

export interface RevolvingUsage {
  /** Fatura em atraso/rotativo ainda não paga, centavos. */
  unpaid: number
  originalPrincipal?: number
  interestAlreadyCharged?: number
  capMultiple?: number
  plannedMonthlyPayment?: number
}

export interface DebtSummaryInput extends LateRates {
  id: string
  kind: LoanKind
  name: string
  /** Fração mensal. */
  monthlyRate: number
  /** Parcelados: todas as parcelas do contrato. */
  installments?: readonly SummaryInstallment[]
  /** `OVERDRAFT`: uso lido do ledger. */
  overdraft?: OverdraftUsage
  /** `CARD_REVOLVING`: saldo em rotativo lido da fatura. */
  revolving?: RevolvingUsage
}

export interface NextInstallment {
  number: number
  dueDate: Date
  amount: number
  status: InstallmentState
  lateCharges: LateCharges
  /** Parcela + encargos de atraso hoje. */
  amountDueNow: number
}

export interface DebtSummary {
  id: string
  kind: LoanKind
  name: string
  /** Saldo devedor, centavos. */
  outstanding: number
  /** Fração mensal. */
  monthlyRate: number
  /** `(1 + i)^12 - 1`. */
  annualRate: number
  /** Custo mensal em centavos (ver `assumptions` para o método). */
  monthlyInterestCost: number
  nextInstallment?: NextInstallment
  installmentsLeft: number
  payoffDate: Date | null
  overdueCount: number
  /** Σ valor devido hoje das parcelas vencidas (principal + encargos), centavos. */
  overdueAmount: number
  /** Excedente do cheque especial além do limite (fora da estimativa), centavos. */
  limitExcess?: number
  /** Teto legal do rotativo reduziu o custo. */
  revolvingCapped?: boolean
  /** Premissas em português para a UI mostrar ("como calculamos"). */
  assumptions: string[]
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(2).replace('.', ',')}%`
}

export function summarizeDebt(input: DebtSummaryInput, now: Date): DebtSummary {
  const today = businessCalendarDay(now)
  const base = {
    id: input.id,
    kind: input.kind,
    name: input.name,
    monthlyRate: input.monthlyRate,
    annualRate: annualEquivalent(input.monthlyRate),
  }

  if (isInstallmentKind(input.kind)) {
    const installments = [...(input.installments ?? [])].sort((a, b) => a.number - b.number)
    const assessed = installments.map((item) => assessInstallment(item, input, now))
    const open = assessed.filter((item) => item.status === 'PENDING' || item.status === 'OVERDUE')
    const overdue = open.filter((item) => item.status === 'OVERDUE')
    const outstanding = open.reduce((sum, item) => sum + item.principalCents, 0)
    const next = open[0]
    return {
      ...base,
      outstanding,
      monthlyInterestCost: Math.round(outstanding * input.monthlyRate),
      nextInstallment: next && {
        number: next.number,
        dueDate: next.dueDate,
        amount: next.amountCents,
        status: next.status,
        lateCharges: next.lateCharges,
        amountDueNow: next.amountDueNow,
      },
      installmentsLeft: open.length,
      payoffDate: open.length > 0 ? open[open.length - 1].dueDate : null,
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, item) => sum + item.amountDueNow, 0),
      assumptions: [
        `Custo mensal = saldo devedor x taxa de ${percent(input.monthlyRate)} a.m. (juros embutidos na próxima parcela).`,
        'Sistema Price: parcela fixa; a última parcela ajusta os centavos de arredondamento.',
        ...(overdue.length > 0
          ? [
              `Parcelas vencidas incluem multa de ${percent(input.lateFeeRate)} e mora de ${percent(input.lateInterestMonthlyRate)} a.m. pro rata (base 30 dias).`,
            ]
          : []),
      ],
    }
  }

  if (input.kind === 'OVERDRAFT') {
    const usage = input.overdraft
    if (!usage)
      throw new DebtError('DEBT_INVALID_INPUT', 'OVERDRAFT exige o uso do cheque especial.')
    const cost = overdraftMonthlyCost({
      used: usage.used,
      monthlyRate: input.monthlyRate,
      iofMonthly: usage.iofMonthly,
    })
    return {
      ...base,
      outstanding: usage.used,
      monthlyInterestCost: cost,
      installmentsLeft: 0,
      payoffDate: plannedPayoff(usage.used, input.monthlyRate, usage.plannedMonthlyPayment, today),
      overdueCount: 0,
      overdueAmount: 0,
      limitExcess: usage.excess ?? 0,
      assumptions: [
        `Estimativa: uso atual x taxa de ${percent(input.monthlyRate)} a.m.; o banco pode usar outra convenção (dias corridos, IOF diário).`,
        'Os juros e o IOF que o banco lançar na conta prevalecem sobre a estimativa.',
      ],
    }
  }

  // CARD_REVOLVING
  const revolving = input.revolving
  if (!revolving)
    throw new DebtError('DEBT_INVALID_INPUT', 'CARD_REVOLVING exige o saldo rotativo.')
  const detail = revolvingMonthlyCostDetail({
    unpaid: revolving.unpaid,
    monthlyRate: input.monthlyRate,
    originalPrincipal: revolving.originalPrincipal,
    interestAlreadyCharged: revolving.interestAlreadyCharged,
    capMultiple: revolving.capMultiple,
  })
  return {
    ...base,
    outstanding: revolving.unpaid,
    monthlyInterestCost: detail.cost,
    installmentsLeft: 0,
    payoffDate: plannedPayoff(
      revolving.unpaid,
      input.monthlyRate,
      revolving.plannedMonthlyPayment,
      today,
    ),
    overdueCount: 0,
    overdueAmount: 0,
    revolvingCapped: detail.capped,
    assumptions: [
      `Custo mensal = fatura não paga x taxa de ${percent(input.monthlyRate)} a.m.`,
      'Teto legal: juros e encargos acumulados limitados ao valor original da dívida do cartão.',
    ],
  }
}

function plannedPayoff(
  balance: number,
  monthlyRate: number,
  plannedMonthlyPayment: number | undefined,
  today: Date,
): Date | null {
  if (!plannedMonthlyPayment || balance <= 0) return null
  const months = monthsToPayoff({ balance, monthlyRate, monthlyPayment: plannedMonthlyPayment })
  return Number.isFinite(months) ? payoffDate(today, months) : null
}
