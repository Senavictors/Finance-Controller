import { describe, expect, it } from 'vitest'
import {
  addMonthsClamped,
  buildInstallmentSchedule,
  MAX_INSTALLMENTS,
  splitAmountIntoInstallments,
} from './installments'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const isoDay = (date: Date) => date.toISOString().slice(0, 10)

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

describe('cards/domain/installments: split', () => {
  it('divide centavos de forma determinística, resto nas primeiras parcelas', () => {
    expect(splitAmountIntoInstallments(10_001, 3)).toEqual([3_334, 3_334, 3_333])
    expect(splitAmountIntoInstallments(10_000, 3)).toEqual([3_334, 3_333, 3_333])
  })

  it('a soma das parcelas é sempre o total (1x, 2x, 12x, 24x, não divisível)', () => {
    for (const [total, count] of [
      [10_001, 3],
      [99_999, 7],
      [4, 4],
      [123_456, 12],
      [100_000, 24],
      [5_000, 1],
      [10_000, 2],
      [10_000, 3],
    ] as const) {
      const parts = splitAmountIntoInstallments(total, count)
      expect(parts).toHaveLength(count)
      expect(parts.reduce((sum, value) => sum + value, 0)).toBe(total)
      expect(Math.min(...parts)).toBeGreaterThan(0)
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1)
    }
  })

  it('uma parcela devolve o valor total', () => {
    expect(splitAmountIntoInstallments(5_000, 1)).toEqual([5_000])
  })

  it('rejeita valor menor que o número de parcelas (INSTALLMENT_TOO_SMALL)', () => {
    expect(errorCode(() => splitAmountIntoInstallments(2, 3))).toBe('INSTALLMENT_TOO_SMALL')
    expect(errorCode(() => splitAmountIntoInstallments(3, 3))).toBeUndefined()
  })

  it('rejeita contagem inválida e valores não positivos/inteiros', () => {
    expect(errorCode(() => splitAmountIntoInstallments(1000, 0))).toBe('INVALID_INSTALLMENT_COUNT')
    expect(errorCode(() => splitAmountIntoInstallments(1000, MAX_INSTALLMENTS + 1))).toBe(
      'INVALID_INSTALLMENT_COUNT',
    )
    expect(errorCode(() => splitAmountIntoInstallments(1000, 2.5))).toBe(
      'INVALID_INSTALLMENT_COUNT',
    )
    expect(errorCode(() => splitAmountIntoInstallments(0, 1))).toBe('INVALID_AMOUNT')
    expect(errorCode(() => splitAmountIntoInstallments(-100, 1))).toBe('INVALID_AMOUNT')
    expect(errorCode(() => splitAmountIntoInstallments(10.5, 1))).toBe('INVALID_AMOUNT')
  })

  it('MAX_INSTALLMENTS é 24 (RN-10) e 24x é aceito', () => {
    expect(MAX_INSTALLMENTS).toBe(24)
    expect(splitAmountIntoInstallments(240_000, 24)).toHaveLength(24)
  })
})

describe('cards/domain/installments: cronograma', () => {
  it('uma parcela: uma única data (a da compra)', () => {
    expect(buildInstallmentSchedule(5_000, 1, day('2026-10-05'))).toEqual([
      { installmentNumber: 1, amount: 5_000, date: day('2026-10-05') },
    ])
  })

  it('avança um mês por parcela e vira o ano', () => {
    const schedule = buildInstallmentSchedule(30_000, 4, day('2026-11-10'))
    expect(schedule.map((item) => isoDay(item.date))).toEqual([
      '2026-11-10',
      '2026-12-10',
      '2027-01-10',
      '2027-02-10',
    ])
    expect(schedule.map((item) => item.installmentNumber)).toEqual([1, 2, 3, 4])
  })

  it('CA-02: R$ 300,00 em 3x a partir de 2026-01-31 => 31/01, 28/02, 31/03 (e 30/04 na 4a)', () => {
    const three = buildInstallmentSchedule(30_000, 3, day('2026-01-31'))
    expect(three.map((item) => isoDay(item.date))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ])
    expect(three.map((item) => item.amount)).toEqual([10_000, 10_000, 10_000])

    const four = buildInstallmentSchedule(30_000, 4, day('2026-01-31'))
    expect(four[3]!.date).toEqual(day('2026-04-30'))
  })

  it('CA-02: ano bissexto: 2028-01-31 => segunda parcela em 2028-02-29', () => {
    const schedule = buildInstallmentSchedule(30_000, 3, day('2028-01-31'))
    expect(schedule.map((item) => isoDay(item.date))).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
    ])
  })

  it('dia 30 e dia 29 em fevereiro (comum e bissexto)', () => {
    expect(
      buildInstallmentSchedule(30_000, 3, day('2026-01-30')).map((item) => isoDay(item.date)),
    ).toEqual(['2026-01-30', '2026-02-28', '2026-03-30'])
    expect(
      buildInstallmentSchedule(30_000, 3, day('2026-01-29')).map((item) => isoDay(item.date)),
    ).toEqual(['2026-01-29', '2026-02-28', '2026-03-29'])
    expect(
      buildInstallmentSchedule(30_000, 3, day('2028-01-29')).map((item) => isoDay(item.date)),
    ).toEqual(['2028-01-29', '2028-02-29', '2028-03-29'])
  })

  it('compra em 31/12 vira o ano com o dia limitado (31/12, 31/01, 28/02)', () => {
    expect(
      buildInstallmentSchedule(30_000, 3, day('2026-12-31')).map((item) => isoDay(item.date)),
    ).toEqual(['2026-12-31', '2027-01-31', '2027-02-28'])
  })

  it('a âncora é a data da compra: 24x não acumula clamp (31/01 => 31/01 dois anos depois)', () => {
    const schedule = buildInstallmentSchedule(240_000, 24, day('2026-01-31'))
    expect(isoDay(schedule[1]!.date)).toBe('2026-02-28')
    expect(isoDay(schedule[2]!.date)).toBe('2026-03-31')
    expect(isoDay(schedule[13]!.date)).toBe('2027-02-28')
    expect(isoDay(schedule[23]!.date)).toBe('2027-12-31')
  })

  it('todas as datas são meio-dia UTC e independem do fuso do processo', () => {
    for (const item of buildInstallmentSchedule(30_000, 3, day('2026-03-31'))) {
      expect(item.date.getUTCHours()).toBe(12)
      expect(item.date.getUTCMinutes()).toBe(0)
    }
  })

  it('data de entrada com horário usa o dia de calendário UTC', () => {
    const schedule = buildInstallmentSchedule(2_000, 2, new Date('2026-05-10T20:30:00.000Z'))
    expect(schedule[0]!.date).toEqual(day('2026-05-10'))
    expect(schedule[1]!.date).toEqual(day('2026-06-10'))
  })

  it('rejeita data inválida', () => {
    expect(errorCode(() => buildInstallmentSchedule(1000, 1, new Date('invalid')))).toBe(
      'INVALID_DATE',
    )
  })
})

describe('cards/domain/installments: addMonthsClamped', () => {
  it('limita o dia ao último dia do mês de destino', () => {
    expect(addMonthsClamped(day('2026-01-31'), 1)).toEqual(day('2026-02-28'))
    expect(addMonthsClamped(day('2028-01-31'), 1)).toEqual(day('2028-02-29'))
    expect(addMonthsClamped(day('2026-01-30'), 1)).toEqual(day('2026-02-28'))
    expect(addMonthsClamped(day('2026-03-31'), 1)).toEqual(day('2026-04-30'))
    expect(addMonthsClamped(day('2026-08-31'), 6)).toEqual(day('2027-02-28'))
  })

  it('n = 0 mantém e n negativo volta no tempo', () => {
    expect(addMonthsClamped(day('2026-05-31'), 0)).toEqual(day('2026-05-31'))
    expect(addMonthsClamped(day('2026-03-31'), -1)).toEqual(day('2026-02-28'))
    expect(addMonthsClamped(day('2026-01-15'), -2)).toEqual(day('2025-11-15'))
  })
})
