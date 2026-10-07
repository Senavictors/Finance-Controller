import type { AttendanceOverrides, BusinessDayRule } from './calendar'
import { isValidIso } from './dates'
import { IncomeError } from './errors'
import type { AdditionalBasis } from './income-rule'

/** Limite de valores monetários (centavos), alinhado ao ledger. */
export const MAX_CENTS = 2_000_000_000

export const BUSINESS_DAY_RULES: readonly BusinessDayRule[] = [
  'NONE',
  'NEXT_BUSINESS_DAY',
  'PREVIOUS_BUSINESS_DAY',
]
export const ADDITIONAL_BASES: readonly AdditionalBasis[] = ['PREVIOUS_MONTH', 'SAME_MONTH']

export interface IncomeRuleInput {
  name: string
  baseCents: number
  perDayCents: number
  weekdays: readonly number[]
  payDay: number
  paymentAdjust?: BusinessDayRule
  additionalBasis?: AdditionalBasis
  destinationAccountId: string
  extraDaysOff?: readonly string[]
  attendanceOverrides?: AttendanceOverrides
  /** Meio-dia UTC. */
  startDate: Date
  /** Meio-dia UTC; `null`/omitido = sem fim. */
  endDate?: Date | null
}

export interface NormalizedIncomeRuleInput {
  name: string
  baseCents: number
  perDayCents: number
  weekdays: number[]
  payDay: number
  paymentAdjust: BusinessDayRule
  additionalBasis: AdditionalBasis
  destinationAccountId: string
  extraDaysOff: string[]
  attendanceOverrides: Record<string, boolean>
  startDate: Date
  endDate: Date | null
}

function invalid(field: string, message: string): never {
  throw new IncomeError('INCOME_INVALID_INPUT', message, { field })
}

function assertCents(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    invalid(field, `${field} deve ser um inteiro em centavos.`)
  }
  if (value < 0) invalid(field, `${field} não pode ser negativo.`)
  if (value > MAX_CENTS) invalid(field, `${field} excede o limite permitido.`)
  return value
}

/** Data de calendário: `Date` válida ancorada ao meio-dia UTC (ADR-002). */
export function assertCalendarDate(value: unknown, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    invalid(field, `${field} inválida.`)
  }
  const iso = value.toISOString()
  if (!iso.endsWith('T12:00:00.000Z')) {
    invalid(field, `${field} deve ser uma data de calendário ao meio-dia UTC.`)
  }
  return value
}

export function assertDayOfMonth(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 31) {
    invalid(field, `${field} deve ser um inteiro de 1 a 31.`)
  }
  return value
}

/** Valida e normaliza a entrada de uma regra de renda (domínio autoritativo; Zod é só a borda). */
export function normalizeIncomeRuleInput(input: IncomeRuleInput): NormalizedIncomeRuleInput {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length === 0 || name.length > 80) invalid('name', 'name deve ter de 1 a 80 caracteres.')

  const baseCents = assertCents(input.baseCents, 'baseCents')
  const perDayCents = assertCents(input.perDayCents, 'perDayCents')
  const payDay = assertDayOfMonth(input.payDay, 'payDay')

  if (!Array.isArray(input.weekdays)) invalid('weekdays', 'weekdays deve ser uma lista.')
  const weekdays = [...input.weekdays]
  for (const d of weekdays) {
    if (!Number.isInteger(d) || d < 0 || d > 6) invalid('weekdays', 'weekdays aceita só 0 a 6.')
  }
  if (new Set(weekdays).size !== weekdays.length) invalid('weekdays', 'weekdays tem repetição.')
  weekdays.sort((a, b) => a - b)

  const paymentAdjust = input.paymentAdjust ?? 'NEXT_BUSINESS_DAY'
  if (!BUSINESS_DAY_RULES.includes(paymentAdjust)) {
    invalid('paymentAdjust', 'paymentAdjust inválido.')
  }
  const additionalBasis = input.additionalBasis ?? 'PREVIOUS_MONTH'
  if (!ADDITIONAL_BASES.includes(additionalBasis)) {
    invalid('additionalBasis', 'additionalBasis inválido.')
  }

  if (typeof input.destinationAccountId !== 'string' || input.destinationAccountId === '') {
    invalid('destinationAccountId', 'destinationAccountId é obrigatório.')
  }

  const extraDaysOff = [...(input.extraDaysOff ?? [])]
  for (const iso of extraDaysOff) {
    if (typeof iso !== 'string' || !isValidIso(iso)) {
      invalid('extraDaysOff', `extraDaysOff com data inválida: ${String(iso)}.`)
    }
  }

  const attendanceOverrides = normalizeAttendanceOverrides(input.attendanceOverrides ?? {})

  const startDate = assertCalendarDate(input.startDate, 'startDate')
  const endDate = input.endDate == null ? null : assertCalendarDate(input.endDate, 'endDate')
  if (endDate !== null && endDate.getTime() < startDate.getTime()) {
    invalid('endDate', 'endDate não pode ser anterior a startDate.')
  }

  return {
    name,
    baseCents,
    perDayCents,
    weekdays,
    payDay,
    paymentAdjust,
    additionalBasis,
    destinationAccountId: input.destinationAccountId,
    extraDaysOff: [...new Set(extraDaysOff)].sort(),
    attendanceOverrides,
    startDate,
    endDate,
  }
}

export function normalizeAttendanceOverrides(raw: unknown): Record<string, boolean> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    invalid('attendanceOverrides', 'attendanceOverrides deve ser um mapa data -> boolean.')
  }
  const result: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidIso(key)) invalid('attendanceOverrides', `Data inválida em overrides: ${key}.`)
    if (typeof value !== 'boolean') invalid('attendanceOverrides', 'Valores devem ser boolean.')
    result[key] = value
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => (a < b ? -1 : 1)))
}

export interface MeiProfileInput {
  /** Meio-dia UTC ou `null`. */
  openedAt?: Date | null
  annualCeilingCents?: number
  dasAmountCents: number
  dasDueDay?: number
  dasAccountId?: string | null
  businessAccountId?: string | null
}

export interface NormalizedMeiProfileInput {
  openedAt: Date | null
  annualCeilingCents: number
  dasAmountCents: number
  dasDueDay: number
  dasAccountId: string | null
  businessAccountId: string | null
}

export const DEFAULT_DAS_DUE_DAY = 20

export function normalizeMeiProfileInput(
  input: MeiProfileInput,
  defaultCeilingCents: number,
): NormalizedMeiProfileInput {
  const annualCeilingCents = input.annualCeilingCents ?? defaultCeilingCents
  if (
    typeof annualCeilingCents !== 'number' ||
    !Number.isInteger(annualCeilingCents) ||
    annualCeilingCents <= 0 ||
    annualCeilingCents > MAX_CENTS
  ) {
    invalid('annualCeilingCents', 'annualCeilingCents deve ser um inteiro positivo em centavos.')
  }
  return {
    openedAt: input.openedAt == null ? null : assertCalendarDate(input.openedAt, 'openedAt'),
    annualCeilingCents,
    dasAmountCents: assertCents(input.dasAmountCents, 'dasAmountCents'),
    dasDueDay: assertDayOfMonth(input.dasDueDay ?? DEFAULT_DAS_DUE_DAY, 'dasDueDay'),
    dasAccountId: input.dasAccountId ?? null,
    businessAccountId: input.businessAccountId ?? null,
  }
}
