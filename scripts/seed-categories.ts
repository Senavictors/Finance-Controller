/**
 * Semeia as categorias padrão BR do único usuário (FC2-F1-07).
 *
 *   npm run seed:categories
 *
 * Idempotente: cria só as ausentes e imprime `created=N existing=M`. Recusa (sem tocar no banco)
 * se não houver usuário ou houver mais de um. Usa `DATABASE_URL` de `.env.local`/`.env`.
 * Não é executado em testes: a lógica está em `src/server/modules/categories/application`.
 */
import { config as loadEnv } from 'dotenv'

import {
  formatSeedSummary,
  seedCategoriesForOwner,
} from '../src/server/modules/categories/application/seed-categories'
import { createPrismaCategoryRepository } from '../src/server/modules/categories/infra/prisma-category-repository'

// dotenv não sobrescreve variáveis já definidas: `.env.local` primeiro, então vence `.env`.
loadEnv({ path: '.env.local', quiet: true })
loadEnv({ path: '.env', quiet: true })

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não definida (.env.local ou .env).')
    process.exitCode = 1
    return
  }

  // Importado sob demanda: `@/server/db` abre o adaptador com `DATABASE_URL` ao ser carregado.
  const { prisma } = await import('../src/server/db')

  const result = await seedCategoriesForOwner({
    listUserIds: async () =>
      (await prisma.user.findMany({ select: { id: true }, take: 2 })).map((user) => user.id),
    categories: createPrismaCategoryRepository(prisma),
  })

  if (!result.ok) {
    console.error(result.message)
    process.exitCode = 1
    return
  }
  console.log(formatSeedSummary(result))
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falha inesperada.')
    process.exitCode = 1
  })
  .finally(() => {
    // O pool do adaptador mantém o processo vivo; encerra explicitamente.
    process.exit(process.exitCode ?? 0)
  })
