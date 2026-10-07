// API pública do módulo de categorias (FC2-F1-07). Consumidores: scripts, regras (F4-03),
// importação (F4-01), MEI (F1-06), dívidas (F1-05). Não exporta o repositório Prisma de aplicação
// (importá-lo abre conexão): use `infra/default-repository` diretamente na borda.
export {
  DEFAULT_CATEGORIES,
  SYSTEM_CATEGORY_KEYS,
  type DefaultCategory,
  type SystemCategoryKey,
} from './domain/default-categories'
export { resolveNature } from './domain/nature'
export { CategoryError, type CategoryErrorCode } from './domain/errors'
export type { CategoryNode, CategoryRecord, CategoryType, ColorKey, Nature } from './domain/types'
export type { CategoryRepository } from './application/ports'
export {
  ensureDefaultCategories,
  type EnsureDefaultCategoriesResult,
} from './application/ensure-default-categories'
export { listCategoryTree } from './application/list-category-tree'
export { updateCategory } from './application/update-category'
export { createCategory } from './application/create-category'
export { createPrismaCategoryRepository } from './infra/prisma-category-repository'
