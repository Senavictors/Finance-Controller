import { describe, expect, it } from 'vitest'
import { toIso } from './dates'
import { brazilNationalHolidays, easterSunday, isHoliday } from './holidays'

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe('easterSunday (Meeus/Jones/Butcher)', () => {
  it.each([
    [2023, '2023-04-09'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
  ])('Páscoa de %i = %s', (year, expected) => {
    expect(toIso(easterSunday(year))).toBe(expected)
  })

  it('devolve meio-dia UTC', () => {
    expect(easterSunday(2026).toISOString()).toBe('2026-04-05T12:00:00.000Z')
  })
})

describe('brazilNationalHolidays', () => {
  it('2026: 9 fixos + Sexta-feira Santa, ordenados', () => {
    const dates = brazilNationalHolidays(2026).map((h) => h.date)
    expect(dates).toEqual([
      '2026-01-01',
      '2026-04-03',
      '2026-04-21',
      '2026-05-01',
      '2026-09-07',
      '2026-10-12',
      '2026-11-02',
      '2026-11-15',
      '2026-11-20',
      '2026-12-25',
    ])
  })

  it('2023 não tem 20/11 (Consciência Negra só a partir de 2024)', () => {
    const list = brazilNationalHolidays(2023)
    expect(list).toHaveLength(9)
    expect(list.map((h) => h.date)).not.toContain('2023-11-20')
    expect(brazilNationalHolidays(2024).map((h) => h.date)).toContain('2024-11-20')
  })

  it('Sexta-feira Santa acompanha a Páscoa nos anos 2024-2028', () => {
    const goodFriday = (year: number) =>
      brazilNationalHolidays(year).find((h) => h.name === 'Sexta-feira Santa')?.date
    expect(goodFriday(2024)).toBe('2024-03-29')
    expect(goodFriday(2025)).toBe('2025-04-18')
    expect(goodFriday(2026)).toBe('2026-04-03')
    expect(goodFriday(2027)).toBe('2027-03-26')
    expect(goodFriday(2028)).toBe('2028-04-14')
  })

  it('Carnaval e Corpus Christi não são feriados nacionais (ficam em extraDaysOff)', () => {
    expect(isHoliday(d('2026-02-17'))).toBe(false)
    expect(isHoliday(d('2026-06-04'))).toBe(false)
    expect(isHoliday(d('2026-02-17'), ['2026-02-17'])).toBe(true)
  })

  it('29/02 de ano bissexto: Páscoa e feriados não quebram', () => {
    expect(isHoliday(d('2028-02-29'))).toBe(false)
    expect(brazilNationalHolidays(2028).some((h) => h.date === '2028-02-29')).toBe(false)
  })
})

describe('isHoliday', () => {
  it('feriado nacional fixo e móvel', () => {
    expect(isHoliday(d('2026-10-12'))).toBe(true)
    expect(isHoliday(d('2026-04-03'))).toBe(true)
    expect(isHoliday(d('2026-10-13'))).toBe(false)
  })

  it('extraDaysOff vale como feriado', () => {
    expect(isHoliday(d('2026-10-14'), ['2026-10-14'])).toBe(true)
  })

  it('20/11 só é feriado a partir de 2024', () => {
    expect(isHoliday(d('2023-11-20'))).toBe(false)
    expect(isHoliday(d('2024-11-20'))).toBe(true)
  })
})
