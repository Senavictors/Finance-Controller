import { prisma } from '@/server/db'

import { createPrismaCategoryRepository } from './prisma-category-repository'

/** Repositório ligado ao cliente da aplicação (abre conexão ao importar `@/server/db`). */
export const prismaCategoryRepository = createPrismaCategoryRepository(prisma)
