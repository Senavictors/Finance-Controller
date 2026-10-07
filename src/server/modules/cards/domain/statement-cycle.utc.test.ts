import { describe, expect, it } from 'vitest'
import { monthKeyOf } from './calendar'
import {
  getStatementCycle,
  getStatementCycleByKey,
  isCardConfigured,
  type StatementCycle,
} from './statement-cycle'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const iso = (date: Date) => date.toISOString().slice(0, 10)

function summarize(cycle: StatementCycle) {
  return {
    start: iso(cycle.periodStart),
    end: iso(cycle.periodEnd),
    closing: iso(cycle.closingDate),
    due: iso(cycle.dueDate),
    key: cycle.statementKey,
  }
}

describe('cards/domain/statement-cycle: getStatementCycle', () => {
  const cases: Array<{
    name: string
    closingDay: number
    dueDay: number
    purchase: string
    expected: { start: string; closing: string; due: string; key: string }
  }> = [
    {
      name: 'compra antes do fechamento: fatura do mesmo mês (CA-03: compra em 2026-10-05)',
      closingDay: 10,
      dueDay: 17,
      purchase: '2026-10-05',
      expected: { start: '2026-09-11', closing: '2026-10-10', due: '2026-10-17', key: '2026-10' },
    },
    {
      name: 'compra no dia anterior ao fechamento',
      closingDay: 10,
      dueDay: 17,
      purchase: '2026-10-09',
      expected: { start: '2026-09-11', closing: '2026-10-10', due: '2026-10-17', key: '2026-10' },
    },
    {
      name: 'compra exatamente no dia do fechamento entra na fatura que fecha',
      closingDay: 10,
      dueDay: 17,
      purchase: '2026-10-10',
      expected: { start: '2026-09-11', closing: '2026-10-10', due: '2026-10-17', key: '2026-10' },
    },
    {
      name: 'compra no dia seguinte ao fechamento vai para o mês seguinte',
      closingDay: 10,
      dueDay: 17,
      purchase: '2026-10-11',
      expected: { start: '2026-10-11', closing: '2026-11-10', due: '2026-11-17', key: '2026-11' },
    },
    {
      name: 'virada de ano: 20/12 com fechamento 10 vence em janeiro (CA-01)',
      closingDay: 10,
      dueDay: 17,
      purchase: '2026-12-20',
      expected: { start: '2026-12-11', closing: '2027-01-10', due: '2027-01-17', key: '2027-01' },
    },
    {
      name: 'janeiro antes do fechamento: ciclo começa em dezembro do ano anterior',
      closingDay: 10,
      dueDay: 17,
      purchase: '2026-01-05',
      expected: { start: '2025-12-11', closing: '2026-01-10', due: '2026-01-17', key: '2026-01' },
    },
    {
      name: 'vencimento <= fechamento vence no mês seguinte (25/5, outubro)',
      closingDay: 25,
      dueDay: 5,
      purchase: '2026-10-05',
      expected: { start: '2026-09-26', closing: '2026-10-25', due: '2026-11-05', key: '2026-11' },
    },
    {
      name: 'vencimento <= fechamento com virada de ano (25/5, dezembro)',
      closingDay: 25,
      dueDay: 5,
      purchase: '2026-12-10',
      expected: { start: '2026-11-26', closing: '2026-12-25', due: '2027-01-05', key: '2027-01' },
    },
    {
      name: 'vencimento igual ao fechamento vence no mês seguinte',
      closingDay: 10,
      dueDay: 10,
      purchase: '2026-10-10',
      expected: { start: '2026-09-11', closing: '2026-10-10', due: '2026-11-10', key: '2026-11' },
    },
    {
      name: 'fechamento 31 em fevereiro comum usa dia 28',
      closingDay: 31,
      dueDay: 10,
      purchase: '2026-02-10',
      expected: { start: '2026-02-01', closing: '2026-02-28', due: '2026-03-10', key: '2026-03' },
    },
    {
      name: 'fechamento 31 em fevereiro bissexto usa dia 29',
      closingDay: 31,
      dueDay: 10,
      purchase: '2028-02-10',
      expected: { start: '2028-02-01', closing: '2028-02-29', due: '2028-03-10', key: '2028-03' },
    },
    {
      name: 'fechamento 31: compra em 29/02 bissexto ainda entra em fevereiro',
      closingDay: 31,
      dueDay: 10,
      purchase: '2028-02-29',
      expected: { start: '2028-02-01', closing: '2028-02-29', due: '2028-03-10', key: '2028-03' },
    },
    {
      name: 'fechamento 31 em abril (30 dias)',
      closingDay: 31,
      dueDay: 31,
      purchase: '2026-04-30',
      expected: { start: '2026-04-01', closing: '2026-04-30', due: '2026-05-31', key: '2026-05' },
    },
    {
      name: 'fechamento 30 em fevereiro usa o último dia (28)',
      closingDay: 30,
      dueDay: 7,
      purchase: '2026-02-28',
      expected: { start: '2026-01-31', closing: '2026-02-28', due: '2026-03-07', key: '2026-03' },
    },
    {
      name: 'fechamento 5 e vencimento 1 (vence no mês seguinte ao do fechamento)',
      closingDay: 5,
      dueDay: 1,
      purchase: '2026-10-05',
      expected: { start: '2026-09-06', closing: '2026-10-05', due: '2026-11-01', key: '2026-11' },
    },
    {
      name: 'fechamento 15 e vencimento 31 em fevereiro (vencimento limitado a 28)',
      closingDay: 15,
      dueDay: 31,
      purchase: '2026-02-14',
      expected: { start: '2026-01-16', closing: '2026-02-15', due: '2026-02-28', key: '2026-02' },
    },
    {
      name: 'fechamento 28 e vencimento 17',
      closingDay: 28,
      dueDay: 17,
      purchase: '2026-10-29',
      expected: { start: '2026-10-29', closing: '2026-11-28', due: '2026-12-17', key: '2026-12' },
    },
  ]

  it.each(cases)('$name', ({ closingDay, dueDay, purchase, expected }) => {
    const cycle = getStatementCycle({ purchaseDate: day(purchase), closingDay, dueDay })
    expect(summarize(cycle)).toMatchObject(expected)
    // statementKey é o mês de vencimento (ADR-008)
    expect(cycle.statementKey).toBe(monthKeyOf(cycle.dueDate))
  })

  it('devolve dias de calendário em meio-dia UTC (nunca horário local)', () => {
    const cycle = getStatementCycle({ purchaseDate: day('2026-10-05'), closingDay: 10, dueDay: 17 })
    for (const date of [cycle.periodStart, cycle.periodEnd, cycle.closingDate, cycle.dueDate]) {
      expect(date.getUTCHours()).toBe(12)
      expect(date.getUTCMinutes()).toBe(0)
      expect(date.getUTCMilliseconds()).toBe(0)
    }
  })

  it('invariantes em todas as combinações de fechamento x vencimento x dia da compra', () => {
    let checked = 0
    for (const closingDay of [1, 5, 10, 15, 28, 29, 30, 31]) {
      for (const dueDay of [1, 10, 17, 28, 31]) {
        for (let dayOfYear = 0; dayOfYear < 800; dayOfYear += 3) {
          const purchase = new Date(Date.UTC(2027, 0, 1 + dayOfYear, 12))
          const cycle = getStatementCycle({ purchaseDate: purchase, closingDay, dueDay })
          // a compra cai dentro do ciclo
          expect(cycle.periodStart.getTime()).toBeLessThanOrEqual(purchase.getTime())
          expect(purchase.getTime()).toBeLessThanOrEqual(cycle.periodEnd.getTime())
          // vencimento nunca antes do fechamento
          expect(cycle.dueDate.getTime()).toBeGreaterThanOrEqual(cycle.closingDate.getTime())
          // o ciclo anterior termina um dia antes do início deste
          const previous = getStatementCycle({
            purchaseDate: new Date(cycle.periodStart.getTime() - 86_400_000),
            closingDay,
            dueDay,
          })
          expect(previous.closingDate.getTime() + 86_400_000).toBe(cycle.periodStart.getTime())
          expect(previous.statementKey < cycle.statementKey).toBe(true)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(5000)
  })

  it('closingInclusive = false: a compra no dia do fechamento vai para a fatura seguinte', () => {
    const onClosing = getStatementCycle({
      purchaseDate: day('2026-10-10'),
      closingDay: 10,
      dueDay: 17,
      closingInclusive: false,
    })
    expect(summarize(onClosing)).toMatchObject({
      start: '2026-10-10',
      end: '2026-11-09',
      closing: '2026-11-10',
      key: '2026-11',
    })

    const before = getStatementCycle({
      purchaseDate: day('2026-10-09'),
      closingDay: 10,
      dueDay: 17,
      closingInclusive: false,
    })
    expect(summarize(before)).toMatchObject({
      start: '2026-09-10',
      end: '2026-10-09',
      closing: '2026-10-10',
      key: '2026-10',
    })
  })

  it('rejeita dias de fechamento/vencimento e datas inválidas', () => {
    const code = (fn: () => unknown) => {
      try {
        fn()
      } catch (error) {
        return (error as { code?: string }).code
      }
      return undefined
    }
    expect(
      code(() => getStatementCycle({ purchaseDate: day('2026-10-05'), closingDay: 0, dueDay: 17 })),
    ).toBe('INVALID_BILLING_DAY')
    expect(
      code(() =>
        getStatementCycle({ purchaseDate: day('2026-10-05'), closingDay: 10, dueDay: 32 }),
      ),
    ).toBe('INVALID_BILLING_DAY')
    expect(
      code(() =>
        getStatementCycle({ purchaseDate: day('2026-10-05'), closingDay: 1.5, dueDay: 10 }),
      ),
    ).toBe('INVALID_BILLING_DAY')
    expect(
      code(() => getStatementCycle({ purchaseDate: new Date('x'), closingDay: 10, dueDay: 17 })),
    ).toBe('INVALID_DATE')
  })
})

describe('cards/domain/statement-cycle: getStatementCycleByKey', () => {
  it('é a inversa de getStatementCycle (ida e volta pela statementKey)', () => {
    for (const closingDay of [5, 10, 15, 28, 31]) {
      for (const dueDay of [1, 10, 17, 31]) {
        for (let month = 0; month < 14; month += 1) {
          const purchaseDate = new Date(Date.UTC(2026, month, 3, 12))
          const cycle = getStatementCycle({ purchaseDate, closingDay, dueDay })
          const byKey = getStatementCycleByKey({
            statementKey: cycle.statementKey,
            closingDay,
            dueDay,
          })
          expect(summarize(byKey)).toEqual(summarize(cycle))
        }
      }
    }
  })

  it('exemplos: fatura 2026-11 de um cartão 10/17 e de um cartão 25/5', () => {
    expect(
      summarize(getStatementCycleByKey({ statementKey: '2026-11', closingDay: 10, dueDay: 17 })),
    ).toMatchObject({ start: '2026-10-11', closing: '2026-11-10', due: '2026-11-17' })
    expect(
      summarize(getStatementCycleByKey({ statementKey: '2027-01', closingDay: 25, dueDay: 5 })),
    ).toMatchObject({ start: '2026-11-26', closing: '2026-12-25', due: '2027-01-05' })
  })

  it('statementKey inválida', () => {
    expect(() =>
      getStatementCycleByKey({ statementKey: '2026-13', closingDay: 10, dueDay: 17 }),
    ).toThrowError(/AAAA-MM/)
  })
})

describe('cards/domain/statement-cycle: isCardConfigured', () => {
  it('exige tipo cartão, limite, fechamento e vencimento', () => {
    const base = { type: 'CREDIT_CARD', creditLimit: 500_000, closingDay: 10, dueDay: 17 }
    expect(isCardConfigured(base)).toBe(true)
    expect(isCardConfigured({ ...base, creditLimit: null })).toBe(false)
    expect(isCardConfigured({ ...base, closingDay: null })).toBe(false)
    expect(isCardConfigured({ ...base, dueDay: null })).toBe(false)
    expect(isCardConfigured({ ...base, type: 'CHECKING' })).toBe(false)
  })
})
