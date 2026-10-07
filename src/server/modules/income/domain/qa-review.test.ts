import { describe, expect, it } from 'vitest'
import { dasDueDate, projectDasEvents } from './das'
import { toIso } from './dates'
import { brazilNationalHolidays, easterSunday, isHoliday } from './holidays'
import { paymentDateFor, projectIncomeEvents, type IncomeRuleParams } from './income-rule'
import { meiLevel, projectYearEnd, proportionalCeiling } from './mei-ceiling'

/**
 * Revisão QA (FC2-F1-06): casos independentes dos escritos pelo implementador, calculados à mão
 * (calendário 2025-2028). Valores fictícios e redondos.
 */
const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe('QA: feriados nacionais 2025-2028', () => {
  const fixed = (y: number) => [
    `${y}-01-01`,
    `${y}-04-21`,
    `${y}-05-01`,
    `${y}-09-07`,
    `${y}-10-12`,
    `${y}-11-02`,
    `${y}-11-15`,
    `${y}-11-20`,
    `${y}-12-25`,
  ]
  it.each([
    [2025, '2025-04-18', '2025-04-20'],
    [2026, '2026-04-03', '2026-04-05'],
    [2027, '2027-03-26', '2027-03-28'],
    [2028, '2028-04-14', '2028-04-16'],
  ])('%i: 9 fixos + Sexta-feira Santa %s (Páscoa %s)', (year, goodFriday, easter) => {
    expect(toIso(easterSunday(year))).toBe(easter)
    const dates = brazilNationalHolidays(year).map((h) => h.date)
    expect(dates).toEqual([...fixed(year), goodFriday].sort())
  })

  it('Carnaval e Corpus Christi não são feriados nacionais (task: via extraDaysOff)', () => {
    // Carnaval 2026: 16 e 17/02; Corpus Christi 2026: 04/06
    for (const iso of ['2026-02-16', '2026-02-17', '2026-06-04']) {
      expect(isHoliday(d(iso))).toBe(false)
      expect(isHoliday(d(iso), [iso])).toBe(true)
    }
  })
})

describe('QA: data de pagamento em viradas de mês e de ano', () => {
  const pay = (
    year: number,
    month: number,
    payDay: number,
    adjust: 'NONE' | 'NEXT_BUSINESS_DAY' | 'PREVIOUS_BUSINESS_DAY',
  ) => toIso(paymentDateFor({ year, month, payDay, adjust }))

  it('dia 1 de janeiro/2027 (feriado, sexta): próximo => 04/01, anterior => 31/12/2026', () => {
    expect(pay(2027, 1, 1, 'NEXT_BUSINESS_DAY')).toBe('2027-01-04')
    expect(pay(2027, 1, 1, 'PREVIOUS_BUSINESS_DAY')).toBe('2026-12-31')
    expect(pay(2027, 1, 1, 'NONE')).toBe('2027-01-01')
  })

  it('dia 30 de janeiro/2027 (sábado): próximo cruza para 01/02, anterior => 29/01', () => {
    expect(pay(2027, 1, 30, 'NEXT_BUSINESS_DAY')).toBe('2027-02-01')
    expect(pay(2027, 1, 30, 'PREVIOUS_BUSINESS_DAY')).toBe('2027-01-29')
  })

  it('dia 25/12/2026 (Natal, sexta): próximo => 28/12, anterior => 24/12', () => {
    expect(pay(2026, 12, 25, 'NEXT_BUSINESS_DAY')).toBe('2026-12-28')
    expect(pay(2026, 12, 25, 'PREVIOUS_BUSINESS_DAY')).toBe('2026-12-24')
  })

  it('dias 29/30/31 em fevereiro: bissexto (2028) e comum (2027)', () => {
    // 29/02/2028 é terça; 28/02/2027 é domingo
    expect(pay(2028, 2, 31, 'NEXT_BUSINESS_DAY')).toBe('2028-02-29')
    expect(pay(2028, 2, 30, 'NONE')).toBe('2028-02-29')
    expect(pay(2027, 2, 29, 'NEXT_BUSINESS_DAY')).toBe('2027-03-01')
    expect(pay(2027, 2, 30, 'PREVIOUS_BUSINESS_DAY')).toBe('2027-02-26')
  })

  it('dia 31 em abril/2027 (30 dias, sexta 30/04) => 30/04', () => {
    expect(pay(2027, 4, 31, 'NEXT_BUSINESS_DAY')).toBe('2027-04-30')
  })

  it('Sexta-feira Santa 2027 (26/03) empurra o pagamento de 26/03 para segunda 29/03', () => {
    expect(pay(2027, 3, 26, 'NEXT_BUSINESS_DAY')).toBe('2027-03-29')
    expect(pay(2027, 3, 26, 'PREVIOUS_BUSINESS_DAY')).toBe('2027-03-25')
  })
})

describe('QA: eventos de renda atravessando o ano (PREVIOUS_BUSINESS_DAY, dia 1)', () => {
  const rule: IncomeRuleParams = {
    baseCents: 300_000,
    perDayCents: 4_000,
    weekdays: [2, 3, 4],
    payDay: 1,
    paymentAdjust: 'PREVIOUS_BUSINESS_DAY',
    additionalBasis: 'PREVIOUS_MONTH',
    extraDaysOff: [],
    attendanceOverrides: {},
    startDate: d('2026-01-01'),
    endDate: null,
  }

  it('um evento por pagamento, sem duplicar nem perder o de 31/12', () => {
    const events = projectIncomeEvents(rule, d('2026-12-01'), d('2027-02-28'))
    expect(events.map((e) => e.dateKey)).toEqual(['2026-12-01', '2026-12-31', '2027-02-01'])
    // competência = mês anterior ao MÊS DE AGENDA: nov/2026 (12 dias), dez/2026 (15), jan/2027 (12)
    expect(events.map((e) => e.presentialDays)).toEqual([12, 15, 12])
    expect(events.map((e) => e.total)).toEqual([348_000, 360_000, 348_000])
  })

  it('janela que começa exatamente na data ajustada inclui o evento; um dia depois não', () => {
    expect(projectIncomeEvents(rule, d('2026-12-31'), d('2026-12-31')).length).toBe(1)
    expect(projectIncomeEvents(rule, d('2027-01-01'), d('2027-01-31')).length).toBe(0)
  })

  it('endDate da regra corta pagamentos posteriores', () => {
    const limited = { ...rule, endDate: d('2026-12-31') }
    expect(
      projectIncomeEvents(limited, d('2026-12-01'), d('2027-02-28')).map((e) => e.dateKey),
    ).toEqual(['2026-12-01', '2026-12-31'])
  })
})

describe('QA: DAS', () => {
  const due = (y: number, m: number, day = 20) =>
    toIso(dasDueDate({ year: y, month: m, dueDay: day }))

  it('2027: sábados e feriado adiam para segunda; dia útil mantém', () => {
    expect(due(2027, 1)).toBe('2027-01-20') // quarta
    expect(due(2027, 2)).toBe('2027-02-22') // sábado
    expect(due(2027, 3)).toBe('2027-03-22') // sábado
    expect(due(2027, 4)).toBe('2027-04-20') // terça
    expect(due(2027, 11)).toBe('2027-11-22') // sábado e feriado de 20/11
  })

  it('dueDay 31: janeiro/2027 (domingo) => 01/02; fevereiro/2027 clamp 28 (domingo) => 01/03', () => {
    expect(due(2027, 1, 31)).toBe('2027-02-01')
    expect(due(2027, 2, 31)).toBe('2027-03-01')
  })

  it('não gera DAS de competência anterior à abertura', () => {
    const events = projectDasEvents(
      { dasAmountCents: 8_000, dasDueDay: 20, openedAt: d('2026-10-05') },
      d('2026-10-01'),
      d('2027-01-31'),
    )
    // competência 2026-09 (venc. out) < abertura 2026-10: fora; nov (2026-10), dez, jan entram
    expect(events.map((e) => e.competence)).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(events.map((e) => e.dateKey)).toEqual(['2026-11-23', '2026-12-21', '2027-01-20'])
  })
})

describe('QA: teto proporcional e níveis', () => {
  it('abertura em julho => 6/12; dezembro => 1/12; arredondamento half-up', () => {
    const ceil = (openedAt: string, year = 2026, annualCeiling = 8_100_000) =>
      proportionalCeiling({ annualCeiling, openedAt: d(openedAt), year })
    expect(ceil('2026-07-01')).toBe(4_050_000)
    expect(ceil('2026-07-31')).toBe(4_050_000)
    expect(ceil('2026-12-15')).toBe(675_000)
    expect(ceil('2026-05-01', 2026, 100)).toBe(Math.round((100 * 8) / 12)) // 66,67 => 67
    expect(ceil('2026-12-01', 2026, 100)).toBe(8) // 8,33 => 8
    expect(ceil('2026-07-01', 2027)).toBe(8_100_000)
    expect(ceil('2026-07-01', 2025)).toBe(0)
  })

  it('níveis nas bordas de 80/95/100/120% do teto proporcional de julho', () => {
    const ceiling = 4_050_000
    const level = (accumulated: number) => meiLevel({ accumulated, ceiling })
    expect(level(3_239_999)).toBe('OK')
    expect(level(3_240_000)).toBe('ATTENTION')
    expect(level(3_847_499)).toBe('ATTENTION')
    expect(level(3_847_500)).toBe('CRITICAL')
    expect(level(4_049_999)).toBe('CRITICAL')
    expect(level(4_050_000)).toBe('EXCEEDED')
    expect(level(4_859_999)).toBe('EXCEEDED')
    expect(level(4_860_000)).toBe('SEVERE')
  })

  it('projeção em ano de abertura em julho: só meses de atividade entram na média', () => {
    const byMonth = [0, 0, 0, 0, 0, 0, 300_000, 300_000, 300_000, 0, 0, 0]
    const ok = projectYearEnd({
      byMonth,
      monthsElapsed: 9,
      ceiling: 4_050_000,
      firstActiveMonth: 7,
    })
    expect(ok).toMatchObject({
      monthlyAverage: 300_000,
      projectedTotal: 1_800_000,
      willExceed: false,
    })
    expect(ok.exceedMonth).toBeNull()
    const over = projectYearEnd({
      byMonth,
      monthsElapsed: 9,
      ceiling: 1_000_000,
      firstActiveMonth: 7,
    })
    expect(over).toMatchObject({ willExceed: true, exceedMonth: 10 })
  })
})
