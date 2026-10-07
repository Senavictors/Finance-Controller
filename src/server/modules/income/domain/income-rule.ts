import {
  adjustToBusinessDay,
  presentialDays,
  type AttendanceOverrides,
  type BusinessDayRule,
} from './calendar'
import {
  clampDay,
  formatMonthKey,
  monthBounds,
  monthsBetween,
  nextMonth,
  previousMonth,
  toIso,
  utcDate,
} from './dates'

/**
 * Renda MEI: `rendaPrevista = base + adicionalPorDia x diasPresenciais` (ADR-029, RN-01).
 * Tudo puro: datas explícitas (meio-dia UTC), centavos inteiros, nenhum relógio.
 */

/** Competência do adicional (RN-02): mês anterior ao pagamento (padrão) ou o mesmo mês. */
export type AdditionalBasis = 'PREVIOUS_MONTH' | 'SAME_MONTH'

export interface IncomeRuleParams {
  baseCents: number
  perDayCents: number
  /** 0 = domingo ... 6 = sábado. */
  weekdays: readonly number[]
  /** 1-31; dia inexistente no mês é limitado ao último dia (RN-03). */
  payDay: number
  paymentAdjust: BusinessDayRule
  additionalBasis: AdditionalBasis
  /** `YYYY-MM-DD`: feriados locais, pontos facultativos, pontes. */
  extraDaysOff: readonly string[]
  attendanceOverrides: AttendanceOverrides
  /** Vigência: só pagamentos dentro de `[startDate, endDate]` geram evento. */
  startDate: Date
  endDate: Date | null
}

export interface MonthRef {
  year: number
  month: number
}

/**
 * Data de pagamento do mês: `payDay` limitado ao último dia (`clampDay`) e ajustado para o dia
 * útil conforme `adjust`. Atenção: o ajuste pode cruzar o mês (31/jan num sábado com
 * `NEXT_BUSINESS_DAY` => 02/fev); a "competência" continua ancorada no mês de agenda.
 */
export function paymentDateFor(input: {
  year: number
  month: number
  payDay: number
  adjust: BusinessDayRule
  extraDaysOff?: readonly string[]
}): Date {
  const nominal = utcDate(input.year, input.month, clampDay(input.year, input.month, input.payDay))
  return adjustToBusinessDay(nominal, input.adjust, input.extraDaysOff ?? [])
}

/**
 * Período de apuração dos dias presenciais. `PREVIOUS_MONTH`: mês calendário anterior ao do
 * pagamento; `SAME_MONTH`: o mês do pagamento. Por padrão o "mês do pagamento" é o mês de
 * `paymentDate`; passe `scheduleMonth` (o mês de agenda, antes do ajuste de dia útil) para o
 * caso em que o ajuste empurrou o pagamento para outro mês.
 */
export function competencePeriod(input: {
  paymentDate: Date
  additionalBasis: AdditionalBasis
  scheduleMonth?: MonthRef
}): { start: Date; end: Date } {
  const anchor: MonthRef = input.scheduleMonth ?? {
    year: input.paymentDate.getUTCFullYear(),
    month: input.paymentDate.getUTCMonth() + 1,
  }
  const target =
    input.additionalBasis === 'PREVIOUS_MONTH' ? previousMonth(anchor.year, anchor.month) : anchor
  return monthBounds(target.year, target.month)
}

export interface ExpectedIncome {
  paymentDate: Date
  /** Período usado para contar os dias presenciais. */
  competence: { start: Date; end: Date }
  base: number
  additional: number
  presentialDays: number
  /** Dias presenciais (`YYYY-MM-DD`), a lista que a UI mostra. */
  dates: string[]
  total: number
}

/**
 * Renda prevista de um pagamento (RN-01), com os componentes. `startDate`/`endDate` da regra
 * delimitam quais PAGAMENTOS existem (`projectIncomeEvents`), não quais dias de trabalho
 * contam: ajustes de dias específicos são `attendanceOverrides`.
 */
export function expectedIncome(
  rule: IncomeRuleParams,
  paymentDate: Date,
  scheduleMonth?: MonthRef,
): ExpectedIncome {
  const competence = competencePeriod({
    paymentDate,
    additionalBasis: rule.additionalBasis,
    scheduleMonth,
  })
  const dates = presentialDays({
    periodStart: competence.start,
    periodEnd: competence.end,
    weekdays: rule.weekdays,
    extraDaysOff: rule.extraDaysOff,
    overrides: rule.attendanceOverrides,
  })
  const additional = rule.perDayCents * dates.length
  return {
    paymentDate,
    competence,
    base: rule.baseCents,
    additional,
    presentialDays: dates.length,
    dates,
    total: rule.baseCents + additional,
  }
}

export interface IncomeEvent extends ExpectedIncome {
  /** `YYYY-MM-DD` da data de pagamento (parte da `occurrenceKey`). */
  dateKey: string
  /** `YYYY-MM` do mês de agenda (antes do ajuste de dia útil). */
  scheduleMonth: string
}

/**
 * Um evento por mês de agenda cujo pagamento (já ajustado) caia em `[from, to]` e dentro de
 * `[startDate, endDate]` da regra, ordenado por data. Varre um mês a mais de cada lado porque o
 * ajuste de dia útil pode empurrar o pagamento para o mês vizinho.
 */
export function projectIncomeEvents(rule: IncomeRuleParams, from: Date, to: Date): IncomeEvent[] {
  if (from.getTime() > to.getTime()) return []
  const fromIso = toIso(from)
  const toIsoValue = toIso(to)
  const startIso = toIso(rule.startDate)
  const endIso = rule.endDate ? toIso(rule.endDate) : null
  const first = previousMonth(from.getUTCFullYear(), from.getUTCMonth() + 1)
  const last = nextMonth(to.getUTCFullYear(), to.getUTCMonth() + 1)
  const scan = monthsBetween(utcDate(first.year, first.month, 1), utcDate(last.year, last.month, 1))

  const events: IncomeEvent[] = []
  const seen = new Set<string>()
  for (const ref of scan) {
    const paymentDate = paymentDateFor({
      year: ref.year,
      month: ref.month,
      payDay: rule.payDay,
      adjust: rule.paymentAdjust,
      extraDaysOff: rule.extraDaysOff,
    })
    const dateKey = toIso(paymentDate)
    if (dateKey < fromIso || dateKey > toIsoValue) continue
    if (dateKey < startIso || (endIso !== null && dateKey > endIso)) continue
    if (seen.has(dateKey)) continue
    seen.add(dateKey)
    events.push({
      ...expectedIncome(rule, paymentDate, ref),
      dateKey,
      scheduleMonth: formatMonthKey(ref.year, ref.month),
    })
  }
  return events.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
}

/** `occurrenceKey` determinística do previsto de renda (única por usuário). */
export function incomeOccurrenceKey(ruleId: string, dateKey: string): string {
  return `income:${ruleId}:${dateKey}`
}

export function incomeOccurrencePrefix(ruleId: string): string {
  return `income:${ruleId}:`
}
