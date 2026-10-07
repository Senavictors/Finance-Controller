import type { CategoryColumnsPatch, NewCategoryData } from '../domain/category-rules'
import type { CategoryRecord, CategoryType, Nature } from '../domain/types'

/** Linha a inserir pela semeadura dos padrões (pais antes dos filhos, `parentId` resolvido). */
export type SeedCategoryRow = {
  key: string
  name: string
  type: CategoryType
  nature: Nature | null
  icon: string
  colorKey: string
  parentId: string | null
  sortOrder: number
  isSystem: boolean
}

/**
 * Porta de persistência de categorias. Toda operação é escopada por `userId` (isolamento).
 * Implementação real: `infra/prisma-category-repository.ts`; testes usam o fake em memória.
 */
export interface CategoryRepository {
  listByUser(userId: string): Promise<CategoryRecord[]>
  findById(userId: string, id: string): Promise<CategoryRecord | null>
  /**
   * Insere ignorando as que já existem por `(userId, key)` (corrida entre execuções) e devolve
   * quantas foram de fato criadas.
   */
  createManyIgnoringExisting(userId: string, rows: SeedCategoryRow[]): Promise<number>
  create(userId: string, data: NewCategoryData, sortOrder: number): Promise<CategoryRecord>
  update(userId: string, id: string, patch: CategoryColumnsPatch): Promise<CategoryRecord>
  /** Reata uma subcategoria padrão cujo pai foi removido e recriado. */
  setParent(userId: string, id: string, parentId: string): Promise<void>
}
