import { describe, expect, it } from 'vitest'
import { addDays, calendarDayInZone, utcNoon } from './calendar'
import { buildInstallmentSchedule, splitAmountIntoInstallments } from './installments'
import { overdraftWarning, suggestPaymentAccount } from './payment'
import { getStatementCycle, getStatementCycleByKey } from './statement-cycle'
import { getStatementStatus } from './statement-status'
import { computeStatementTotals } from './statement-totals'

/**
 * Revisão QA da FC2-F1-03: casos independentes dos escritos pelo implementador (dinheiro,
 * datas 29/30/31, virada de ano, fuso). Dados 100% sintéticos.
 */
const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const iso = (date: Date) => date.toISOString().slice(0, 10)

describe('QA: ciclo da fatura', () => {
  it.each([
    // [closing, due, compra, fecha, vence, chave]
    [5, 12, '2026-10-05', '2026-10-05', '2026-10-12', '2026-10'],
    [5, 12, '2026-10-06', '2026-11-05', '2026-11-12', '2026-11'],
    [5, 12, '2026-10-04', '2026-10-05', '2026-10-12', '2026-10'],
    [28, 5, '2026-10-28', '2026-10-28', '2026-11-05', '2026-11'],
    [28, 5, '2026-10-29', '2026-11-28', '2026-12-05', '2026-12'],
    [31, 5, '2026-02-28', '2026-02-28', '2026-03-05', '2026-03'],
    [31, 5, '2028-02-28', '2028-02-29', '2028-03-05', '2028-03'],
    [31, 5, '2026-03-01', '2026-03-31', '2026-04-05', '2026-04'],
    [31, 5, '2026-04-30', '2026-04-30', '2026-05-05', '2026-05'],
    [31, 5, '2026-05-01', '2026-05-31', '2026-06-05', '2026-06'],
    [10, 17, '2026-12-20', '2027-01-10', '2027-01-17', '2027-01'],
    [28, 5, '2026-12-29', '2027-01-28', '2027-02-05', '2027-02'],
    [10, 5, '2026-12-31', '2027-01-10', '2027-02-05', '2027-02'],
  ])('fecha %i vence %i, compra %s => fecha %s, vence %s, chave %s', (c, v, p, f, due, key) => {
    const cycle = getStatementCycle({ purchaseDate: d(p), closingDay: c, dueDay: v })
    expect(iso(cycle.closingDate)).toBe(f)
    expect(iso(cycle.dueDate)).toBe(due)
    expect(cycle.statementKey).toBe(key)
    expect(cycle.closingDate.getUTCHours()).toBe(12)
    // round-trip pela chave
    const byKey = getStatementCycleByKey({ statementKey: key, closingDay: c, dueDay: v })
    expect(iso(byKey.closingDate)).toBe(f)
    expect(iso(byKey.dueDate)).toBe(due)
  })

  it('varredura: toda data de 3 anos cai num ciclo que a contém, ciclos contíguos e chaves únicas', () => {
    const anomalies: string[] = []
    for (let closing = 1; closing <= 31; closing++) {
      for (const due of [1, 5, 10, 17, 28, 29, 30, 31]) {
        const byKey = new Map<string, string>()
        let previousClosing: Date | null = null
        for (let day = d('2027-01-01'); day < d('2029-01-01'); day = addDays(day, 1)) {
          const cycle = getStatementCycle({ purchaseDate: day, closingDay: closing, dueDay: due })
          if (day < cycle.periodStart || day > cycle.periodEnd) {
            anomalies.push(`${closing}/${due} ${iso(day)} fora do ciclo`)
          }
          const seen = byKey.get(cycle.statementKey)
          if (seen && seen !== iso(cycle.closingDate)) {
            anomalies.push(`${closing}/${due} chave ${cycle.statementKey} em dois ciclos`)
          }
          byKey.set(cycle.statementKey, iso(cycle.closingDate))
          if (previousClosing && cycle.closingDate.getTime() !== previousClosing.getTime()) {
            // novo ciclo: começa exatamente no dia seguinte ao fechamento anterior
            if (iso(cycle.periodStart) !== iso(addDays(previousClosing, 1))) {
              anomalies.push(`${closing}/${due} ciclo não contíguo em ${iso(day)}`)
            }
          }
          previousClosing = cycle.closingDate
          if (cycle.dueDate.getTime() < cycle.closingDate.getTime()) {
            anomalies.push(`${closing}/${due} vence antes de fechar em ${iso(cycle.closingDate)}`)
          }
        }
      }
    }
    expect([...new Set(anomalies)]).toEqual([])
  }, 60_000)
})

describe('QA: parcelas', () => {
  it.each([
    [10000, 3, [3334, 3333, 3333]],
    [30000, 3, [10000, 10000, 10000]],
    [100001, 12, [8334, 8334, 8334, 8334, 8334, 8333, 8333, 8333, 8333, 8333, 8333, 8333]],
  ])('divide %i em %ix e preserva o total', (total, n, expected) => {
    const parts = splitAmountIntoInstallments(total, n)
    expect(parts).toEqual(expected)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
  })

  it('12x a partir de 31/01 usa a data da compra como âncora (sem acumular clamp)', () => {
    const schedule = buildInstallmentSchedule(123457, 12, d('2026-01-31'))
    expect(schedule.map((s) => iso(s.date))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ])
    expect(schedule.reduce((a, s) => a + s.amount, 0)).toBe(123457)
  })

  it('dia 30 e 29 em fevereiro e virada de ano', () => {
    expect(buildInstallmentSchedule(3000, 3, d('2026-01-30')).map((s) => iso(s.date))).toEqual([
      '2026-01-30',
      '2026-02-28',
      '2026-03-30',
    ])
    expect(buildInstallmentSchedule(3000, 3, d('2028-01-29')).map((s) => iso(s.date))).toEqual([
      '2028-01-29',
      '2028-02-29',
      '2028-03-29',
    ])
    expect(buildInstallmentSchedule(3000, 3, d('2026-12-31')).map((s) => iso(s.date))).toEqual([
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
    ])
  })

  it('rejeita valor menor que parcelas, 25 parcelas, valor fracionado e zero', () => {
    expect(() => splitAmountIntoInstallments(2, 3)).toThrow()
    expect(() => splitAmountIntoInstallments(10000, 25)).toThrow()
    expect(() => splitAmountIntoInstallments(100.5, 2)).toThrow()
    expect(() => splitAmountIntoInstallments(0, 1)).toThrow()
    expect(splitAmountIntoInstallments(3, 3)).toEqual([1, 1, 1])
  })
})

describe('QA: status com `now` injetado (fuso America/Sao_Paulo)', () => {
  const base = { closingDate: d('2026-10-10'), dueDate: d('2026-10-17') }
  it('no dia do fechamento ainda é OPEN; 22h59 em SP do dia 10 (UTC já dia 11) continua OPEN', () => {
    const status = (now: string) =>
      getStatementStatus({ ...base, totalAmount: 10000, paidAmount: 0, now: new Date(now) })
    expect(status('2026-10-10T15:00:00Z')).toBe('OPEN')
    expect(status('2026-10-11T01:59:00Z')).toBe('OPEN')
    expect(status('2026-10-11T03:00:00Z')).toBe('CLOSED')
    expect(status('2026-10-17T15:00:00Z')).toBe('CLOSED')
    expect(status('2026-10-18T03:00:00Z')).toBe('OVERDUE')
  })
  it('quitada => PAID; total <= 0: aberta OPEN, fechada PAID', () => {
    const at = (total: number, paid: number, now: string) =>
      getStatementStatus({ ...base, totalAmount: total, paidAmount: paid, now: new Date(now) })
    expect(at(10000, 10000, '2026-10-20T15:00:00Z')).toBe('PAID')
    expect(at(-5000, 0, '2026-10-05T15:00:00Z')).toBe('OPEN')
    expect(at(-5000, 0, '2026-10-12T15:00:00Z')).toBe('PAID')
    expect(at(10000, 9999, '2026-10-20T15:00:00Z')).toBe('OVERDUE')
  })
  it('calendarDayInZone usa o dia de São Paulo', () => {
    expect(iso(calendarDayInZone(new Date('2026-10-06T01:00:00Z')))).toBe('2026-10-05')
    expect(calendarDayInZone(new Date('2026-10-06T01:00:00Z')).getTime()).toBe(
      utcNoon(2026, 9, 5).getTime(),
    )
  })
})

describe('QA: totais, estorno e pagamento', () => {
  it('estorno abate; excedente vira creditBalance; pagamento parcial', () => {
    const base = [{ kind: 'EXPENSE' as const, amount: -50000 }]
    expect(computeStatementTotals([...base, { kind: 'INCOME', amount: 12000 }])).toMatchObject({
      net: 38000,
      open: 38000,
      creditBalance: 0,
    })
    expect(computeStatementTotals([...base, { kind: 'INCOME', amount: 60000 }])).toMatchObject({
      net: -10000,
      open: 0,
      creditBalance: 10000,
    })
    expect(
      computeStatementTotals([
        ...base,
        { kind: 'INCOME', amount: 12000 },
        { kind: 'CARD_PAYMENT', amount: 20000 },
      ]),
    ).toMatchObject({ net: 38000, paid: 20000, open: 18000 })
  })
  it('perna negativa do pagamento e TRANSFER não entram na fatura', () => {
    const t = computeStatementTotals([
      { kind: 'EXPENSE', amount: -1000 },
      { kind: 'CARD_PAYMENT', amount: -500 },
      { kind: 'TRANSFER', amount: 700 },
    ])
    expect(t).toMatchObject({ net: 1000, paid: 0, open: 1000 })
  })
  it('overdraftWarning (CA-06) e suggestPaymentAccount (CA-07)', () => {
    expect(overdraftWarning({ current: 10000, overdraftLimit: 50000 }, 30000)).toEqual({
      willUseOverdraft: true,
      usedAfter: 20000,
      excessAfter: 0,
    })
    expect(overdraftWarning({ current: 10000, overdraftLimit: 0 }, 10000)).toEqual({
      willUseOverdraft: false,
      usedAfter: 0,
      excessAfter: 0,
    })
    expect(overdraftWarning({ current: 0, overdraftLimit: 10000 }, 25000)).toEqual({
      willUseOverdraft: true,
      usedAfter: 10000,
      excessAfter: 15000,
    })
    const acc = (
      id: string,
      type: string,
      current: number,
      overdraftLimit = 0,
      archived = false,
    ) => ({
      id,
      type,
      current,
      overdraftLimit,
      isArchived: archived,
    })
    expect(
      suggestPaymentAccount([
        acc('a', 'CHECKING', 10000),
        acc('b', 'SAVINGS', 5000, 20000),
        acc('c', 'CREDIT_CARD', 999999),
        acc('d', 'CHECKING', 999999, 0, true),
      ])?.id,
    ).toBe('b')
    expect(suggestPaymentAccount([acc('c', 'CREDIT_CARD', 1)])).toBeNull()
    expect(suggestPaymentAccount([])).toBeNull()
  })
})
