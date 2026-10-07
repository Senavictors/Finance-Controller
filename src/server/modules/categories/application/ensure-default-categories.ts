import { DEFAULT_CATEGORIES, type DefaultCategory } from '../domain/default-categories'
import type { CategoryRepository, SeedCategoryRow } from './ports'

export type EnsureDefaultCategoriesResult = { created: number; existing: number }

function toRow(def: DefaultCategory, parentId: string | null): SeedCategoryRow {
  return {
    key: def.key,
    name: def.name,
    type: def.type,
    nature: def.nature ?? null,
    icon: def.icon,
    colorKey: def.colorKey,
    parentId,
    sortOrder: def.sortOrder,
    isSystem: def.isSystem ?? false,
  }
}

/**
 * Garante as categorias padrão do usuário (RN-07). Idempotente: cria só as ausentes por
 * `(userId, key)`, em duas passadas (pais, depois filhos com `parentId` resolvido).
 *
 * Nunca atualiza campos de categorias existentes (nome, natureza, ícone, cor, ordem, arquivo):
 * o que o usuário editou ou arquivou permanece. A única correção é estrutural: um filho padrão
 * que ficou sem pai (pai apagado à mão e recriado) é reatado ao pai de chave correspondente.
 * Nunca apaga nem arquiva.
 */
export async function ensureDefaultCategories(
  userId: string,
  deps: { categories: CategoryRepository },
): Promise<EnsureDefaultCategoriesResult> {
  const repo = deps.categories
  const before = await repo.listByUser(userId)
  const existingByKey = new Map(before.map((category) => [category.key, category]))

  const missingRoots = DEFAULT_CATEGORIES.filter(
    (def) => !def.parentKey && !existingByKey.has(def.key),
  ).map((def) => toRow(def, null))
  let created =
    missingRoots.length > 0 ? await repo.createManyIgnoringExisting(userId, missingRoots) : 0

  const afterRoots = missingRoots.length > 0 ? await repo.listByUser(userId) : before
  const idByKey = new Map(afterRoots.map((category) => [category.key, category.id]))

  const missingChildren: SeedCategoryRow[] = []
  for (const def of DEFAULT_CATEGORIES) {
    if (!def.parentKey || existingByKey.has(def.key)) continue
    const parentId = idByKey.get(def.parentKey)
    if (!parentId) continue // pai inexistente: impossível com a árvore válida (testada)
    missingChildren.push(toRow(def, parentId))
  }
  if (missingChildren.length > 0) {
    created += await repo.createManyIgnoringExisting(userId, missingChildren)
  }

  for (const def of DEFAULT_CATEGORIES) {
    if (!def.parentKey) continue
    const current = existingByKey.get(def.key)
    const parentId = idByKey.get(def.parentKey)
    if (current && !current.parentId && parentId) {
      await repo.setParent(userId, current.id, parentId)
    }
  }

  return { created, existing: DEFAULT_CATEGORIES.length - created }
}
