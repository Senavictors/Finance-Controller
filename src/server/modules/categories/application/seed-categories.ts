import {
  ensureDefaultCategories,
  type EnsureDefaultCategoriesResult,
} from './ensure-default-categories'
import type { CategoryRepository } from './ports'

export type SeedCategoriesResult =
  | ({ ok: true } & EnsureDefaultCategoriesResult)
  | { ok: false; reason: 'NO_USER' | 'MULTIPLE_USERS'; message: string }

/**
 * Lógica do script `npm run seed:categories`: semeia as categorias do único usuário. Recusa
 * (sem tocar no banco) se não houver usuário ou se houver mais de um (app single-user).
 * `listUserIds` deve devolver no máximo 2 ids (basta para distinguir 0, 1 e vários).
 */
export async function seedCategoriesForOwner(deps: {
  listUserIds: () => Promise<string[]>
  categories: CategoryRepository
}): Promise<SeedCategoriesResult> {
  const ids = await deps.listUserIds()
  if (ids.length === 0) {
    return {
      ok: false,
      reason: 'NO_USER',
      message: 'Nenhum usuário encontrado. Crie o dono primeiro com "npm run owner:create".',
    }
  }
  if (ids.length > 1) {
    return {
      ok: false,
      reason: 'MULTIPLE_USERS',
      message: 'Há mais de um usuário no banco; o app é single-user. Nada foi alterado.',
    }
  }
  const result = await ensureDefaultCategories(ids[0], { categories: deps.categories })
  return { ok: true, ...result }
}

export function formatSeedSummary(result: EnsureDefaultCategoriesResult): string {
  return `created=${result.created} existing=${result.existing}`
}
