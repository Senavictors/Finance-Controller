/**
 * Série de saldo diário reconstruída a partir da posição atual e dos lançamentos (o ledger não
 * guarda "saldo na data"). Pura: o chamador fornece só os lançamentos que compõem o saldo
 * atual (`PENDING`, `CLEARED`, `RECONCILED`).
 *
 *   saldo no fim do dia D = saldoAtual - Σ valor dos lançamentos com data > D
 */
import { addCalendarDays, diffCalendarDays, toCalendarDate } from './calendar'
import { DebtError } from './errors'
import type { DailyBalance } from './overdraft'

export interface SeriesTransaction {
  /** Dia de calendário (meio-dia UTC). */
  date: Date
  /** Centavos assinados (entrada > 0). */
  amount: number
}

export interface DailyBalanceSeriesInput {
  /** Saldo atual da conta (cleared + pending), centavos. */
  currentBalance: number
  /** Dia a que `currentBalance` se refere (hoje em São Paulo). */
  asOf: Date
  /** Primeiro dia da série (inclusivo). */
  from: Date
  /** Último dia desejado (inclusivo); é limitado a `asOf`. */
  to: Date
  /** Lançamentos que compõem o saldo atual (qualquer data; só importam os `> from`). */
  transactions: readonly SeriesTransaction[]
}

export function buildDailyBalanceSeries({
  currentBalance,
  asOf,
  from,
  to,
  transactions,
}: DailyBalanceSeriesInput): DailyBalance[] {
  if (!Number.isInteger(currentBalance)) {
    throw new DebtError('DEBT_INVALID_INPUT', 'currentBalance deve ser um inteiro de centavos.')
  }
  const start = toCalendarDate(from)
  const lastDay = diffCalendarDays(to, asOf) < 0 ? toCalendarDate(asOf) : toCalendarDate(to)
  if (diffCalendarDays(start, lastDay) < 0) return []

  // Lançamentos posteriores a cada dia: percorre do mais recente para o mais antigo.
  const sorted = [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime())
  let cursor = 0
  let balance = currentBalance

  // Desfaz tudo o que aconteceu depois do último dia da série (até `asOf`, ou além dele).
  const series: DailyBalance[] = []
  const total = diffCalendarDays(start, lastDay)
  for (let offset = total; offset >= 0; offset -= 1) {
    const day = addCalendarDays(start, offset)
    // Remove do saldo os lançamentos com data > day (ainda não removidos).
    while (cursor < sorted.length && diffCalendarDays(day, sorted[cursor].date) > 0) {
      balance -= sorted[cursor].amount
      cursor += 1
    }
    series.push({ date: day, balance })
  }
  return series.reverse()
}
