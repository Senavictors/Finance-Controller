import { adjustToBusinessDay } from './calendar'
import {
  clampDay,
  formatMonthKey,
  monthKey,
  monthsBetween,
  nextMonth,
  previousMonth,
  toIso,
  utcDate,
} from './dates'
import type { MonthRef } from './income-rule'

/**
 * DAS MEI (RN-06): despesa mensal fixa que vence no `dueDay` (padrão 20), ajustada para o
 * PRÓXIMO dia útil; competência = mês anterior. O valor é parâmetro do `MeiProfile`
 * (muda com o salário mínimo), nunca constante de código.
 */

/** Vencimento do mês: `dueDay` limitado ao último dia e empurrado para o próximo dia útil. */
export function dasDueDate(input: {
  year: number
  month: number
  dueDay: number
  extraDaysOff?: readonly string[]
}): Date {
  const nominal = utcDate(input.year, input.month, clampDay(input.year, input.month, input.dueDay))
  return adjustToBusinessDay(nominal, 'NEXT_BUSINESS_DAY', input.extraDaysOff ?? [])
}

/**
 * Competência (`YYYY-MM`) do DAS: o mês anterior ao do vencimento. Se o ajuste de dia útil
 * empurrou o vencimento para outro mês, passe `scheduleMonth` (o mês de agenda do vencimento).
 */
export function dasCompetence(dueDate: Date, scheduleMonth?: MonthRef): string {
  const anchor: MonthRef = scheduleMonth ?? {
    year: dueDate.getUTCFullYear(),
    month: dueDate.getUTCMonth() + 1,
  }
  const target = previousMonth(anchor.year, anchor.month)
  return formatMonthKey(target.year, target.month)
}

export interface DasProfileParams {
  dasAmountCents: number
  dasDueDay: number
  /** Abertura do MEI: não há DAS de competência anterior ao mês de abertura. */
  openedAt?: Date | null
}

export interface DasEvent {
  /** Vencimento já ajustado. */
  dueDate: Date
  /** `YYYY-MM-DD` (parte da `occurrenceKey`). */
  dateKey: string
  /** `YYYY-MM` da competência. */
  competence: string
  amountCents: number
}

/** Vencimentos do DAS em `[from, to]`, ordenados. */
export function projectDasEvents(
  profile: DasProfileParams,
  from: Date,
  to: Date,
  extraDaysOff: readonly string[] = [],
): DasEvent[] {
  if (from.getTime() > to.getTime()) return []
  const fromIso = toIso(from)
  const toIsoValue = toIso(to)
  const openedKey = profile.openedAt ? monthKey(profile.openedAt) : null
  const first = previousMonth(from.getUTCFullYear(), from.getUTCMonth() + 1)
  const last = nextMonth(to.getUTCFullYear(), to.getUTCMonth() + 1)
  const scan = monthsBetween(utcDate(first.year, first.month, 1), utcDate(last.year, last.month, 1))

  const events: DasEvent[] = []
  const seen = new Set<string>()
  for (const ref of scan) {
    const dueDate = dasDueDate({
      year: ref.year,
      month: ref.month,
      dueDay: profile.dasDueDay,
      extraDaysOff,
    })
    const dateKey = toIso(dueDate)
    if (dateKey < fromIso || dateKey > toIsoValue || seen.has(dateKey)) continue
    const competence = dasCompetence(dueDate, ref)
    if (openedKey !== null && competence < openedKey) continue
    seen.add(dateKey)
    events.push({ dueDate, dateKey, competence, amountCents: profile.dasAmountCents })
  }
  return events.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
}

/** `occurrenceKey` determinística do previsto do DAS (única por usuário). */
export function dasOccurrenceKey(dateKey: string): string {
  return `das:${dateKey}`
}

export const DAS_OCCURRENCE_PREFIX = 'das:'

export function dasDescription(competence: string): string {
  return `DAS MEI ${competence}`
}
