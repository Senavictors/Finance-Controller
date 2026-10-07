import { describe, expect, it } from 'vitest'
import { formatCalendarDate } from './calendar'
import { DebtError } from './errors'
import {
  buildAmortizationSchedule,
  exactPmt,
  impliedMonthlyRate,
  outstandingBalance,
  priceInstallment,
} from './price'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const FIRST = day('2026-11-05')

/** Fator de valor futuro de uma anuidade: ((1+i)^n - 1) / i (n se i = 0). */
function fvFactor(i: number, n: number): number {
  return i === 0 ? n : ((1 + i) ** n - 1) / i
}

describe('priceInstallment (CA-01)', () => {
  it('R$ 10.000,00 a 2% a.m. em 12x = R$ 945,60', () => {
    expect(priceInstallment({ principal: 1_000_000, monthlyRate: 0.02, installments: 12 })).toBe(
      94560,
    )
  })

  it('taxa zero divide o principal (arredondado)', () => {
    expect(priceInstallment({ principal: 1_000_000, monthlyRate: 0, installments: 12 })).toBe(83333)
  })

  it('1 parcela: PMT = P * (1 + i)', () => {
    expect(priceInstallment({ principal: 100_000, monthlyRate: 0.02, installments: 1 })).toBe(
      102_000,
    )
    expect(priceInstallment({ principal: 100_000, monthlyRate: 0, installments: 1 })).toBe(100_000)
  })

  it('confere com a fórmula fechada independente (planilha) para vários cenários', () => {
    // PMT = P*i / (1 - (1+i)^-n), calculado aqui por outro caminho (potência, não expm1).
    const cases = [
      { principal: 500_000, rate: 0.019, n: 24 },
      { principal: 2_000_000, rate: 0.0189, n: 48 },
      { principal: 123_400, rate: 0.07, n: 6 },
      { principal: 100, rate: 0.02, n: 3 },
    ]
    for (const { principal, rate, n } of cases) {
      const closed = (principal * rate) / (1 - (1 + rate) ** -n)
      expect(priceInstallment({ principal, monthlyRate: rate, installments: n })).toBe(
        Math.round(closed),
      )
    }
  })

  it('120 parcelas e valores grandes não perdem precisão', () => {
    const pmt = priceInstallment({ principal: 100_000_000, monthlyRate: 0.0199, installments: 120 })
    const closed = (100_000_000 * 0.0199) / (1 - 1.0199 ** -120)
    expect(pmt).toBe(Math.round(closed))
    expect(Number.isInteger(pmt)).toBe(true)
  })

  it('valida entradas', () => {
    expect(() => priceInstallment({ principal: -1, monthlyRate: 0.02, installments: 12 })).toThrow(
      DebtError,
    )
    expect(() =>
      priceInstallment({ principal: 10.5, monthlyRate: 0.02, installments: 12 }),
    ).toThrow(DebtError)
    expect(() =>
      priceInstallment({ principal: 100, monthlyRate: -0.01, installments: 12 }),
    ).toThrow(DebtError)
    expect(() => priceInstallment({ principal: 100, monthlyRate: 0.01, installments: 0 })).toThrow(
      DebtError,
    )
    expect(() =>
      priceInstallment({ principal: 100, monthlyRate: Number.NaN, installments: 3 }),
    ).toThrow(DebtError)
  })

  it('exactPmt é estável para taxa minúscula', () => {
    expect(exactPmt(1_200_000, 1e-12, 12)).toBeCloseTo(100_000, 3)
  })
})

describe('buildAmortizationSchedule (CA-02, CA-11)', () => {
  it('R$ 10.000,00 a 2% em 12x: juros e amortização da 1ª parcela, soma e saldo final', () => {
    const rows = buildAmortizationSchedule({
      principal: 1_000_000,
      monthlyRate: 0.02,
      installments: 12,
      firstDueDate: FIRST,
    })
    expect(rows).toHaveLength(12)
    expect(rows[0]).toMatchObject({
      number: 1,
      interest: 20_000,
      principal: 74_560,
      amount: 94_560,
    })
    expect(rows[0].balanceAfter).toBe(925_440)
    expect(rows.reduce((sum, row) => sum + row.principal, 0)).toBe(1_000_000)
    expect(rows[11].balanceAfter).toBe(0)
    // Só a última difere das demais (ajuste de resíduo <= 12 centavos).
    expect(rows.slice(0, 11).every((row) => row.amount === 94_560)).toBe(true)
    expect(Math.abs(rows[11].amount - 94_560)).toBeLessThanOrEqual(12)
    expect(rows[11].amount).not.toBe(94_560)
  })

  it('cada parcela: amount = principal + interest e juros = round(saldo anterior * i)', () => {
    const rows = buildAmortizationSchedule({
      principal: 750_000,
      monthlyRate: 0.0199,
      installments: 36,
      firstDueDate: FIRST,
    })
    let balance = 750_000
    for (const row of rows) {
      expect(row.interest).toBe(Math.round(balance * 0.0199))
      expect(row.amount).toBe(row.principal + row.interest)
      balance -= row.principal
      expect(row.balanceAfter).toBe(balance)
    }
    expect(balance).toBe(0)
  })

  it('trajetória do saldo bate com a fórmula fechada B_k = P(1+i)^k - PMT*((1+i)^k - 1)/i', () => {
    const principal = 1_000_000
    const i = 0.02
    const n = 12
    const rows = buildAmortizationSchedule({
      principal,
      monthlyRate: i,
      installments: n,
      firstDueDate: FIRST,
    })
    const pmt = exactPmt(principal, i, n)
    rows.forEach((row, index) => {
      const k = index + 1
      const closed = principal * (1 + i) ** k - pmt * fvFactor(i, k)
      // O arredondamento por parcela acumula no máximo ~fv(k) centavos.
      expect(Math.abs(row.balanceAfter - closed)).toBeLessThanOrEqual(fvFactor(i, k) + 1)
    })
  })

  it('invariantes por tabela: soma = principal, saldo final 0, resíduo da última limitado', () => {
    const principals = [100, 100_000, 1_000_000, 100_000_000]
    const rates = [0, 0.005, 0.019, 0.02, 0.07, 0.12]
    const counts = [1, 2, 3, 12, 60, 120]
    for (const principal of principals) {
      for (const monthlyRate of rates) {
        for (const installments of counts) {
          const rows = buildAmortizationSchedule({
            principal,
            monthlyRate,
            installments,
            firstDueDate: FIRST,
          })
          expect(rows).toHaveLength(installments)
          expect(rows.reduce((sum, row) => sum + row.principal, 0)).toBe(principal)
          expect(rows[installments - 1].balanceAfter).toBe(0)
          expect(rows.every((row) => row.balanceAfter >= 0 && row.principal >= 0)).toBe(true)
          if (installments > 1) {
            const pmt = rows[0].amount
            const bound = Math.ceil(fvFactor(monthlyRate, installments)) + 1
            expect(Math.abs(rows[installments - 1].amount - pmt)).toBeLessThanOrEqual(bound)
          }
        }
      }
    }
  })

  it('principal pequeno (R$ 1,00 em 3x) e principal 0', () => {
    const small = buildAmortizationSchedule({
      principal: 100,
      monthlyRate: 0.02,
      installments: 3,
      firstDueDate: FIRST,
    })
    expect(small.map((row) => row.principal)).toEqual([33, 34, 33])
    expect(small.reduce((sum, row) => sum + row.principal, 0)).toBe(100)
    const zero = buildAmortizationSchedule({
      principal: 0,
      monthlyRate: 0.02,
      installments: 3,
      firstDueDate: FIRST,
    })
    expect(zero.every((row) => row.amount === 0)).toBe(true)
  })

  it('PMT calculado que arredonda para cima não deixa saldo negativo (principal minúsculo)', () => {
    const rows = buildAmortizationSchedule({
      principal: 15,
      monthlyRate: 0,
      installments: 10,
      firstDueDate: FIRST,
    })
    expect(rows.reduce((sum, row) => sum + row.principal, 0)).toBe(15)
    expect(rows.every((row) => row.balanceAfter >= 0)).toBe(true)
  })

  it('datas mensais com meio-dia UTC e virada de ano (CA-10)', () => {
    const rows = buildAmortizationSchedule({
      principal: 1_000_000,
      monthlyRate: 0.02,
      installments: 12,
      firstDueDate: FIRST,
    })
    expect(formatCalendarDate(rows[0].dueDate)).toBe('2026-11-05')
    expect(formatCalendarDate(rows[2].dueDate)).toBe('2027-01-05')
    expect(formatCalendarDate(rows[11].dueDate)).toBe('2027-10-05')
    expect(rows.every((row) => row.dueDate.toISOString().endsWith('T12:00:00.000Z'))).toBe(true)
  })

  it('CA-11: dia 31 vira 28/fev, volta a 31/mar e a 30/abr (sem acumular o clamp)', () => {
    const rows = buildAmortizationSchedule({
      principal: 300_000,
      monthlyRate: 0.01,
      installments: 4,
      firstDueDate: day('2026-01-31'),
    })
    expect(rows.map((row) => formatCalendarDate(row.dueDate))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('dias 29 e 30 em ano bissexto', () => {
    const rows = buildAmortizationSchedule({
      principal: 300_000,
      monthlyRate: 0.01,
      installments: 3,
      firstDueDate: day('2028-01-29'),
    })
    expect(rows.map((row) => formatCalendarDate(row.dueDate))).toEqual([
      '2028-01-29',
      '2028-02-29',
      '2028-03-29',
    ])
  })

  it('parcela real do contrato prevalece e a última ajusta o resíduo (RN-03)', () => {
    const rows = buildAmortizationSchedule({
      principal: 1_000_000,
      monthlyRate: 0.02,
      installments: 12,
      firstDueDate: FIRST,
      installmentAmount: 94_560,
    })
    expect(rows[0].amount).toBe(94_560)
    expect(rows[11].balanceAfter).toBe(0)
    expect(rows.reduce((sum, row) => sum + row.principal, 0)).toBe(1_000_000)
  })

  it('parcela informada que não cobre os juros ou quita antes do fim é inconsistente', () => {
    expect(() =>
      buildAmortizationSchedule({
        principal: 1_000_000,
        monthlyRate: 0.02,
        installments: 12,
        firstDueDate: FIRST,
        installmentAmount: 10_000,
      }),
    ).toThrow(DebtError)
    expect(() =>
      buildAmortizationSchedule({
        principal: 1_000_000,
        monthlyRate: 0.02,
        installments: 12,
        firstDueDate: FIRST,
        installmentAmount: 900_000,
      }),
    ).toThrow(/incompat/)
  })
})

describe('impliedMonthlyRate (CA-03)', () => {
  it('1.000.000, parcela 94560, 12x => ~0,02 (erro < 1e-6)', () => {
    const rate = impliedMonthlyRate({
      principal: 1_000_000,
      installmentAmount: 94_560,
      installments: 12,
    })
    expect(rate).toBeGreaterThanOrEqual(0.019999)
    expect(rate).toBeLessThanOrEqual(0.020001)
  })

  it('parcela x n <= principal => 0; principal 0 => 0', () => {
    expect(
      impliedMonthlyRate({ principal: 1_200_000, installmentAmount: 100_000, installments: 12 }),
    ).toBe(0)
    expect(
      impliedMonthlyRate({ principal: 1_200_001, installmentAmount: 100_000, installments: 12 }),
    ).toBe(0)
    expect(impliedMonthlyRate({ principal: 0, installmentAmount: 100_000, installments: 12 })).toBe(
      0,
    )
  })

  it('ida e volta rate -> PMT -> rate para taxas típicas', () => {
    for (const rate of [0.005, 0.019, 0.02, 0.07, 0.12]) {
      for (const installments of [6, 12, 48, 96]) {
        const principal = 5_000_000
        const pmt = priceInstallment({ principal, monthlyRate: rate, installments })
        const implied = impliedMonthlyRate({ principal, installmentAmount: pmt, installments })
        // Erro de 0,5 centavo na parcela, convertido em taxa: < 1e-6 com principal alto.
        expect(Math.abs(implied - rate)).toBeLessThan(1e-6)
      }
    }
  })

  it('o PMT da taxa inferida reproduz a parcela informada (ao centavo)', () => {
    const implied = impliedMonthlyRate({
      principal: 1_000_000,
      installmentAmount: 94_560,
      installments: 12,
    })
    expect(priceInstallment({ principal: 1_000_000, monthlyRate: implied, installments: 12 })).toBe(
      94_560,
    )
  })

  it('taxa acima de 100% a.m. (1 parcela cara) é encontrada expandindo o intervalo', () => {
    const implied = impliedMonthlyRate({
      principal: 100_000,
      installmentAmount: 300_000,
      installments: 1,
    })
    expect(implied).toBeCloseTo(2, 6)
  })

  it('valida entradas', () => {
    expect(() =>
      impliedMonthlyRate({ principal: -1, installmentAmount: 1, installments: 1 }),
    ).toThrow(DebtError)
    expect(() =>
      impliedMonthlyRate({ principal: 1, installmentAmount: 1, installments: 0 }),
    ).toThrow(DebtError)
  })
})

describe('outstandingBalance', () => {
  const schedule = buildAmortizationSchedule({
    principal: 1_000_000,
    monthlyRate: 0.02,
    installments: 12,
    firstDueDate: FIRST,
  })

  it('0 pagas = principal; k pagas = saldo da parcela k; todas = 0', () => {
    expect(outstandingBalance(schedule, 0)).toBe(1_000_000)
    expect(outstandingBalance(schedule, 1)).toBe(925_440)
    expect(outstandingBalance(schedule, 3)).toBe(schedule[2].balanceAfter)
    expect(outstandingBalance(schedule, 12)).toBe(0)
    expect(outstandingBalance(schedule, 99)).toBe(0)
  })

  it('cronograma vazio e paidCount inválido', () => {
    expect(outstandingBalance([], 0)).toBe(0)
    expect(() => outstandingBalance(schedule, -1)).toThrow(DebtError)
    expect(() => outstandingBalance(schedule, 1.5)).toThrow(DebtError)
  })
})
