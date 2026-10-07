import { describe, expect, it } from 'vitest'
import { toIso } from './dates'
import {
  dasCompetence,
  dasDescription,
  dasDueDate,
  dasOccurrenceKey,
  projectDasEvents,
} from './das'

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const due = (year: number, month: number, dueDay = 20, extra: string[] = []) =>
  toIso(dasDueDate({ year, month, dueDay, extraDaysOff: extra }))

describe('dasDueDate (RN-06)', () => {
  it('CA-06: novembro/2026 (feriado) => 23/11; dezembro (domingo) => 21/12; outubro (terça) => 20/10', () => {
    expect(due(2026, 11)).toBe('2026-11-23')
    expect(due(2026, 12)).toBe('2026-12-21')
    expect(due(2026, 10)).toBe('2026-10-20')
  })

  it('os 12 meses de 2026 (dia 20: útil, sábado, domingo, feriado)', () => {
    const all = Array.from({ length: 12 }, (_, i) => due(2026, i + 1))
    expect(all).toEqual([
      '2026-01-20', // terça
      '2026-02-20', // sexta
      '2026-03-20', // sexta
      '2026-04-20', // segunda
      '2026-05-20', // quarta
      '2026-06-22', // sábado -> segunda
      '2026-07-20', // segunda
      '2026-08-20', // quinta
      '2026-09-21', // domingo -> segunda
      '2026-10-20', // terça
      '2026-11-23', // feriado (sexta) -> segunda
      '2026-12-21', // domingo -> segunda
    ])
  })

  it('dueDay 31 é limitado ao último dia do mês e ajustado', () => {
    expect(due(2026, 2, 31)).toBe('2026-03-02') // 28/02 sábado -> segunda 02/03
    expect(due(2026, 4, 31)).toBe('2026-04-30') // quinta
    expect(due(2027, 2, 31)).toBe('2027-03-01') // 28/02 domingo
  })

  it('extraDaysOff empurra o vencimento', () => {
    expect(due(2026, 10, 20, ['2026-10-20'])).toBe('2026-10-21')
  })
})

describe('dasCompetence', () => {
  it('CA-06: competência de 2026-11-23 é 2026-10', () => {
    expect(dasCompetence(d('2026-11-23'))).toBe('2026-10')
  })

  it('virada de ano', () => {
    expect(dasCompetence(d('2027-01-20'))).toBe('2026-12')
  })

  it('scheduleMonth ancora a competência quando o ajuste cruzou o mês', () => {
    expect(dasCompetence(d('2026-03-02'), { year: 2026, month: 2 })).toBe('2026-01')
  })
})

describe('projectDasEvents', () => {
  const profile = { dasAmountCents: 8_000, dasDueDay: 20 }

  it('um evento por vencimento em [from, to], ordenado, com competência e valor', () => {
    const events = projectDasEvents(profile, d('2026-10-05'), d('2027-01-31'))
    expect(events.map((e) => e.dateKey)).toEqual([
      '2026-10-20',
      '2026-11-23',
      '2026-12-21',
      '2027-01-20',
    ])
    expect(events.map((e) => e.competence)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12'])
    expect(events.every((e) => e.amountCents === 8_000)).toBe(true)
  })

  it('exclui vencimento fora do intervalo (bordas inclusivas)', () => {
    expect(projectDasEvents(profile, d('2026-10-21'), d('2026-11-22'))).toEqual([])
    expect(projectDasEvents(profile, d('2026-10-20'), d('2026-10-20'))).toHaveLength(1)
  })

  it('from > to => vazio', () => {
    expect(projectDasEvents(profile, d('2026-12-01'), d('2026-11-01'))).toEqual([])
  })

  it('não há DAS de competência anterior à abertura', () => {
    // aberto em out/2026: primeira competência é 2026-10 (vence 23/11)
    const events = projectDasEvents(
      { ...profile, openedAt: d('2026-10-15') },
      d('2026-10-01'),
      d('2026-12-31'),
    )
    expect(events.map((e) => e.dateKey)).toEqual(['2026-11-23', '2026-12-21'])
  })

  it('dueDay 31: vencimento empurrado para o mês seguinte ancora a competência no mês de agenda', () => {
    const events = projectDasEvents(
      { dasAmountCents: 8_000, dasDueDay: 31 },
      d('2026-02-01'),
      d('2026-03-31'),
    )
    // 31/01 (sábado) => 02/02; 28/02 (sábado) => 02/03; 31/03 (terça)
    expect(events.map((e) => e.dateKey)).toEqual(['2026-02-02', '2026-03-02', '2026-03-31'])
    expect(events.map((e) => e.competence)).toEqual(['2025-12', '2026-01', '2026-02'])
  })

  it('occurrenceKey e descrição', () => {
    expect(dasOccurrenceKey('2026-11-23')).toBe('das:2026-11-23')
    expect(dasDescription('2026-10')).toBe('DAS MEI 2026-10')
  })
})
