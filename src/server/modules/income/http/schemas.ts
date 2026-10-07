import { z } from 'zod'
import { localDateSchema } from '@/lib/dates'

/**
 * Entradas das rotas de renda MEI (Zod 4). Dinheiro em centavos inteiros; datas `YYYY-MM-DD`
 * estritas convertidas para meio-dia UTC (ADR-002). A validação autoritativa continua no
 * domínio (`normalizeIncomeRuleInput`): este é só o contrato da borda.
 */

const cents = z.number().int().min(0).max(2_000_000_000)
const dayOfMonth = z.number().int().min(1).max(31)
const weekdays = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .refine((list) => new Set(list).size === list.length, 'weekdays com valores repetidos')
const isoDate = localDateSchema('Data inválida (use AAAA-MM-DD)')
const businessDayRule = z.enum(['NONE', 'NEXT_BUSINESS_DAY', 'PREVIOUS_BUSINESS_DAY'])
const additionalBasis = z.enum(['PREVIOUS_MONTH', 'SAME_MONTH'])
const isoString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)')

const ruleFields = {
  name: z.string().trim().min(1).max(80),
  baseCents: cents,
  perDayCents: cents,
  weekdays,
  payDay: dayOfMonth,
  paymentAdjust: businessDayRule,
  additionalBasis,
  destinationAccountId: z.string().min(1),
  extraDaysOff: z.array(isoString).max(400),
  attendanceOverrides: z.record(isoString, z.boolean()),
  startDate: isoDate,
  endDate: isoDate.nullable(),
}

export const createIncomeRuleSchema = z
  .object({
    name: ruleFields.name,
    baseCents: ruleFields.baseCents,
    perDayCents: ruleFields.perDayCents,
    weekdays: ruleFields.weekdays,
    payDay: ruleFields.payDay,
    paymentAdjust: ruleFields.paymentAdjust.optional(),
    additionalBasis: ruleFields.additionalBasis.optional(),
    destinationAccountId: ruleFields.destinationAccountId,
    extraDaysOff: ruleFields.extraDaysOff.optional(),
    attendanceOverrides: ruleFields.attendanceOverrides.optional(),
    startDate: ruleFields.startDate,
    endDate: ruleFields.endDate.optional(),
  })
  .strict()

export const updateIncomeRuleSchema = z
  .object({
    name: ruleFields.name,
    baseCents: ruleFields.baseCents,
    perDayCents: ruleFields.perDayCents,
    weekdays: ruleFields.weekdays,
    payDay: ruleFields.payDay,
    paymentAdjust: ruleFields.paymentAdjust,
    additionalBasis: ruleFields.additionalBasis,
    destinationAccountId: ruleFields.destinationAccountId,
    extraDaysOff: ruleFields.extraDaysOff,
    attendanceOverrides: ruleFields.attendanceOverrides,
    startDate: ruleFields.startDate,
    endDate: ruleFields.endDate,
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nenhum campo informado para atualizar')

export const attendanceSchema = z
  .object({
    date: isoString,
    /** `true`/`false` grava; `null` remove o ajuste. */
    present: z.boolean().nullable(),
  })
  .strict()

export const projectionQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
})

export const materializeSchema = z
  .object({
    until: isoDate.optional(),
  })
  .strict()

export const confirmIncomeSchema = z
  .object({
    receivedAmount: z.number().int().positive().max(2_000_000_000).optional(),
    receivedDate: isoDate.optional(),
  })
  .strict()

export const meiProfileSchema = z
  .object({
    openedAt: isoDate.nullable().optional(),
    annualCeilingCents: z.number().int().positive().max(2_000_000_000).optional(),
    dasAmountCents: cents,
    dasDueDay: dayOfMonth.optional(),
    dasAccountId: z.string().min(1).nullable().optional(),
    businessAccountId: z.string().min(1).nullable().optional(),
  })
  .strict()

export const meiStatusQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})
