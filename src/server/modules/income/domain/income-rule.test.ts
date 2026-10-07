import { describe, expect, it } from 'vitest'
import { toIso } from './dates'
import {
  competencePeriod,
  expectedIncome,
  incomeOccurrenceKey,
  incomeOccurrencePrefix,
  paymentDateFor,
  projectIncomeEvents,
  type IncomeRuleParams,
} from './income-rule'

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

const RULE: IncomeRuleParams = {
  baseCents: 300_000,
  perDayCents: 4_000,
  weekdays: [2, 3, 4],
  payDay: 15,
  paymentAdjust: 'NEXT_BUSINESS_DAY',
  additionalBasis: 'PREVIOUS_MONTH',
  extraDaysOff: [],
  attendanceOverrides: {},
  startDate: d('2026-01-01'),
  endDate: null,
}

const pay = (
  year: number,
  month: number,
  payDay: number,
  adjust: IncomeRuleParams['paymentAdjust'],
  extraDaysOff: string[] = [],
) => toIso(paymentDateFor({ year, month, payDay, adjust, extraDaysOff }))

describe('paymentDateFor (RN-03)', () => {
  it('CA-05: dia 15 em novembro/2026 (domingo)', () => {
    expect(pay(2026, 11, 15, 'NEXT_BUSINESS_DAY')).toBe('2026-11-16')
    expect(pay(2026, 11, 15, 'PREVIOUS_BUSINESS_DAY')).toBe('2026-11-13')
    expect(pay(2026, 11, 15, 'NONE')).toBe('2026-11-15')
  })

  it('CA-05: dia 20 em novembro/2026 (feriado, sexta)', () => {
    expect(pay(2026, 11, 20, 'NEXT_BUSINESS_DAY')).toBe('2026-11-23')
    expect(pay(2026, 11, 20, 'PREVIOUS_BUSINESS_DAY')).toBe('2026-11-19')
  })

  it('CA-05: dia 31 em fevereiro/2027 (28/02, domingo) vai para 01/03', () => {
    expect(pay(2027, 2, 31, 'NEXT_BUSINESS_DAY')).toBe('2027-03-01')
  })

  it('dia 29/30/31 em fevereiro (comum e bissexto) e 31 em abril', () => {
    expect(pay(2028, 2, 29, 'NONE')).toBe('2028-02-29')
    expect(pay(2028, 2, 31, 'NONE')).toBe('2028-02-29')
    expect(pay(2026, 2, 30, 'NONE')).toBe('2026-02-28')
    expect(pay(2026, 4, 31, 'NONE')).toBe('2026-04-30')
  })

  it('sábado e domingo', () => {
    expect(pay(2026, 11, 14, 'NEXT_BUSINESS_DAY')).toBe('2026-11-16') // sábado
    expect(pay(2026, 11, 14, 'PREVIOUS_BUSINESS_DAY')).toBe('2026-11-13')
  })

  it('extraDaysOff conta como não útil', () => {
    expect(pay(2026, 11, 17, 'NEXT_BUSINESS_DAY', ['2026-11-17'])).toBe('2026-11-18')
  })

  it('PREVIOUS cruzando o mês (1º de um domingo)', () => {
    expect(pay(2026, 11, 1, 'PREVIOUS_BUSINESS_DAY')).toBe('2026-10-30')
  })
})

describe('competencePeriod (RN-02)', () => {
  it('PREVIOUS_MONTH: mês anterior ao pagamento, com virada de ano', () => {
    const p = competencePeriod({ paymentDate: d('2027-01-15'), additionalBasis: 'PREVIOUS_MONTH' })
    expect([toIso(p.start), toIso(p.end)]).toEqual(['2026-12-01', '2026-12-31'])
  })

  it('SAME_MONTH: o mês do pagamento', () => {
    const p = competencePeriod({ paymentDate: d('2026-10-15'), additionalBasis: 'SAME_MONTH' })
    expect([toIso(p.start), toIso(p.end)]).toEqual(['2026-10-01', '2026-10-31'])
  })

  it('scheduleMonth ancora a competência quando o ajuste cruzou o mês', () => {
    // pagamento agendado para 31/jan, empurrado para 02/fev: competência continua dezembro
    const p = competencePeriod({
      paymentDate: d('2027-02-01'),
      additionalBasis: 'PREVIOUS_MONTH',
      scheduleMonth: { year: 2027, month: 1 },
    })
    expect([toIso(p.start), toIso(p.end)]).toEqual(['2026-12-01', '2026-12-31'])
  })
})

describe('expectedIncome (RN-01)', () => {
  it('CA-04: PREVIOUS_MONTH, pagamento em novembro/2026 => 13 dias de outubro', () => {
    const result = expectedIncome(RULE, d('2026-11-16'))
    expect(result.presentialDays).toBe(13)
    expect(result.dates).toHaveLength(13)
    expect(result.base).toBe(300_000)
    expect(result.additional).toBe(52_000)
    expect(result.total).toBe(352_000)
  })

  it('CA-04: SAME_MONTH, pagamento em outubro => mesmo total', () => {
    const result = expectedIncome({ ...RULE, additionalBasis: 'SAME_MONTH' }, d('2026-10-15'))
    expect(result.presentialDays).toBe(13)
    expect(result.total).toBe(352_000)
  })

  it('CA-04: weekdays vazio => adicional 0; perDayCents 0 => total = base', () => {
    const noDays = expectedIncome({ ...RULE, weekdays: [] }, d('2026-11-16'))
    expect(noDays.additional).toBe(0)
    expect(noDays.total).toBe(300_000)
    const noRate = expectedIncome({ ...RULE, perDayCents: 0 }, d('2026-11-16'))
    expect(noRate.additional).toBe(0)
    expect(noRate.total).toBe(300_000)
  })

  it('base 0: só o adicional', () => {
    expect(expectedIncome({ ...RULE, baseCents: 0 }, d('2026-11-16')).total).toBe(52_000)
  })

  it('overrides e extraDaysOff entram na contagem (competência outubro)', () => {
    const rule = {
      ...RULE,
      attendanceOverrides: { '2026-10-13': false },
      extraDaysOff: ['2026-10-14'],
    }
    const result = expectedIncome(rule, d('2026-11-16'))
    expect(result.presentialDays).toBe(11)
    expect(result.total).toBe(300_000 + 11 * 4_000)
  })

  it('startDate da regra delimita pagamentos, não os dias de trabalho da competência', () => {
    const result = expectedIncome({ ...RULE, startDate: d('2026-11-01') }, d('2026-11-16'))
    expect(result.presentialDays).toBe(13)
  })
})

describe('projectIncomeEvents', () => {
  it('um evento por mês, ordenado, com componentes e chave de data', () => {
    const events = projectIncomeEvents(RULE, d('2026-10-01'), d('2026-12-31'))
    expect(events.map((e) => e.dateKey)).toEqual(['2026-10-15', '2026-11-16', '2026-12-15'])
    expect(events.map((e) => e.scheduleMonth)).toEqual(['2026-10', '2026-11', '2026-12'])
    // novembro: competência outubro (13 dias); dezembro: competência novembro (19 úteis dos dias 2,3,4)
    expect(events[1]?.total).toBe(352_000)
    expect(events[0]?.base).toBe(300_000)
  })

  it('horizonte atravessando o ano', () => {
    const events = projectIncomeEvents(RULE, d('2026-12-01'), d('2027-02-28'))
    expect(events.map((e) => e.dateKey)).toEqual(['2026-12-15', '2027-01-15', '2027-02-15'])
    // janeiro/2027: competência dezembro/2026 (ter-qui: 1,2,3,8,9,10,15,16,17,22,23,24,29,30,31; 25/12 sexta fora)
    expect(events[1]?.presentialDays).toBe(
      [
        '2026-12-01',
        '2026-12-02',
        '2026-12-03',
        '2026-12-08',
        '2026-12-09',
        '2026-12-10',
        '2026-12-15',
        '2026-12-16',
        '2026-12-17',
        '2026-12-22',
        '2026-12-23',
        '2026-12-24',
        '2026-12-29',
        '2026-12-30',
        '2026-12-31',
      ].length,
    )
  })

  it('respeita startDate e endDate (pelo pagamento)', () => {
    const rule = { ...RULE, startDate: d('2026-11-01'), endDate: d('2026-12-15') }
    const events = projectIncomeEvents(rule, d('2026-10-01'), d('2027-03-31'))
    expect(events.map((e) => e.dateKey)).toEqual(['2026-11-16', '2026-12-15'])
  })

  it('só inclui pagamentos dentro de [from, to] (bordas inclusivas)', () => {
    expect(projectIncomeEvents(RULE, d('2026-11-16'), d('2026-11-16'))).toHaveLength(1)
    expect(projectIncomeEvents(RULE, d('2026-11-17'), d('2026-12-14'))).toHaveLength(0)
  })

  it('from > to => vazio', () => {
    expect(projectIncomeEvents(RULE, d('2026-12-01'), d('2026-11-01'))).toEqual([])
  })

  it('pagamento empurrado para o mês seguinte pelo ajuste continua achado e ancora a competência', () => {
    // dia 31, NEXT: 31/jan/2027 (domingo) => 01/fev/2027; competência de fevereiro = janeiro? não:
    // agenda de janeiro => competência dezembro (PREVIOUS_MONTH)
    const rule = { ...RULE, payDay: 31, startDate: d('2026-01-01') }
    const events = projectIncomeEvents(rule, d('2027-02-01'), d('2027-02-01'))
    expect(events).toHaveLength(1)
    expect(events[0]?.dateKey).toBe('2027-02-01')
    expect(events[0]?.scheduleMonth).toBe('2027-01')
    expect(toIso(events[0]!.competence.start)).toBe('2026-12-01')
  })

  it('occurrenceKey determinística e estável', () => {
    expect(incomeOccurrenceKey('rule-1', '2026-11-16')).toBe('income:rule-1:2026-11-16')
    expect(
      incomeOccurrenceKey('rule-1', '2026-11-16').startsWith(incomeOccurrencePrefix('rule-1')),
    ).toBe(true)
  })

  it('totais mês a mês seguem a competência de cada pagamento', () => {
    const before = projectIncomeEvents(RULE, d('2026-10-01'), d('2026-12-31')).map((e) => e.total)
    expect(before).toEqual([
      // outubro: competência setembro/2026 (ter-qui: 1,2,3,8,9,10,15,16,17,22,23,24,29,30 = 14)
      300_000 + 14 * 4_000,
      352_000,
      300_000 + 12 * 4_000, // dezembro: competência novembro (ter-qui: 3,4,5,10,11,12,17,18,19,24,25,26 = 12)
    ])
  })
})
