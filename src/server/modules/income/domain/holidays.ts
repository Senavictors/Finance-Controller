import { addDays, toIso, utcDate } from './dates'

/**
 * Feriados nacionais (RN-04), todos calculados: fixos + Sexta-feira Santa (Páscoa - 2 dias).
 * Carnaval e Corpus Christi são pontos facultativos e NÃO entram: o usuário os informa em
 * `extraDaysOff`, junto com feriados estaduais/municipais e pontes.
 */

export interface Holiday {
  /** `YYYY-MM-DD`. */
  date: string
  name: string
}

/** Domingo de Páscoa (calendário gregoriano; algoritmo de Meeus/Jones/Butcher), meio-dia UTC. */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utcDate(year, month, day)
}

/** Primeiro ano em que 20/11 (Consciência Negra) é feriado nacional (Lei 14.759/2023). */
export const BLACK_CONSCIOUSNESS_FIRST_YEAR = 2024

const FIXED_HOLIDAYS: ReadonlyArray<{
  month: number
  day: number
  name: string
  fromYear?: number
}> = [
  { month: 1, day: 1, name: 'Confraternização Universal' },
  { month: 4, day: 21, name: 'Tiradentes' },
  { month: 5, day: 1, name: 'Dia do Trabalho' },
  { month: 9, day: 7, name: 'Independência do Brasil' },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida' },
  { month: 11, day: 2, name: 'Finados' },
  { month: 11, day: 15, name: 'Proclamação da República' },
  {
    month: 11,
    day: 20,
    name: 'Dia da Consciência Negra',
    fromYear: BLACK_CONSCIOUSNESS_FIRST_YEAR,
  },
  { month: 12, day: 25, name: 'Natal' },
]

const cache = new Map<number, ReadonlyArray<Holiday>>()

/** Feriados nacionais do ano, ordenados por data. */
export function brazilNationalHolidays(year: number): ReadonlyArray<Holiday> {
  const cached = cache.get(year)
  if (cached) return cached
  const list: Holiday[] = FIXED_HOLIDAYS.filter(
    (h) => h.fromYear === undefined || year >= h.fromYear,
  ).map((h) => ({ date: toIso(utcDate(year, h.month, h.day)), name: h.name }))
  list.push({ date: toIso(addDays(easterSunday(year), -2)), name: 'Sexta-feira Santa' })
  list.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
  cache.set(year, list)
  return list
}

/** Feriado nacional ou dia de folga informado pelo usuário (`extraDaysOff`, `YYYY-MM-DD`). */
export function isHoliday(date: Date, extraDaysOff: readonly string[] = []): boolean {
  const iso = toIso(date)
  if (extraDaysOff.includes(iso)) return true
  return brazilNationalHolidays(date.getUTCFullYear()).some((h) => h.date === iso)
}
