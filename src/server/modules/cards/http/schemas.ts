import { z } from 'zod'
import { localDateSchema } from '@/lib/dates'
import { MAX_INSTALLMENTS } from '../domain/installments'

/**
 * Contrato HTTP do módulo de cartões (Zod 4). Valores em centavos inteiros e em módulo; datas
 * de calendário `YYYY-MM-DD` estritas viram meio-dia UTC; ids de conta/fatura/compra vêm do
 * caminho da rota quando existem.
 */

const MAX_CENTS = 2_000_000_000

const cents = z
  .number({ message: 'Valor inválido' })
  .int('O valor deve ser inteiro, em centavos')
  .min(1, 'O valor deve ser maior que zero')
  .max(MAX_CENTS, 'Valor acima do limite')

const id = z.string().min(1).max(64)
const description = z.string().trim().min(1, 'Descrição obrigatória').max(255)
const statementKey = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'statementKey deve estar no formato AAAA-MM')

export const createPurchaseSchema = z
  .object({
    /** Valor TOTAL da compra. */
    amount: cents,
    installmentCount: z.number().int().min(1).max(MAX_INSTALLMENTS).optional(),
    date: localDateSchema(),
    description,
    categoryId: id.optional(),
    merchantId: id.optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
export type CreatePurchaseBody = z.infer<typeof createPurchaseSchema>

export const payStatementSchema = z
  .object({
    sourceAccountId: id,
    amount: cents,
    date: localDateSchema(),
    description: description.optional(),
  })
  .strict()
export type PayStatementBody = z.infer<typeof payStatementSchema>

export const moveStatementSchema = z
  .object({
    targetStatementKey: statementKey.optional(),
    targetStatementId: id.optional(),
  })
  .strict()
  .refine(
    (value) => value.targetStatementKey !== undefined || value.targetStatementId !== undefined,
    {
      message: 'Informe targetStatementKey ou targetStatementId',
    },
  )
export type MoveStatementBody = z.infer<typeof moveStatementSchema>

export const refundSchema = z
  .object({
    amount: cents,
    date: localDateSchema(),
    statementKey: statementKey.optional(),
    description: description.optional(),
  })
  .strict()
export type RefundBody = z.infer<typeof refundSchema>

export const advanceSchema = z
  .object({
    installmentNumbers: z
      .array(z.number().int().min(1).max(MAX_INSTALLMENTS))
      .min(1)
      .max(MAX_INSTALLMENTS),
    date: localDateSchema(),
    discountAmount: z.number().int().min(0).max(MAX_CENTS).default(0),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
export type AdvanceBody = z.infer<typeof advanceSchema>
