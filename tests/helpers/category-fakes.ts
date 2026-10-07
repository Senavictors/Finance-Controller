import type {
  CategoryRepository,
  SeedCategoryRow,
} from '@/server/modules/categories/application/ports'
import type { CategoryRecord } from '@/server/modules/categories/domain/types'

/**
 * Repositório de categorias em memória (uma instância por teste). Reproduz o contrato do
 * Prisma: unique `(userId, key)`, `updatedAt` avança a cada update, escopo por `userId`.
 */
export function fakeCategoryRepository(): CategoryRepository & {
  rows: CategoryRecord[]
  /** Simula "apagar à mão" no banco (a API não expõe exclusão). */
  removeByKey(userId: string, key: string): void
} {
  let counter = 0
  let clock = Date.UTC(2026, 9, 5, 12, 0, 0)
  const rows: CategoryRecord[] = []
  const tick = () => new Date((clock += 1000))

  function insert(userId: string, row: SeedCategoryRow): CategoryRecord {
    counter++
    const at = tick()
    const record: CategoryRecord = {
      ...row,
      id: `cat-${counter}`,
      userId,
      createdAt: at,
      updatedAt: at,
      isArchived: false,
    }
    rows.push(record)
    return record
  }

  return {
    rows,
    removeByKey(userId, key) {
      const index = rows.findIndex((row) => row.userId === userId && row.key === key)
      if (index >= 0) {
        const [removed] = rows.splice(index, 1)
        // FK `onDelete: SetNull`
        for (const row of rows) if (row.parentId === removed.id) row.parentId = null
      }
    },
    async listByUser(userId) {
      return rows.filter((row) => row.userId === userId).map((row) => ({ ...row }))
    },
    async findById(userId, id) {
      const row = rows.find((candidate) => candidate.userId === userId && candidate.id === id)
      return row ? { ...row } : null
    },
    async createManyIgnoringExisting(userId, newRows) {
      let count = 0
      for (const row of newRows) {
        if (rows.some((existing) => existing.userId === userId && existing.key === row.key))
          continue
        insert(userId, row)
        count++
      }
      return count
    },
    async create(userId, data, sortOrder) {
      if (rows.some((existing) => existing.userId === userId && existing.key === data.key)) {
        throw new Error('unique (userId, key)')
      }
      return { ...insert(userId, { ...data, sortOrder }) }
    },
    async update(userId, id, patch) {
      const row = rows.find((candidate) => candidate.userId === userId && candidate.id === id)
      if (!row) throw new Error('not found')
      Object.assign(row, patch, { updatedAt: tick() })
      return { ...row }
    },
    async setParent(userId, id, parentId) {
      const row = rows.find((candidate) => candidate.userId === userId && candidate.id === id)
      if (row && !row.parentId) row.parentId = parentId
    },
  }
}
