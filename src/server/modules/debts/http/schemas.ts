import { z } from 'zod'
import { localDateSchema } from '@/lib/dates'
import { LOAN_KINDS, MAX_INSTALLMENT_COUNT, MAX_MONTHLY_RATE } from '../domain/types'

/**
 * Contrato HTTP de dívidas (Zod 4). Dinheiro em centavos inteiros; TODAS as taxas como FRAÇÃO
 * (`monthlyRate: 0.0199` = 1,99% a.m.; `lateFeeRate: 0.02` = 2%); datas `YYYY-MM-DD` estritas
 * (meio-dia UTC). O nome do credor/contrato rejeita sequências longas de dígitos (CPF/conta).
 */

const cents = z.number({ message: 'Valor inválido' }).int('Use centavos inteiros')
const positiveCents = cents.min(1, 'O valor deve ser maior que zero').max(2_000_000_000)
const id = z.string().min(1).max(64)
const monthlyRate = z
  .number({ message: 'Taxa inválida' })
  .min(0, 'Taxa não pode ser negativa')
  .max(MAX_MONTHLY_RATE, `Taxa acima de ${Math.round(MAX_MONTHLY_RATE * 100)}% a.m.`)
const fraction = z.number({ message: 'Valor inválido' }).min(0).max(1)

/** Rejeita 11+ dígitos seguidos (ignorando `.`, `-`, `/`, espaço): CPF, CNPJ, conta. */
const safeLabel = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/\d{11,}/.test(value.replace(/[.\-/\s]/g, '')), {
      message: 'Não informe documentos ou números de conta no nome.',
    })

export const createLoanSchema = z
  .object({
    kind: z.enum(LOAN_KINDS),
    name: safeLabel(80).min(1, 'Informe o nome'),
    lenderName: safeLabel(80).nullish(),
    accountId: id.nullish(),
    principalCents: positiveCents.optional(),
    monthlyRate: monthlyRate.optional(),
    installmentCount: z.number().int().min(1).max(MAX_INSTALLMENT_COUNT).optional(),
    installmentAmountCents: positiveCents.optional(),
    firstDueDate: localDateSchema().optional(),
    contractedAt: localDateSchema().nullish(),
    alreadyPaidInstallments: z.number().int().min(0).max(MAX_INSTALLMENT_COUNT).optional(),
    lateFeeRate: fraction.optional(),
    lateInterestMonthlyRate: fraction.optional(),
    categoryId: id.nullish(),
    notes: z.string().trim().max(500).nullish(),
  })
  .strict()

export const updateLoanSchema = z
  .object({
    name: safeLabel(80).min(1).optional(),
    lenderName: safeLabel(80).nullish(),
    accountId: id.nullish(),
    categoryId: id.nullish(),
    notes: z.string().trim().max(500).nullish(),
    monthlyRate: monthlyRate.optional(),
    lateFeeRate: fraction.optional(),
    lateInterestMonthlyRate: fraction.optional(),
    status: z.enum(['ACTIVE', 'DEFAULTED']).optional(),
    /** `true` encerra o contrato (`PAID_OFF`) sem apagar o histórico. */
    archive: z.boolean().optional(),
  })
  .strict()

export const payInstallmentSchema = z
  .object({
    payDate: localDateSchema(),
    accountId: id,
    amountPaid: positiveCents.optional(),
  })
  .strict()

const boolFromQuery = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')

export const listDebtsQuerySchema = z.object({ includeIdle: boolFromQuery.optional() })

export const simulateQuerySchema = z.object({
  extraMonthlyPayment: z.coerce.number().int().min(0).max(2_000_000_000).optional(),
  lumpSum: z.coerce.number().int().min(0).max(2_000_000_000).optional(),
})

export const overdraftCostQuerySchema = z.object({
  accountId: id,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use AAAA-MM'),
})

export const installmentParamsSchema = z.object({
  id,
  number: z.coerce.number().int().min(1).max(MAX_INSTALLMENT_COUNT),
})
