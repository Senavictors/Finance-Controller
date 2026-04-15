import { z } from 'zod'

// ── Account ──────────────────────────────────────────────

export const createAccountSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  type: z.enum(['WALLET', 'CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'OTHER'], {
    message: 'Tipo de conta invalido',
  }),
  initialBalance: z.number().int('Saldo deve ser um numero inteiro (centavos)').default(0),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
})

export const updateAccountSchema = createAccountSchema.partial()

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>

// ── Category ─────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  type: z.enum(['INCOME', 'EXPENSE'], { message: 'Tipo deve ser INCOME ou EXPENSE' }),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  parentId: z.string().nullable().optional(),
})

export const updateCategorySchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  parentId: z.string().nullable().optional(),
})

export const categoryQuerySchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

// ── Transaction ──────────────────────────────────────────

export const createTransactionSchema = z.object({
  amount: z.number().int().positive('Valor deve ser positivo'),
  date: z.coerce.date({ message: 'Data invalida' }),
  description: z.string().min(1, 'Descricao obrigatoria').max(255),
  categoryId: z.string().optional(),
  accountId: z.string({ error: 'Conta obrigatoria' }),
  type: z.enum(['INCOME', 'EXPENSE'], { message: 'Tipo deve ser INCOME ou EXPENSE' }),
  notes: z.string().max(1000).optional(),
})

export const updateTransactionSchema = createTransactionSchema.partial()

export const transactionQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>
export type TransactionQuery = z.infer<typeof transactionQuerySchema>

// ── Transfer ─────────────────────────────────────────────

export const createTransferSchema = z
  .object({
    amount: z.number().int().positive('Valor deve ser positivo'),
    date: z.coerce.date({ message: 'Data invalida' }),
    description: z.string().min(1, 'Descricao obrigatoria').max(255),
    sourceAccountId: z.string({ error: 'Conta de origem obrigatoria' }),
    destinationAccountId: z.string({ error: 'Conta de destino obrigatoria' }),
    notes: z.string().max(1000).optional(),
  })
  .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
    message: 'Contas de origem e destino devem ser diferentes',
    path: ['destinationAccountId'],
  })

export type CreateTransferInput = z.infer<typeof createTransferSchema>
