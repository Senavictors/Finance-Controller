/**
 * Cheque especial (RN-05): custo mensal ESTIMADO. O banco usa convenção própria (dias corridos,
 * base 360/365, IOF diário); o que o banco lançar de verdade entra no ledger como `INTEREST`/`FEE`
 * e prevalece sobre esta estimativa. Taxas como FRAÇÃO mensal.
 */
import { DebtError } from './errors'

function assertRate(rate: number, name: string): void {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', `${name} deve ser uma fração >= 0.`)
  }
}

export interface OverdraftMonthlyCostInput {
  /** Uso do cheque especial, centavos (>= 0). */
  used: number
  monthlyRate: number
  /** IOF mensal equivalente opcional (fração), somado à taxa. */
  iofMonthly?: number
}

/** `round(used * (monthlyRate + iofMonthly))`. */
export function overdraftMonthlyCost({
  used,
  monthlyRate,
  iofMonthly = 0,
}: OverdraftMonthlyCostInput): number {
  if (!Number.isInteger(used) || used < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'used deve ser um inteiro de centavos >= 0.')
  }
  assertRate(monthlyRate, 'monthlyRate')
  assertRate(iofMonthly, 'iofMonthly')
  return Math.round(used * (monthlyRate + iofMonthly))
}

export interface DailyBalance {
  /** Dia de calendário (meio-dia UTC). */
  date: Date
  /** Saldo no fim do dia, centavos (negativo = no cheque especial). */
  balance: number
}

export interface OverdraftSeriesInput {
  dailyBalances: readonly DailyBalance[]
  /** Limite do cheque especial, centavos. */
  overdraftLimit: number
  monthlyRate: number
  iofMonthly?: number
}

export interface OverdraftSeriesEstimate {
  /** Custo estimado do período, centavos (uma única rodada de arredondamento). */
  costCents: number
  days: number
  daysInOverdraft: number
  /** Σ do uso diário (dentro do limite), centavos x dia. Base do custo. */
  exposureCentsDays: number
  /** Uso médio por dia do período, centavos. */
  averageUsed: number
  maxUsed: number
  /** Parte do saldo negativo que passou do limite (fora da estimativa; vem do ledger). */
  excessCentsDays: number
  maxExcess: number
  /** Taxa diária efetiva usada (`(monthlyRate + iof) / 30`). */
  dailyRate: number
}

/**
 * Soma diária de `max(0, min(-saldo, limite)) * (taxa / 30)` (juros simples diários; ESTIMATIVA).
 * O excedente além do limite não entra no custo: é devolvido à parte (`excess*`), pois o ledger
 * já o reporta como `OVERDRAFT_LIMIT_EXCEEDED` e a cobrança dele segue regras próprias do banco.
 */
export function estimateOverdraftCostFromSeries({
  dailyBalances,
  overdraftLimit,
  monthlyRate,
  iofMonthly = 0,
}: OverdraftSeriesInput): OverdraftSeriesEstimate {
  if (!Number.isInteger(overdraftLimit) || overdraftLimit < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'overdraftLimit deve ser um inteiro >= 0.')
  }
  assertRate(monthlyRate, 'monthlyRate')
  assertRate(iofMonthly, 'iofMonthly')

  let exposure = 0
  let excessTotal = 0
  let maxUsed = 0
  let maxExcess = 0
  let daysInOverdraft = 0
  for (const day of dailyBalances) {
    const negative = Math.max(0, -day.balance)
    const used = Math.min(negative, overdraftLimit)
    const excess = negative - used
    if (used > 0 || excess > 0) daysInOverdraft += 1
    exposure += used
    excessTotal += excess
    maxUsed = Math.max(maxUsed, used)
    maxExcess = Math.max(maxExcess, excess)
  }
  const days = dailyBalances.length
  const effectiveRate = monthlyRate + iofMonthly
  return {
    costCents: Math.round((exposure * effectiveRate) / 30),
    days,
    daysInOverdraft,
    exposureCentsDays: exposure,
    averageUsed: days === 0 ? 0 : Math.round(exposure / days),
    maxUsed,
    excessCentsDays: excessTotal,
    maxExcess,
    dailyRate: effectiveRate / 30,
  }
}
