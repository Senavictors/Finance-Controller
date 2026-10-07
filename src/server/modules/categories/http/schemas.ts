import { z } from 'zod'

import { CATEGORY_NAME_MAX, isColorKey, isIconName } from '../domain/category-rules'
import { CATEGORY_TYPES, NATURES } from '../domain/types'

const name = z.string().trim().min(1, 'Informe o nome.').max(CATEGORY_NAME_MAX)
const icon = z.string().refine(isIconName, 'Ícone inválido.')
const colorKey = z.string().refine(isColorKey, 'Cor inválida: use cat-1 a cat-10.')
const nature = z.enum(NATURES)

export const createCategorySchema = z
  .object({
    name,
    type: z.enum(CATEGORY_TYPES).optional(),
    parentId: z.string().min(1).nullable().optional(),
    nature: nature.nullable().optional(),
    icon: icon.optional(),
    colorKey: colorKey.optional(),
  })
  .strict()

/**
 * `key` e `type` são aceitos apenas para que o use-case responda com `CATEGORY_SYSTEM_LOCKED`
 * (ou erro de imutabilidade) em vez de um 400 genérico.
 */
export const updateCategorySchema = z
  .object({
    name: name.optional(),
    icon: icon.optional(),
    colorKey: colorKey.optional(),
    nature: nature.nullable().optional(),
    isArchived: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    key: z.string().optional(),
    type: z.enum(CATEGORY_TYPES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo.')

export const listCategoriesQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})
