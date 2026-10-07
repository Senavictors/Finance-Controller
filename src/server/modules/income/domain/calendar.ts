import { addDays, toIso, weekdayOf } from './dates'
import { IncomeError } from './errors'
import { isHoliday } from './holidays'

export { clampDay } from './dates'

/** Regra de ajuste quando a data cai em fim de semana ou feriado (espelha `BusinessDayRule`). */
export type BusinessDayRule = 'NONE' | 'NEXT_BUSINESS_DAY' | 'PREVIOUS_BUSINESS_DAY'

/** Mapa `YYYY-MM-DD -> presente?`: `false` remove o dia, `true` inclui mesmo fora da regra. */
export type AttendanceOverrides = Readonly<Record<string, boolean>>

/** Segunda a sexta e não feriado nacional nem `extraDaysOff`. */
export function isBusinessDay(date: Date, extraDaysOff: readonly string[] = []): boolean {
  const weekday = weekdayOf(date)
  if (weekday === 0 || weekday === 6) return false
  return !isHoliday(date, extraDaysOff)
}

/** Limite de segurança: `extraDaysOff` absurdo não pode travar o laço. */
const MAX_ADJUST_STEPS = 60

/** `NONE` mantém; `NEXT` avança até o próximo dia útil; `PREVIOUS` recua até o anterior. */
export function adjustToBusinessDay(
  date: Date,
  rule: BusinessDayRule,
  extraDaysOff: readonly string[] = [],
): Date {
  if (rule === 'NONE') return date
  const step = rule === 'NEXT_BUSINESS_DAY' ? 1 : -1
  let current = date
  for (let i = 0; i < MAX_ADJUST_STEPS && !isBusinessDay(current, extraDaysOff); i += 1) {
    current = addDays(current, step)
  }
  return current
}

export interface PresentialDaysInput {
  /** Inclusivo, meio-dia UTC. */
  periodStart: Date
  /** Inclusivo, meio-dia UTC. */
  periodEnd: Date
  /** 0 = domingo ... 6 = sábado. */
  weekdays: readonly number[]
  extraDaysOff?: readonly string[]
  overrides?: AttendanceOverrides
  /** Limites opcionais (inclusivos) que cortam o período e os overrides. */
  ruleStart?: Date | null
  ruleEnd?: Date | null
}

/**
 * Dias presenciais do período (inclusive), em `YYYY-MM-DD` ordenados: dias da semana em
 * `weekdays`, menos feriados nacionais e `extraDaysOff`, aplicando `overrides` (`false` remove,
 * `true` inclui mesmo fora de `weekdays` ou em feriado) e limitando a `ruleStart/ruleEnd`.
 * Período invertido (`periodStart > periodEnd`) lança `INCOME_INVALID_PERIOD`.
 */
export function presentialDays(input: PresentialDaysInput): string[] {
  const { periodStart, periodEnd, weekdays } = input
  if (periodStart.getTime() > periodEnd.getTime()) {
    throw new IncomeError('INCOME_INVALID_PERIOD', 'O início do período é posterior ao fim.')
  }
  const extraDaysOff = input.extraDaysOff ?? []
  const overrides = input.overrides ?? {}
  const endIso = toIso(periodEnd)
  const ruleStartIso = input.ruleStart ? toIso(input.ruleStart) : null
  const ruleEndIso = input.ruleEnd ? toIso(input.ruleEnd) : null

  const result: string[] = []
  for (let day = periodStart; toIso(day) <= endIso; day = addDays(day, 1)) {
    const iso = toIso(day)
    if (ruleStartIso !== null && iso < ruleStartIso) continue
    if (ruleEndIso !== null && iso > ruleEndIso) continue
    const override = overrides[iso]
    if (override === true) {
      result.push(iso)
    } else if (override === false) {
      continue
    } else if (weekdays.includes(weekdayOf(day)) && !isHoliday(day, extraDaysOff)) {
      result.push(iso)
    }
  }
  return result
}
