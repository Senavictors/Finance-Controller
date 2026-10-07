import { describe, expect, it } from 'vitest'
import {
  buildMeiYearSummary,
  firstActiveMonthOf,
  monthsElapsedIn,
  sumMeiByMonth,
  type MeiLedgerRow,
} from './mei-year'

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const row = (over: Partial<MeiLedgerRow>): MeiLedgerRow => ({
  accountId: 'pj',
  kind: 'INCOME',
  status: 'CLEARED',
  amount: 100_000,
  date: d('2026-03-10'),
  refundOfId: null,
  ...over,
})
const PJ = new Set(['pj'])

describe('sumMeiByMonth (RN-08, CA-12)', () => {
  it('soma INCOME CLEARED|RECONCILED em contas PJ por mês do recebimento', () => {
    const byMonth = sumMeiByMonth(
      [
        row({ amount: 300_000, date: d('2026-03-10') }),
        row({ amount: 50_000, date: d('2026-03-28'), status: 'RECONCILED' }),
        row({ amount: 200_000, date: d('2026-05-05') }),
      ],
      2026,
      PJ,
    )
    expect(byMonth[2]).toBe(350_000)
    expect(byMonth[4]).toBe(200_000)
    expect(byMonth.reduce((a, b) => a + b, 0)).toBe(550_000)
    expect(byMonth).toHaveLength(12)
  })

  it('ignora previstos, pendentes, transferências, ajustes, estornos, outro ano e conta não PJ', () => {
    const byMonth = sumMeiByMonth(
      [
        row({ status: 'PLANNED' }),
        row({ status: 'PENDING' }),
        row({ kind: 'TRANSFER' }),
        row({ kind: 'ADJUSTMENT' }),
        row({ kind: 'CARD_PAYMENT' }),
        row({ refundOfId: 'orig-1' }),
        row({ date: d('2025-12-31') }),
        row({ date: d('2027-01-01') }),
        row({ accountId: 'pf' }),
        row({ kind: 'EXPENSE', amount: -5_000 }),
      ],
      2026,
      PJ,
    )
    expect(byMonth.every((v) => v === 0)).toBe(true)
  })

  it('virada de ano: 31/12 conta no ano; 01/01 no seguinte', () => {
    const rows = [row({ date: d('2026-12-31') }), row({ date: d('2027-01-01') })]
    expect(sumMeiByMonth(rows, 2026, PJ)[11]).toBe(100_000)
    expect(sumMeiByMonth(rows, 2027, PJ)[0]).toBe(100_000)
  })
})

describe('monthsElapsedIn / firstActiveMonthOf', () => {
  it('meses fechados: mês corrente fica aberto', () => {
    expect(monthsElapsedIn(2026, d('2026-10-07'))).toBe(9)
    expect(monthsElapsedIn(2026, d('2026-01-31'))).toBe(0)
    expect(monthsElapsedIn(2025, d('2026-10-07'))).toBe(12)
    expect(monthsElapsedIn(2027, d('2026-10-07'))).toBe(0)
  })

  it('mês de abertura só no ano de abertura', () => {
    expect(firstActiveMonthOf(d('2026-03-10'), 2026)).toBe(3)
    expect(firstActiveMonthOf(d('2026-03-10'), 2027)).toBe(1)
    expect(firstActiveMonthOf(null, 2026)).toBe(1)
  })
})

describe('buildMeiYearSummary (CA-13)', () => {
  it('acumulado 5400000 com teto proporcional 6750000: 80%, ATTENTION, restante 1350000', () => {
    const byMonth = [
      0, 0, 600_000, 600_000, 600_000, 600_000, 600_000, 600_000, 600_000, 600_000, 600_000, 0,
    ]
    const summary = buildMeiYearSummary({
      year: 2026,
      today: d('2026-10-07'),
      annualCeilingCents: 8_100_000,
      openedAt: d('2026-03-10'),
      byMonth,
    })
    expect(summary.ceiling).toBe(6_750_000)
    expect(summary.accumulated).toBe(5_400_000)
    expect(summary.pct).toBe(80)
    expect(summary.level).toBe('ATTENTION')
    expect(summary.remaining).toBe(1_350_000)
    expect(summary.message).toBe('Você usou 80% do teto do MEI')
  })

  it('projeção indicando excesso preenche willExceed e exceedMonth', () => {
    const byMonth = [0, 0, 700_000, 700_000, 700_000, 700_000, 700_000, 700_000, 700_000, 0, 0, 0]
    const summary = buildMeiYearSummary({
      year: 2026,
      today: d('2026-10-07'),
      annualCeilingCents: 8_100_000,
      openedAt: d('2026-03-10'),
      byMonth,
    })
    // fechados: mar-set (7 meses de 700000), média 700000; projeção = 10 x 700000 = 7.000.000 > 6.750.000
    expect(summary.projection.projectedTotal).toBe(7_000_000)
    expect(summary.projection.willExceed).toBe(true)
    expect(summary.projection.exceedMonth).toBe(12)
  })

  it('teto 0 (ano antes da abertura) sem receita: OK sem divisão por zero', () => {
    const summary = buildMeiYearSummary({
      year: 2025,
      today: d('2026-10-07'),
      annualCeilingCents: 8_100_000,
      openedAt: d('2026-03-10'),
      byMonth: new Array(12).fill(0),
    })
    expect(summary.ceiling).toBe(0)
    expect(summary.level).toBe('OK')
    expect(summary.pct).toBe(0)
    expect(summary.projection.willExceed).toBe(false)
  })
})
