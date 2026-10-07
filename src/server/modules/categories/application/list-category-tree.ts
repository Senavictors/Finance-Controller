import { buildCategoryTree } from '../domain/category-rules'
import type { CategoryNode } from '../domain/types'
import type { CategoryRepository } from './ports'

/** Árvore de categorias do usuário (2 níveis) com `effectiveNature`. Arquivadas só sob pedido. */
export async function listCategoryTree(
  userId: string,
  options: { includeArchived?: boolean },
  deps: { categories: CategoryRepository },
): Promise<CategoryNode[]> {
  const records = await deps.categories.listByUser(userId)
  return buildCategoryTree(records, { includeArchived: options.includeArchived ?? false })
}
