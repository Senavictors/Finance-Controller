/**
 * Prazo de quitação (ADR-028 item 8). `monthsToPayoff` é a fórmula fechada (contínua, sem
 * arredondar juros mês a mês); `simulateAmortization` itera mês a mês com juros arredondados ao centavo
 * e é o que a simulação de antecipação usa (comparação base x cenário sempre com o mesmo método).
 */
import { addMonthsClamped } from './calendar'
import { DebtError } from './errors'

export interface MonthsToPayoffInput {
  /** Saldo devedor, centavos. */
  balance: number
  /** Fração mensal. */
  monthlyRate: number
  /** Pagamento mensal, centavos. */
  monthlyPayment: number
}

/**
 * `n = -ln(1 - i*B/P) / ln(1+i)` arredondado para cima. `Infinity` se o pagamento não cobre os
 * juros do primeiro mês (`P <= round(B*i)`): a dívida nunca quita. `i = 0` => `ceil(B/P)`.
 */
export function monthsToPayoff({
  balance,
  monthlyRate,
  monthlyPayment,
}: MonthsToPayoffInput): number {
  if (
    !Number.isFinite(balance) ||
    !Number.isFinite(monthlyRate) ||
    !Number.isFinite(monthlyPayment)
  ) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Parâmetros de quitação devem ser números finitos.')
  }
  if (monthlyRate < 0) throw new DebtError('DEBT_INVALID_INPUT', 'Taxa deve ser >= 0.')
  if (balance <= 0) return 0
  if (monthlyPayment <= 0) return Infinity
  if (monthlyRate === 0) return Math.ceil(balance / monthlyPayment)
  if (monthlyPayment <= Math.round(balance * monthlyRate)) return Infinity
  const ratio = (monthlyRate * balance) / monthlyPayment
  const months = -Math.log1p(-ratio) / Math.log1p(monthlyRate)
  // Tolerância para valores que deveriam ser inteiros exatos (ex.: 12.000000000001).
  return Math.max(1, Math.ceil(months - 1e-9))
}

/** Data prevista de quitação: `from` + `months` meses (dia preservado, com clamp). */
export function payoffDate(from: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'months deve ser um inteiro >= 0.')
  }
  return addMonthsClamped(from, months)
}

export interface PayoffSimulationInput {
  balance: number
  monthlyRate: number
  monthlyPayment: number
  /** Pagamento único à vista no início, centavos. */
  lumpSum?: number
  /** Limite de meses simulados (padrão 1200 = 100 anos). */
  maxMonths?: number
  /**
   * Mês (1-based) em que a última parcela do contrato absorve o resíduo e quita o saldo, como o
   * cronograma Price faz (a parcela final ajusta os centavos). Sem isso, um resíduo de poucos
   * centavos viraria um mês extra. Não vale se o pagamento nem cobre os juros.
   */
  forcePayoffAtMonth?: number
}

export interface PayoffSimulation {
  /** Meses até zerar (0 se já quitada; `Infinity` se nunca quita). */
  months: number
  /** Σ juros dos meses simulados, centavos. */
  totalInterest: number
  /** Σ pago (pagamentos mensais + pagamento à vista), centavos. */
  totalPaid: number
  /** Valor da última parcela (a que zera o saldo), centavos. */
  lastPayment: number
  neverPaysOff: boolean
  /** Pagamento à vista efetivamente aplicado (limitado ao saldo). */
  lumpSumApplied: number
}

/** Simula a quitação mês a mês com juros arredondados ao centavo (`Math.round`). */
export function simulateAmortization({
  balance,
  monthlyRate,
  monthlyPayment,
  lumpSum = 0,
  maxMonths = 1200,
  forcePayoffAtMonth,
}: PayoffSimulationInput): PayoffSimulation {
  if (!Number.isInteger(balance) || balance < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'balance deve ser um inteiro de centavos >= 0.')
  }
  if (!Number.isInteger(monthlyPayment) || monthlyPayment < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'monthlyPayment deve ser um inteiro >= 0.')
  }
  if (!Number.isInteger(lumpSum) || lumpSum < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'lumpSum deve ser um inteiro >= 0.')
  }
  if (!Number.isFinite(monthlyRate) || monthlyRate < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Taxa deve ser >= 0.')
  }

  const lumpSumApplied = Math.min(lumpSum, balance)
  let remaining = balance - lumpSumApplied
  let totalInterest = 0
  let totalPaid = lumpSumApplied
  let lastPayment = 0
  let months = 0

  while (remaining > 0) {
    if (months >= maxMonths) {
      return {
        months: Infinity,
        totalInterest,
        totalPaid,
        lastPayment,
        neverPaysOff: true,
        lumpSumApplied,
      }
    }
    const interest = Math.round(remaining * monthlyRate)
    if (monthlyPayment <= interest) {
      return {
        months: Infinity,
        totalInterest,
        totalPaid,
        lastPayment,
        neverPaysOff: true,
        lumpSumApplied,
      }
    }
    const isFinalScheduled = forcePayoffAtMonth !== undefined && months + 1 >= forcePayoffAtMonth
    const payment = isFinalScheduled
      ? remaining + interest
      : Math.min(monthlyPayment, remaining + interest)
    remaining = remaining + interest - payment
    totalInterest += interest
    totalPaid += payment
    lastPayment = payment
    months += 1
  }
  return { months, totalInterest, totalPaid, lastPayment, neverPaysOff: false, lumpSumApplied }
}
