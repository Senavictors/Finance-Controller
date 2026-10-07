import {
  planCategoryUpdate,
  toCategoryNode,
  type UpdateCategoryPatch,
} from '../domain/category-rules'
import { CategoryError } from '../domain/errors'
import type { CategoryNode } from '../domain/types'
import type { CategoryRepository } from './ports'

/**
 * Edição leve: renomear, ícone, cor, natureza (só despesa), arquivar e ordem. Categorias
 * `isSystem` podem ser renomeadas, mas não arquivadas nem trocar `key`/`type`
 * (`CATEGORY_SYSTEM_LOCKED`). Não há exclusão física: a UI arquiva (ver riscos da task).
 */
export async function updateCategory(
  userId: string,
  id: string,
  patch: UpdateCategoryPatch,
  deps: { categories: CategoryRepository },
): Promise<CategoryNode> {
  const repo = deps.categories
  const category = await repo.findById(userId, id)
  if (!category) {
    throw new CategoryError('CATEGORY_NOT_FOUND', 'Categoria não encontrada.')
  }

  const columns = planCategoryUpdate(category, patch)
  const updated =
    Object.keys(columns).length > 0 ? await repo.update(userId, id, columns) : category

  const parent = updated.parentId ? await repo.findById(userId, updated.parentId) : null
  return toCategoryNode(updated, parent)
}
