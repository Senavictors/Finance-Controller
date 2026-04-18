import { z } from 'zod'

// ── Account ──────────────────────────────────────────────

export const createAccountSchema = z
  .object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
    type: z.enum(['WALLET', 'CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'OTHER'], {
      message: 'Tipo de conta invalido',
    }),
    initialBalance: z.number().int('Saldo deve ser um numero inteiro (centavos)').default(0),
    creditLimit: z
      .union([z.number().int('Limite deve ser um numero inteiro (centavos)').positive(), z.null()])
      .optional(),
    statementClosingDay: z.union([z.number().int().min(1).max(31), z.null()]).optional(),
    statementDueDay: z.union([z.number().int().min(1).max(31), z.null()]).optional(),
    color: z.string().max(20).optional(),
    icon: z.string().max(50).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== 'CREDIT_CARD') return

    if (data.creditLimit == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['creditLimit'],
        message: 'Limite obrigatorio para cartao de credito',
      })
    }

    if (data.statementClosingDay == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['statementClosingDay'],
        message: 'Dia de fechamento obrigatorio para cartao de credito',
      })
    }

    if (data.statementDueDay == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['statementDueDay'],
        message: 'Dia de vencimento obrigatorio para cartao de credito',
      })
    }
  })

export const updateAccountSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100).optional(),
  type: z
    .enum(['WALLET', 'CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'OTHER'], {
      message: 'Tipo de conta invalido',
    })
    .optional(),
  initialBalance: z.number().int('Saldo deve ser um numero inteiro (centavos)').optional(),
  creditLimit: z
    .union([z.number().int('Limite deve ser um numero inteiro (centavos)').positive(), z.null()])
    .optional(),
  statementClosingDay: z.union([z.number().int().min(1).max(31), z.null()]).optional(),
  statementDueDay: z.union([z.number().int().min(1).max(31), z.null()]).optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
})

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

export const createCreditCardPaymentSchema = z.object({
  sourceAccountId: z.string({ error: 'Conta de origem obrigatoria' }),
  amount: z.number().int().positive('Valor deve ser positivo'),
  date: z.coerce.date({ message: 'Data invalida' }),
  description: z.string().min(1, 'Descricao obrigatoria').max(255),
  notes: z.string().max(1000).optional(),
})

export type CreateCreditCardPaymentInput = z.infer<typeof createCreditCardPaymentSchema>

// ── Recurring Rule ───────────────────────────────────────

export const createRecurringRuleSchema = z
  .object({
    accountId: z.string({ error: 'Conta obrigatoria' }),
    categoryId: z.string().nullable().optional(),
    type: z.enum(['INCOME', 'EXPENSE'], { message: 'Tipo deve ser INCOME ou EXPENSE' }),
    amount: z.number().int().positive('Valor deve ser positivo'),
    description: z.string().min(1, 'Descricao obrigatoria').max(255),
    notes: z.string().max(1000).optional(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], {
      message: 'Frequencia invalida',
    }),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startDate: z.coerce.date({ message: 'Data de inicio invalida' }),
    endDate: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.frequency === 'MONTHLY' && data.dayOfMonth == null) return false
      return true
    },
    { message: 'Dia do mes obrigatorio para frequencia mensal', path: ['dayOfMonth'] },
  )
  .refine(
    (data) => {
      if (data.frequency === 'WEEKLY' && data.dayOfWeek == null) return false
      return true
    },
    { message: 'Dia da semana obrigatorio para frequencia semanal', path: ['dayOfWeek'] },
  )

export const updateRecurringRuleSchema = z.object({
  accountId: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  amount: z.number().int().positive('Valor deve ser positivo').optional(),
  description: z.string().min(1).max(255).optional(),
  notes: z.string().max(1000).nullable().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
})

export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>
export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>

// ── Goal ─────────────────────────────────────────────────

const goalBaseSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  description: z.string().max(500).optional(),
  metric: z.enum(['SAVING', 'EXPENSE_LIMIT', 'INCOME_TARGET', 'ACCOUNT_LIMIT'], {
    message: 'Metrica invalida',
  }),
  scopeType: z.enum(['GLOBAL', 'CATEGORY', 'ACCOUNT']).default('GLOBAL'),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  targetAmount: z.number().int().positive('Valor alvo deve ser positivo'),
  period: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
  warningPercent: z.number().int().min(1).max(99).default(80),
  dangerPercent: z.number().int().min(1).max(99).default(95),
})

export const createGoalSchema = goalBaseSchema.superRefine((data, ctx) => {
  if (data.scopeType === 'CATEGORY' && !data.categoryId) {
    ctx.addIssue({
      code: 'custom',
      path: ['categoryId'],
      message: 'Categoria obrigatoria para escopo de categoria',
    })
  }
  if ((data.scopeType === 'ACCOUNT' || data.metric === 'ACCOUNT_LIMIT') && !data.accountId) {
    ctx.addIssue({
      code: 'custom',
      path: ['accountId'],
      message: 'Conta obrigatoria para escopo de conta',
    })
  }
  if (data.warningPercent >= data.dangerPercent) {
    ctx.addIssue({
      code: 'custom',
      path: ['dangerPercent'],
      message: 'Limiar de perigo deve ser maior que o de aviso',
    })
  }
})

export const updateGoalSchema = goalBaseSchema
  .omit({ metric: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })

export const goalQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
})

export type CreateGoalInput = z.infer<typeof createGoalSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>
export type GoalQuery = z.infer<typeof goalQuerySchema>
