import { z } from 'zod'
import { localDateSchema } from '@/lib/dates'
import { MAX_ABS_AMOUNT } from '../domain/types'

/**
 * Contrato HTTP do ledger (Zod 4). Decisão FC2-F1-01: a API recebe o valor **em módulo**
 * (centavos inteiros, positivo) e o use-case aplica o sinal conforme o `kind`; apenas
 * `ADJUSTMENT` recebe o valor assinado. Datas de calendário entram como `YYYY-MM-DD`
 * (estritas) e viram meio-dia UTC.
 */

const centsAbs = z
  .number({ message: 'Valor inválido' })
  .int('O valor deve ser inteiro, em centavos')
  .min(1, 'O valor deve ser maior que zero')
  .max(MAX_ABS_AMOUNT, 'Valor acima do limite')

const centsSigned = z
  .number({ message: 'Valor inválido' })
  .int('O valor deve ser inteiro, em centavos')
  .min(-MAX_ABS_AMOUNT, 'Valor abaixo do limite')
  .max(MAX_ABS_AMOUNT, 'Valor acima do limite')
  .refine((v) => v !== 0, 'O valor não pode ser zero')

const id = z.string().min(1).max(64)
const description = z.string().trim().min(1, 'Descrição obrigatória').max(255)
const notes = z.string().trim().max(2000)
const tags = z.array(z.string().trim().min(1).max(40)).max(20)
const txnStatus = z.enum(['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED'])
/** Kinds criáveis por `POST /api/transactions` (transferências usam `/api/transfers`). */
export const flowKindSchema = z.enum(['EXPENSE', 'INCOME', 'FEE', 'INTEREST', 'ADJUSTMENT'])
const nonReconciledStatus = z.enum(['PLANNED', 'PENDING', 'CLEARED'])

export const createTransactionSchema = z
  .object({
    accountId: id,
    kind: flowKindSchema,
    /** Módulo (> 0), exceto `ADJUSTMENT` (assinado, != 0). */
    amount: centsSigned,
    date: localDateSchema(),
    postedDate: localDateSchema().optional(),
    description,
    categoryId: id.optional(),
    merchantId: id.optional(),
    status: nonReconciledStatus.optional(),
    notes: notes.optional(),
    tags: tags.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind !== 'ADJUSTMENT' && value.amount < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Informe o valor em módulo (positivo); o sinal é aplicado pelo tipo do lançamento',
      })
    }
  })

export type CreateTransactionBody = z.infer<typeof createTransactionSchema>

export const updateTransactionSchema = z
  .object({
    /** Módulo (> 0), exceto em `ADJUSTMENT` (assinado); validado pelo use-case com o kind final. */
    amount: centsSigned.optional(),
    date: localDateSchema().optional(),
    postedDate: localDateSchema().nullable().optional(),
    description: description.optional(),
    categoryId: id.nullable().optional(),
    merchantId: id.nullable().optional(),
    notes: notes.nullable().optional(),
    tags: tags.optional(),
    status: txnStatus.optional(),
    accountId: id.optional(),
    kind: flowKindSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'Informe ao menos um campo para atualizar',
  })

export type UpdateTransactionBody = z.infer<typeof updateTransactionSchema>

export const changeStatusSchema = z.object({ status: txnStatus }).strict()

export const createTransferSchema = z
  .object({
    sourceAccountId: id,
    destinationAccountId: id,
    amount: centsAbs,
    date: localDateSchema(),
    description,
    status: nonReconciledStatus.optional(),
    notes: notes.optional(),
    tags: tags.optional(),
  })
  .strict()
  .refine((value) => value.sourceAccountId !== value.destinationAccountId, {
    path: ['destinationAccountId'],
    message: 'Origem e destino devem ser contas diferentes',
  })

export type CreateTransferBody = z.infer<typeof createTransferSchema>

export const listTransactionsQuerySchema = z
  .object({
    from: localDateSchema().optional(),
    to: localDateSchema().optional(),
    accountId: id.optional(),
    status: txnStatus.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'A data final deve ser igual ou posterior à inicial',
  })

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>
