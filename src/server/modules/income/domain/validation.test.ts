import { describe, expect, it } from 'vitest'
import { IncomeError } from './errors'
import {
  normalizeAttendanceOverrides,
  normalizeIncomeRuleInput,
  normalizeMeiProfileInput,
  type IncomeRuleInput,
} from './validation'

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`)
const VALID: IncomeRuleInput = {
  name: 'Renda mensal',
  baseCents: 300_000,
  perDayCents: 4_000,
  weekdays: [4, 2, 3],
  payDay: 15,
  destinationAccountId: 'acc-pj',
  startDate: d('2026-01-01'),
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof IncomeError) return `${error.code}:${String(error.details?.field)}`
    throw error
  }
  return undefined
}

describe('normalizeIncomeRuleInput', () => {
  it('normaliza: ordena weekdays, aplica padrões e remove duplicatas de extraDaysOff', () => {
    const result = normalizeIncomeRuleInput({
      ...VALID,
      name: '  Renda mensal  ',
      extraDaysOff: ['2026-02-17', '2026-02-17', '2026-01-02'],
    })
    expect(result.name).toBe('Renda mensal')
    expect(result.weekdays).toEqual([2, 3, 4])
    expect(result.paymentAdjust).toBe('NEXT_BUSINESS_DAY')
    expect(result.additionalBasis).toBe('PREVIOUS_MONTH')
    expect(result.extraDaysOff).toEqual(['2026-01-02', '2026-02-17'])
    expect(result.endDate).toBeNull()
  })

  it.each([
    [{ weekdays: [7] }, 'weekdays'],
    [{ weekdays: [-1] }, 'weekdays'],
    [{ weekdays: [1, 1] }, 'weekdays'],
    [{ weekdays: [1.5] }, 'weekdays'],
    [{ payDay: 0 }, 'payDay'],
    [{ payDay: 32 }, 'payDay'],
    [{ payDay: 1.5 }, 'payDay'],
    [{ baseCents: -1 }, 'baseCents'],
    [{ baseCents: 10.5 }, 'baseCents'],
    [{ perDayCents: -1 }, 'perDayCents'],
    [{ name: '   ' }, 'name'],
    [{ extraDaysOff: ['2026-02-30'] }, 'extraDaysOff'],
    [{ extraDaysOff: ['17/02/2026'] }, 'extraDaysOff'],
    [{ destinationAccountId: '' }, 'destinationAccountId'],
    [{ endDate: d('2025-12-31') }, 'endDate'],
    [{ startDate: new Date('2026-01-01T03:00:00.000Z') }, 'startDate'],
    [{ attendanceOverrides: { '2026-13-01': true } }, 'attendanceOverrides'],
    [{ paymentAdjust: 'LATER' as never }, 'paymentAdjust'],
    [{ additionalBasis: 'NEVER' as never }, 'additionalBasis'],
  ])('rejeita %j (INCOME_INVALID_INPUT:%s)', (patch, field) => {
    expect(codeOf(() => normalizeIncomeRuleInput({ ...VALID, ...patch }))).toBe(
      `INCOME_INVALID_INPUT:${field}`,
    )
  })

  it('aceita weekdays vazio, base 0 e perDay 0', () => {
    const result = normalizeIncomeRuleInput({
      ...VALID,
      weekdays: [],
      baseCents: 0,
      perDayCents: 0,
    })
    expect(result.weekdays).toEqual([])
  })
})

describe('normalizeAttendanceOverrides', () => {
  it('ordena e valida', () => {
    expect(normalizeAttendanceOverrides({ '2026-10-14': true, '2026-10-02': false })).toEqual({
      '2026-10-02': false,
      '2026-10-14': true,
    })
    expect(codeOf(() => normalizeAttendanceOverrides({ '2026-10-14': 'sim' }))).toBe(
      'INCOME_INVALID_INPUT:attendanceOverrides',
    )
    expect(codeOf(() => normalizeAttendanceOverrides([]))).toBe(
      'INCOME_INVALID_INPUT:attendanceOverrides',
    )
  })
})

describe('normalizeMeiProfileInput', () => {
  it('padrões: teto informado pelo chamador e vencimento dia 20', () => {
    const result = normalizeMeiProfileInput({ dasAmountCents: 8_000 }, 8_100_000)
    expect(result).toMatchObject({
      annualCeilingCents: 8_100_000,
      dasDueDay: 20,
      dasAccountId: null,
      businessAccountId: null,
      openedAt: null,
    })
  })

  it('rejeita valores inválidos', () => {
    expect(codeOf(() => normalizeMeiProfileInput({ dasAmountCents: -1 }, 8_100_000))).toBe(
      'INCOME_INVALID_INPUT:dasAmountCents',
    )
    expect(
      codeOf(() => normalizeMeiProfileInput({ dasAmountCents: 1, dasDueDay: 0 }, 8_100_000)),
    ).toBe('INCOME_INVALID_INPUT:dasDueDay')
    expect(
      codeOf(() =>
        normalizeMeiProfileInput({ dasAmountCents: 1, annualCeilingCents: 0 }, 8_100_000),
      ),
    ).toBe('INCOME_INVALID_INPUT:annualCeilingCents')
    expect(
      codeOf(() =>
        normalizeMeiProfileInput(
          { dasAmountCents: 1, openedAt: new Date('2026-03-10T00:00:00.000Z') },
          8_100_000,
        ),
      ),
    ).toBe('INCOME_INVALID_INPUT:openedAt')
  })
})
