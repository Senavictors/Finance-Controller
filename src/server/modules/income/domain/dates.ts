import { IncomeError } from './errors'

/**
 * Utilitários de data de calendário do módulo (ADR-002): toda data é meio-dia UTC e só os
 * getters UTC são usados, então o resultado não depende de `TZ` do processo. O fuso de
 * negócio (`America/Sao_Paulo`) só aparece em `calendarDateInZone`, que converte um instante
 * em "dia de calendário" e recebe o fuso por parâmetro. Nenhuma função lê o relógio.
 */

export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function isValidIso(value: string): boolean {
  if (!ISO_PATTERN.test(value)) return false
  const date = new Date(`${value}T12:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && toIso(date) === value
}

/** `YYYY-MM-DD` estrito -> meio-dia UTC. Lança `INCOME_INVALID_INPUT` para datas inexistentes. */
export function fromIso(value: string): Date {
  if (!isValidIso(value)) {
    throw new IncomeError('INCOME_INVALID_INPUT', `Data inválida: ${value}.`, { value })
  }
  return new Date(`${value}T12:00:00.000Z`)
}

export function addDays(date: Date, days: number): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate() + days)
}

/** 0 = domingo ... 6 = sábado. */
export function weekdayOf(date: Date): number {
  return date.getUTCDay()
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Limita `day` ao último dia do mês (31 em fevereiro => 28/29). */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(1, day), daysInMonth(year, month))
}

/** `YYYY-MM` de uma data. */
export function monthKey(date: Date): string {
  return toIso(date).slice(0, 7)
}

export function formatMonthKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/** Primeiro e último dia do mês (1..12). */
export function monthBounds(year: number, month: number): { start: Date; end: Date } {
  return { start: utcDate(year, month, 1), end: utcDate(year, month, daysInMonth(year, month)) }
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

/** Dia de calendário (meio-dia UTC) em que o instante `now` cai no fuso `timeZone`. */
export function calendarDateInZone(now: Date, timeZone: string = BUSINESS_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return utcDate(get('year'), get('month'), get('day'))
}

/** Meses (1-based) que intersectam `[from, to]`, em ordem. */
export function monthsBetween(from: Date, to: Date): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = []
  let cursor = { year: from.getUTCFullYear(), month: from.getUTCMonth() + 1 }
  const endIndex = to.getUTCFullYear() * 12 + to.getUTCMonth()
  while (cursor.year * 12 + (cursor.month - 1) <= endIndex) {
    result.push(cursor)
    cursor = nextMonth(cursor.year, cursor.month)
  }
  return result
}
