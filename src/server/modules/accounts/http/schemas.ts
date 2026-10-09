import { z } from 'zod'

import { localDateSchema } from '@/lib/dates'

import { ACCOUNT_TYPES } from '../domain/types'
import { validateAccountFields, validateOpeningBalance } from '../domain/validation'

/**
 * Contrato HTTP de contas (Zod 4). Aqui só a forma dos dados; as regras por tipo (cartão exige
 * limite e dias, cheque especial só em corrente/PJ, chaves do registry de marcas) vivem em
 * `domain/validation.ts` e são aplicadas por `superRefine` para devolver o erro POR CAMPO.
 * Dinheiro em centavos inteiros; `openingBalance` é assinado.
 */

const cents = z
  .number({ message: 'Informe um valor em centavos.' })
  .int('Use um valor inteiro, em centavos.')
const day = z.number({ message: 'Informe um dia do mês.' }).int('Use um número inteiro.')
const key = z
  .string({ message: 'Valor inválido.' })
  .min(1, 'Valor inválido.')
  .max(40, 'Valor longo demais.')

const fieldShape = {
  name: z.string({ message: 'Informe o nome da conta.' }),
  type: z.enum(ACCOUNT_TYPES, { message: 'Tipo de conta inválido.' }),
  issuerKey: key.nullish(),
  networkKey: key.nullish(),
  colorKey: key.nullish(),
  icon: key.nullish(),
  overdraftLimit: cents.nullish(),
  creditLimit: cents.nullish(),
  closingDay: day.nullish(),
  dueDay: day.nullish(),
}

export const createAccountSchema = z
  .object({
    ...fieldShape,
    /** Assinado; vira o `ADJUSTMENT` "Saldo inicial". Em cartão, dívida existente (<= 0). */
    openingBalance: cents.optional(),
    openingDate: localDateSchema().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const errors = {
      ...validateAccountFields(value),
      ...validateOpeningBalance(value.type, value.openingBalance),
    }
    for (const [field, messages] of Object.entries(errors)) {
      for (const message of messages ?? []) {
        ctx.addIssue({ code: 'custom', path: [field], message })
      }
    }
  })

export type CreateAccountBody = z.infer<typeof createAccountSchema>

/**
 * Alteração parcial. As regras que dependem da conta atual (tipo final, campos de cartão) são
 * validadas pelo use-case sobre o estado resultante.
 */
export const updateAccountSchema = z
  .object({
    name: fieldShape.name.optional(),
    type: fieldShape.type.optional(),
    issuerKey: fieldShape.issuerKey,
    networkKey: fieldShape.networkKey,
    colorKey: fieldShape.colorKey,
    icon: fieldShape.icon,
    overdraftLimit: fieldShape.overdraftLimit,
    creditLimit: fieldShape.creditLimit,
    closingDay: fieldShape.closingDay,
    dueDay: fieldShape.dueDay,
  })
  .strict()
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'Informe ao menos um campo para atualizar.',
  })

export type UpdateAccountBody = z.infer<typeof updateAccountSchema>

const booleanQuery = z
  .enum(['true', 'false'], { message: 'Use true ou false.' })
  .optional()
  .transform((value) => value === 'true')

export const listAccountsQuerySchema = z.object({
  includeArchived: booleanQuery,
  excludeBusiness: booleanQuery,
})

export const reorderAccountsSchema = z
  .object({
    ids: z
      .array(z.string().min(1).max(64), { message: 'Informe a lista de ids.' })
      .min(1, 'Informe ao menos uma conta.')
      .max(100, 'Contas demais.'),
  })
  .strict()
