import { describe, expect, it } from 'vitest'
import { adjustToBusinessDay, clampDay, isBusinessDay, presentialDays } from './calendar'
import { toIso } from './dates'
import { IncomeError } from './errors'

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const adj = (iso: string, rule: Parameters<typeof adjustToBusinessDay>[1], extra: string[] = []) =>
  toIso(adjustToBusinessDay(d(iso), rule, extra))

const OCT = { periodStart: d('2026-10-01'), periodEnd: d('2026-10-31') }

describe('presentialDays', () => {
  it('CA-02: outubro/2026, terça a quinta = 13 dias', () => {
    const days = presentialDays({ ...OCT, weekdays: [2, 3, 4] })
    expect(days).toHaveLength(13)
    expect(days[0]).toBe('2026-10-01')
    expect(days).toContain('2026-10-29')
  })

  it('CA-02: novembro/2026, segunda a sexta = 19 (21 menos 02/11 e 20/11)', () => {
    const days = presentialDays({
      periodStart: d('2026-11-01'),
      periodEnd: d('2026-11-30'),
      weekdays: [1, 2, 3, 4, 5],
    })
    expect(days).toHaveLength(19)
    expect(days).not.toContain('2026-11-02')
    expect(days).not.toContain('2026-11-20')
  })

  it('CA-02: abril/2026, segunda a sexta = 20 (22 menos 03/04 e 21/04)', () => {
    const days = presentialDays({
      periodStart: d('2026-04-01'),
      periodEnd: d('2026-04-30'),
      weekdays: [1, 2, 3, 4, 5],
    })
    expect(days).toHaveLength(20)
  })

  it('CA-03: override false remove, override true inclui feriado, extraDaysOff remove', () => {
    const base = { ...OCT, weekdays: [2, 3, 4] }
    expect(presentialDays({ ...base, overrides: { '2026-10-13': false } })).toHaveLength(12)
    expect(presentialDays({ ...base, overrides: { '2026-10-12': true } })).toHaveLength(14)
    expect(presentialDays({ ...base, extraDaysOff: ['2026-10-14'] })).toHaveLength(12)
  })

  it('override true inclui dia fora de weekdays; override false em dia que já não contava é no-op', () => {
    const base = { ...OCT, weekdays: [2, 3, 4] }
    expect(presentialDays({ ...base, overrides: { '2026-10-10': true } })).toContain('2026-10-10')
    expect(presentialDays({ ...base, overrides: { '2026-10-10': false } })).toHaveLength(13)
  })

  it('override fora do período é ignorado', () => {
    const base = { ...OCT, weekdays: [2, 3, 4] }
    expect(presentialDays({ ...base, overrides: { '2026-11-03': true } })).toHaveLength(13)
  })

  it('semana inteira: 31 dias de outubro menos 12/10 (feriado)', () => {
    expect(presentialDays({ ...OCT, weekdays: [0, 1, 2, 3, 4, 5, 6] })).toHaveLength(30)
  })

  it('só fins de semana', () => {
    const days = presentialDays({ ...OCT, weekdays: [0, 6] })
    expect(days).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-10',
      '2026-10-11',
      '2026-10-17',
      '2026-10-18',
      '2026-10-24',
      '2026-10-25',
      '2026-10-31',
    ])
  })

  it('weekdays vazio => nenhum dia', () => {
    expect(presentialDays({ ...OCT, weekdays: [] })).toEqual([])
  })

  it('período de 1 dia', () => {
    const one = { periodStart: d('2026-10-14'), periodEnd: d('2026-10-14') }
    expect(presentialDays({ ...one, weekdays: [3] })).toEqual(['2026-10-14'])
    expect(presentialDays({ ...one, weekdays: [2] })).toEqual([])
  })

  it('período invertido lança INCOME_INVALID_PERIOD', () => {
    expect(() =>
      presentialDays({ periodStart: d('2026-10-31'), periodEnd: d('2026-10-01'), weekdays: [1] }),
    ).toThrowError(IncomeError)
    try {
      presentialDays({ periodStart: d('2026-10-31'), periodEnd: d('2026-10-01'), weekdays: [1] })
    } catch (error) {
      expect((error as IncomeError).code).toBe('INCOME_INVALID_PERIOD')
    }
  })

  it('ruleStart/ruleEnd cortam o período e os overrides', () => {
    const days = presentialDays({
      ...OCT,
      weekdays: [2, 3, 4],
      ruleStart: d('2026-10-10'),
      ruleEnd: d('2026-10-22'),
      overrides: { '2026-10-02': true },
    })
    expect(days).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ])
  })

  it('virada de mês e de ano', () => {
    const days = presentialDays({
      periodStart: d('2026-12-28'),
      periodEnd: d('2027-01-05'),
      weekdays: [1, 2, 3, 4, 5],
    })
    // 28-31/12 (seg-qui), 01/01 é feriado (sexta), 04 e 05/01 (seg-ter); 25/12 fora do período
    expect(days).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-04',
      '2027-01-05',
    ])
  })

  it('não depende do fuso do processo (só getters UTC)', () => {
    const days = presentialDays({ ...OCT, weekdays: [2, 3, 4] })
    expect(days).toHaveLength(13)
  })
})

describe('isBusinessDay / adjustToBusinessDay', () => {
  it('fim de semana e feriado não são dia útil', () => {
    expect(isBusinessDay(d('2026-11-14'))).toBe(false) // sábado
    expect(isBusinessDay(d('2026-11-20'))).toBe(false) // feriado, sexta
    expect(isBusinessDay(d('2026-11-19'))).toBe(true)
    expect(isBusinessDay(d('2026-11-19'), ['2026-11-19'])).toBe(false)
  })

  it('NONE mantém; NEXT avança; PREVIOUS recua', () => {
    expect(adj('2026-11-15', 'NONE')).toBe('2026-11-15')
    expect(adj('2026-11-15', 'NEXT_BUSINESS_DAY')).toBe('2026-11-16')
    expect(adj('2026-11-15', 'PREVIOUS_BUSINESS_DAY')).toBe('2026-11-13')
  })

  it('feriado numa sexta: NEXT salta o fim de semana, PREVIOUS recua um dia', () => {
    expect(adj('2026-11-20', 'NEXT_BUSINESS_DAY')).toBe('2026-11-23')
    expect(adj('2026-11-20', 'PREVIOUS_BUSINESS_DAY')).toBe('2026-11-19')
  })

  it('dia útil não muda; extraDaysOff empurra', () => {
    expect(adj('2026-11-18', 'NEXT_BUSINESS_DAY')).toBe('2026-11-18')
    expect(adj('2026-11-18', 'NEXT_BUSINESS_DAY', ['2026-11-18'])).toBe('2026-11-19')
  })

  it('cruza mês e ano', () => {
    expect(adj('2027-01-01', 'NEXT_BUSINESS_DAY')).toBe('2027-01-04')
    expect(adj('2027-01-01', 'PREVIOUS_BUSINESS_DAY')).toBe('2026-12-31')
  })
})

describe('clampDay', () => {
  it('limita ao último dia do mês', () => {
    expect(clampDay(2027, 2, 31)).toBe(28)
    expect(clampDay(2028, 2, 31)).toBe(29)
    expect(clampDay(2026, 4, 31)).toBe(30)
    expect(clampDay(2026, 1, 31)).toBe(31)
    expect(clampDay(2026, 3, 15)).toBe(15)
  })
})
