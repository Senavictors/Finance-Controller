import type { PrismaClient } from '@/generated/prisma/client'

import type { CategoryRepository } from '../application/ports'

/**
 * Repositório Prisma de categorias. Recebe o cliente por parâmetro (app usa `@/server/db`;
 * testes de integração usam `getTestDb()`), então importar este arquivo não abre conexão.
 * Todas as consultas filtram por `userId`.
 */
export function createPrismaCategoryRepository(db: PrismaClient): CategoryRepository {
  return {
    listByUser(userId) {
      return db.category.findMany({
        where: { userId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })
    },

    findById(userId, id) {
      return db.category.findFirst({ where: { id, userId } })
    },

    async createManyIgnoringExisting(userId, rows) {
      const result = await db.category.createMany({
        data: rows.map((row) => ({ ...row, userId })),
        skipDuplicates: true,
      })
      return result.count
    },

    create(userId, data, sortOrder) {
      return db.category.create({ data: { ...data, userId, sortOrder } })
    },

    async update(userId, id, patch) {
      // `updateMany` escopa por userId; devolve a linha atualizada em seguida.
      await db.category.updateMany({ where: { id, userId }, data: patch })
      return db.category.findFirstOrThrow({ where: { id, userId } })
    },

    async setParent(userId, id, parentId) {
      await db.category.updateMany({ where: { id, userId, parentId: null }, data: { parentId } })
    },
  }
}
