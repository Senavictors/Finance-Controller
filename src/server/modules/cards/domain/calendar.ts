/**
 * Datas de calendário do módulo de cartões. Convenção do projeto (ADR-002): um dia de
 * calendário é o meio-dia UTC (`Date.UTC(y, m, d, 12)`); o fuso de negócio é
 * `America/Sao_Paulo` e só entra quando precisamos saber "que dia é hoje" a partir de um
 * instante (`calendarDayInZone`). Nada aqui lê o relógio: o instante é sempre parâmetro.
 */

export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

const DAY_MS = 86_400_000

/** Meio-dia UTC do dia `y-m-d` (`m` de 0 a 11). Meses/dias fora de faixa transbordam (use `clampDay`). */
export function utcNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0))
}

/** Quantidade de dias do mês (`month` de 0 a 11). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Limita o dia ao último dia do mês (31 em fevereiro vira 28 ou 29). */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month))
}

/** Dia de calendário (meio-dia UTC) das partes UTC de `date`. */
export function toCalendarDay(date: Date): Date {
  return utcNoon(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/** `true` se `date` é exatamente meio-dia UTC (formato dos dias de calendário). */
export function isCalendarDay(date: Date): boolean {
  return (
    isValidDate(date) &&
    date.getUTCHours() === 12 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}

/**
 * Dia de calendário (meio-dia UTC) em que o instante `now` cai no fuso `timeZone`. É o "hoje"
 * de negócio: 2026-10-06T01:00Z ainda é 2026-10-05 em São Paulo.
 */
export function calendarDayInZone(now: Date, timeZone: string = BUSINESS_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return utcNoon(pick('year'), pick('month') - 1, pick('day'))
}

/** Soma `days` dias de calendário. */
export function addDays(date: Date, days: number): Date {
  return new Date(toCalendarDay(date).getTime() + days * DAY_MS)
}

/** Dias de calendário de `from` até `to` (negativo se `to` for anterior). */
export function diffInDays(from: Date, to: Date): number {
  return Math.round((toCalendarDay(to).getTime() - toCalendarDay(from).getTime()) / DAY_MS)
}

/**
 * Soma `months` meses limitando o dia ao último dia do mês de destino (31/01 + 1 mês =
 * 28/02 ou 29/02; 31/03 + 1 mês = 30/04). Não acumula: parta sempre da data original.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months
  const year = Math.floor(total / 12)
  const month = total - year * 12
  return utcNoon(year, month, clampDay(year, month, date.getUTCDate()))
}

/** `AAAA-MM` do dia de calendário. */
export function monthKeyOf(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value)
}

/** Índice absoluto de meses de uma chave `AAAA-MM` (para somar/subtrair meses). */
export function monthIndexOfKey(key: string): number {
  const match = MONTH_KEY_PATTERN.exec(key)
  if (!match) throw new RangeError(`Chave de mês inválida: ${key}`)
  return Number(match[1]) * 12 + Number(match[2]) - 1
}

export function monthKeyFromIndex(index: number): string {
  const year = Math.floor(index / 12)
  const month = index - year * 12
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`
}

/** Soma `months` meses a uma chave `AAAA-MM`. */
export function addMonthsToKey(key: string, months: number): string {
  return monthKeyFromIndex(monthIndexOfKey(key) + months)
}

/** Diferença em meses entre duas chaves (`to - from`). */
export function monthsBetweenKeys(from: string, to: string): number {
  return monthIndexOfKey(to) - monthIndexOfKey(from)
}
