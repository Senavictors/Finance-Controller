/**
 * Encargos de atraso de parcela (RN-04): multa única + juros de mora pro rata die sobre o valor
 * da parcela (mês comercial de 30 dias). Taxas como FRAÇÃO (0.02 = 2%). Domínio puro: a data de
 * referência (`payDate`/`now`) é sempre parâmetro.
 */
import { businessCalendarDay, diffCalendarDays } from './calendar'
import { DebtError } from './errors'

export const DEFAULT_LATE_FEE_RATE = 0.02
export const DEFAULT_LATE_INTEREST_MONTHLY = 0.01
const COMMERCIAL_MONTH_DAYS = 30

/** Dias de calendário em atraso (>= 0): pagar no vencimento ou antes = 0. */
export function daysLate(dueDate: Date, payDate: Date): number {
  return Math.max(0, diffCalendarDays(dueDate, payDate))
}

export interface LateChargesInput {
  /** Valor da parcela, centavos. */
  amount: number
  dueDate: Date
  payDate: Date
  /** Multa única (fração). Padrão 2%. */
  lateFeePct?: number
  /** Juros de mora ao mês (fração), pro rata die em base 30. Padrão 1% a.m. */
  lateInterestMonthly?: number
}

export interface LateCharges {
  fee: number
  interest: number
  total: number
  days: number
}

export function lateCharges({
  amount,
  dueDate,
  payDate,
  lateFeePct = DEFAULT_LATE_FEE_RATE,
  lateInterestMonthly = DEFAULT_LATE_INTEREST_MONTHLY,
}: LateChargesInput): LateCharges {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'amount deve ser um inteiro de centavos >= 0.')
  }
  if (!(lateFeePct >= 0) || !(lateInterestMonthly >= 0)) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Multa e juros de mora devem ser frações >= 0.')
  }
  const days = daysLate(dueDate, payDate)
  if (days === 0) return { fee: 0, interest: 0, total: 0, days: 0 }
  const fee = Math.round(amount * lateFeePct)
  const interest = Math.round((amount * lateInterestMonthly * days) / COMMERCIAL_MONTH_DAYS)
  return { fee, interest, total: fee + interest, days }
}

export type InstallmentState = 'PAID' | 'OVERDUE' | 'PENDING' | 'SKIPPED'

/**
 * Status lido da parcela (calculado, nunca persistido como `OVERDUE`): vencida (`dueDate` antes
 * de hoje em São Paulo) e não paga = `OVERDUE`. Vencer hoje ainda é `PENDING`.
 */
export function installmentStatus(
  installment: { status: 'PENDING' | 'PAID' | 'SKIPPED'; dueDate: Date },
  now: Date,
): InstallmentState {
  if (installment.status === 'PAID') return 'PAID'
  if (installment.status === 'SKIPPED') return 'SKIPPED'
  const today = businessCalendarDay(now)
  return diffCalendarDays(installment.dueDate, today) > 0 ? 'OVERDUE' : 'PENDING'
}
