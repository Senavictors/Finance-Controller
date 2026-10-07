import { planNewCategory, toCategoryNode, type CreateCategoryInput } from '../domain/category-rules'
import { CategoryError } from '../domain/errors'
import type { CategoryNode } from '../domain/types'
import type { CategoryRepository } from './ports'

const SORT_STEP = 10

/**
 * Cria categoria customizada (pai ou filha), sempre `isSystem = false`, com `key` gerada
 * (`custom-<slug>[-N]`). Máximo de 2 níveis: o pai não pode ter pai (RN-02).
 */
export async function createCategory(
  userId: string,
  input: CreateCategoryInput,
  deps: { categories: CategoryRepository },
): Promise<CategoryNode> {
  const repo = deps.categories
  const all = await repo.listByUser(userId)

  let parent = null
  if (input.parentId) {
    parent = all.find((category) => category.id === input.parentId) ?? null
    if (!parent) {
      throw new CategoryError('CATEGORY_NOT_FOUND', 'Categoria pai não encontrada.')
    }
  }

  const data = planNewCategory(input, parent, new Set(all.map((category) => category.key)))
  const siblingOrders = all
    .filter((category) => category.parentId === data.parentId)
    .map((category) => category.sortOrder)
  const sortOrder = (siblingOrders.length > 0 ? Math.max(...siblingOrders) : 0) + SORT_STEP

  const created = await repo.create(userId, data, sortOrder)
  return toCategoryNode(created, parent)
}
