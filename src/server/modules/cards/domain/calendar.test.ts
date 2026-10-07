import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonthsToKey,
  calendarDayInZone,
  clampDay,
  daysInMonth,
  diffInDays,
  isCalendarDay,
  monthKeyOf,
  monthsBetweenKeys,
  toCalendarDay,
  utcNoon,
} from './calendar'
import { assertStatementKeyCreatable } from './move'
import { CardsError, isCardsError } from './errors'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe('cards/domain/calendar', () => {
  it('daysInMonth e clampDay (fevereiro comum e bissexto)', () => {
    expect(daysInMonth(2026, 1)).toBe(28)
    expect(daysInMonth(2028, 1)).toBe(29)
    expect(daysInMonth(2026, 3)).toBe(30)
    expect(clampDay(2026, 1, 31)).toBe(28)
    expect(clampDay(2028, 1, 31)).toBe(29)
    expect(clampDay(2026, 0, 31)).toBe(31)
  })

  it('utcNoon e toCalendarDay produzem meio-dia UTC', () => {
    expect(utcNoon(2026, 9, 5)).toEqual(day('2026-10-05'))
    expect(toCalendarDay(new Date('2026-10-05T23:59:59.999Z'))).toEqual(day('2026-10-05'))
    expect(isCalendarDay(day('2026-10-05'))).toBe(true)
    expect(isCalendarDay(new Date('2026-10-05T00:00:00.000Z'))).toBe(false)
  })

  it('calendarDayInZone: o dia de Sao Paulo (UTC-3)', () => {
    expect(calendarDayInZone(new Date('2026-10-06T01:00:00.000Z'))).toEqual(day('2026-10-05'))
    expect(calendarDayInZone(new Date('2026-10-06T03:00:00.000Z'))).toEqual(day('2026-10-06'))
    expect(calendarDayInZone(new Date('2026-10-05T12:00:00.000Z'))).toEqual(day('2026-10-05'))
    expect(calendarDayInZone(new Date('2026-12-31T23:00:00.000Z'))).toEqual(day('2026-12-31'))
    expect(calendarDayInZone(new Date('2027-01-01T02:59:59.000Z'))).toEqual(day('2026-12-31'))
    expect(calendarDayInZone(new Date('2026-10-06T01:00:00.000Z'), 'UTC')).toEqual(
      day('2026-10-06'),
    )
  })

  it('addDays e diffInDays atravessam mês e ano', () => {
    expect(addDays(day('2026-12-31'), 1)).toEqual(day('2027-01-01'))
    expect(addDays(day('2026-03-01'), -1)).toEqual(day('2026-02-28'))
    expect(diffInDays(day('2026-10-05'), day('2026-10-17'))).toBe(12)
    expect(diffInDays(day('2026-10-17'), day('2026-10-05'))).toBe(-12)
    expect(diffInDays(day('2026-12-25'), day('2027-01-05'))).toBe(11)
  })

  it('monthKeyOf e aritmética de chaves AAAA-MM (virada de ano)', () => {
    expect(monthKeyOf(day('2026-01-31'))).toBe('2026-01')
    expect(addMonthsToKey('2026-11', 2)).toBe('2027-01')
    expect(addMonthsToKey('2027-01', -2)).toBe('2026-11')
    expect(monthsBetweenKeys('2026-10', '2027-02')).toBe(4)
    expect(monthsBetweenKeys('2026-10', '2026-08')).toBe(-2)
    expect(() => addMonthsToKey('2026-13', 1)).toThrow()
  })
})

describe('cards/domain/move: assertStatementKeyCreatable', () => {
  it('aceita da janela [-1, +2] meses em torno do ciclo natural', () => {
    for (const target of ['2026-09', '2026-10', '2026-11', '2026-12']) {
      expect(() =>
        assertStatementKeyCreatable({ naturalKey: '2026-10', targetKey: target }),
      ).not.toThrow()
    }
  })

  it('rejeita fora da janela e chave inválida', () => {
    for (const target of ['2026-08', '2027-01']) {
      try {
        assertStatementKeyCreatable({ naturalKey: '2026-10', targetKey: target })
        throw new Error('deveria lançar')
      } catch (error) {
        expect((error as CardsError).code).toBe('STATEMENT_TARGET_OUT_OF_RANGE')
      }
    }
    expect(() => assertStatementKeyCreatable({ naturalKey: '2026-10', targetKey: 'abc' })).toThrow(
      /AAAA-MM/,
    )
  })

  it('CardsError carrega categoria e detalhes', () => {
    const error = new CardsError('STATEMENT_OVERPAYMENT', 'x', { open: 1 })
    expect(isCardsError(error)).toBe(true)
    expect(error.category).toBe('CONFLICT')
    expect(error.details).toEqual({ open: 1 })
    expect(new CardsError('CARD_NOT_FOUND', 'x').category).toBe('NOT_FOUND')
    expect(new CardsError('INVALID_AMOUNT', 'x').category).toBe('INVALID')
    expect(isCardsError(new Error('x'))).toBe(false)
  })
})
