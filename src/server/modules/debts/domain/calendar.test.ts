import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  addMonthsClamped,
  businessCalendarDay,
  daysInMonth,
  diffCalendarDays,
  formatCalendarDate,
  toCalendarDate,
} from './calendar'

describe('debts/calendar: aritmética de calendário (FC2-F1-05)', () => {
  const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

  it('addMonthsClamped: dia 31 prende ao fim do mês sem acumular', () => {
    const first = d('2026-01-31')
    expect(formatCalendarDate(addMonthsClamped(first, 0))).toBe('2026-01-31')
    expect(formatCalendarDate(addMonthsClamped(first, 1))).toBe('2026-02-28')
    expect(formatCalendarDate(addMonthsClamped(first, 2))).toBe('2026-03-31')
    expect(formatCalendarDate(addMonthsClamped(first, 3))).toBe('2026-04-30')
  })

  it('addMonthsClamped: dias 29 e 30, ano bissexto e virada de ano', () => {
    expect(formatCalendarDate(addMonthsClamped(d('2028-01-29'), 1))).toBe('2028-02-29')
    expect(formatCalendarDate(addMonthsClamped(d('2027-01-29'), 1))).toBe('2027-02-28')
    expect(formatCalendarDate(addMonthsClamped(d('2026-01-30'), 1))).toBe('2026-02-28')
    expect(formatCalendarDate(addMonthsClamped(d('2026-11-05'), 2))).toBe('2027-01-05')
    expect(formatCalendarDate(addMonthsClamped(d('2026-11-05'), 14))).toBe('2028-01-05')
    expect(formatCalendarDate(addMonthsClamped(d('2026-03-31'), -1))).toBe('2026-02-28')
    expect(formatCalendarDate(addMonthsClamped(d('2026-01-15'), -2))).toBe('2025-11-15')
  })

  it('addMonthsClamped devolve meio-dia UTC', () => {
    expect(addMonthsClamped(d('2026-10-05'), 3).toISOString()).toBe('2027-01-05T12:00:00.000Z')
  })

  it('addCalendarDays e diffCalendarDays', () => {
    expect(formatCalendarDate(addCalendarDays(d('2026-12-31'), 1))).toBe('2027-01-01')
    expect(formatCalendarDate(addCalendarDays(d('2026-03-01'), -1))).toBe('2026-02-28')
    expect(diffCalendarDays(d('2026-10-01'), d('2026-10-11'))).toBe(10)
    expect(diffCalendarDays(d('2026-10-11'), d('2026-10-01'))).toBe(-10)
    expect(diffCalendarDays(d('2026-12-31'), d('2027-01-01'))).toBe(1)
  })

  it('businessCalendarDay usa o dia de São Paulo (UTC-3), não o do runner', () => {
    // 02:30 UTC de 06/10 ainda é 05/10 em São Paulo.
    expect(formatCalendarDate(businessCalendarDay(new Date('2026-10-06T02:30:00.000Z')))).toBe(
      '2026-10-05',
    )
    // 03:00 UTC = 00:00 em São Paulo: já é 06/10.
    expect(formatCalendarDate(businessCalendarDay(new Date('2026-10-06T03:00:00.000Z')))).toBe(
      '2026-10-06',
    )
    expect(businessCalendarDay(new Date('2026-10-06T15:00:00.000Z')).toISOString()).toBe(
      '2026-10-06T12:00:00.000Z',
    )
  })

  it('toCalendarDate e daysInMonth', () => {
    expect(toCalendarDate(new Date('2026-10-05T01:02:03.000Z')).toISOString()).toBe(
      '2026-10-05T12:00:00.000Z',
    )
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})
