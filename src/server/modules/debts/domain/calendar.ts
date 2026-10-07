// Aritmética de datas de calendário do módulo de dívidas (ADR-002): sempre meio-dia UTC, sem
// depender do fuso do processo. Local ao módulo para não alterar src/lib/dates.ts (compartilhado).

/** Fuso de negócio (ADR-002): "hoje" do usuário é o dia de calendário de São Paulo. */
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

const DAY_MS = 86_400_000

/** Meio-dia UTC do dia de calendário `year-month-day` (`month` 1-12). */
export function calendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
}

/** Normaliza um instante ou data para o meio-dia UTC do seu dia de calendário UTC. */
export function toCalendarDate(value: Date): Date {
  return calendarDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
}

/**
 * Dia de calendário de `now` no fuso de negócio (America/Sao_Paulo), como meio-dia UTC.
 * Recebe o instante por parâmetro (nada de relógio implícito).
 */
export function businessCalendarDay(now: Date, timeZone: string = BUSINESS_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return calendarDate(pick('year'), pick('month'), pick('day'))
}

/** Soma `days` dias de calendário (aceita negativo). */
export function addCalendarDays(date: Date, days: number): Date {
  return calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate() + days)
}

/** Dias de calendário de `from` até `to` (negativo se `to` for anterior). */
export function diffCalendarDays(from: Date, to: Date): number {
  return Math.round((toCalendarDate(to).getTime() - toCalendarDate(from).getTime()) / DAY_MS)
}

/** Último dia do mês (`month` 1-12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Soma `months` meses preservando o dia de `date` e prendendo ao último dia do mês quando ele
 * não existe (31/jan + 1 = 28/fev). Calcula sempre a partir da data ORIGINAL: use
 * `addMonthsClamped(first, k)` e não `addMonthsClamped(anterior, 1)`, senão o clamp acumula
 * (31/jan -> 28/fev -> 28/mar em vez de 31/mar).
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const base = toCalendarDate(date)
  const total = base.getUTCFullYear() * 12 + base.getUTCMonth() + months
  const year = Math.floor(total / 12)
  const monthIndex = total - year * 12
  const day = Math.min(base.getUTCDate(), daysInMonth(year, monthIndex + 1))
  return calendarDate(year, monthIndex + 1, day)
}

/** `YYYY-MM-DD` do dia de calendário (UTC) de `date`. */
export function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
