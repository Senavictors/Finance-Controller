import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getTestDb } from '../../../../../tests/helpers/db'
import { createCategory } from '../application/create-category'
import { ensureDefaultCategories } from '../application/ensure-default-categories'
import { listCategoryTree } from '../application/list-category-tree'
import { updateCategory } from '../application/update-category'
import { DEFAULT_CATEGORIES } from '../domain/default-categories'
import { createPrismaCategoryRepository } from './prisma-category-repository'

// Integração contra `DATABASE_URL_TEST` (database descartável com "test" ou "branch" no nome).
// Sem a variável a suíte inteira é pulada.
const db = getTestDb()
const TOTAL = DEFAULT_CATEGORIES.length

describe.skipIf(!db)('categorias no banco de teste', () => {
  const repo = createPrismaCategoryRepository(db!)
  const deps = { categories: repo }
  const userIds: string[] = []

  async function createUser(label: string): Promise<string> {
    const user = await db!.user.create({
      data: {
        email: `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
        password: 'hash-sintetico',
      },
      select: { id: true },
    })
    userIds.push(user.id)
    return user.id
  }

  let userId: string
  beforeEach(async () => {
    userId = await createUser('cat')
  })

  afterAll(async () => {
    // Remove só os usuários criados por esta suíte (categorias caem em cascata).
    if (userIds.length > 0) await db!.user.deleteMany({ where: { id: { in: userIds } } })
    await db!.$disconnect()
  })

  beforeAll(async () => {
    await db!.$queryRaw`SELECT 1`
  })

  it('CA-01: cria as 80 na primeira vez e nenhuma na segunda (sem erro nem duplicata)', async () => {
    expect(await ensureDefaultCategories(userId, deps)).toEqual({ created: TOTAL, existing: 0 })
    expect(await ensureDefaultCategories(userId, deps)).toEqual({ created: 0, existing: TOTAL })
    expect(await db!.category.count({ where: { userId } })).toBe(TOTAL)
  })

  it('unique (userId, key) é respeitada; outro usuário tem seu próprio conjunto', async () => {
    await ensureDefaultCategories(userId, deps)
    const other = await createUser('cat-outro')
    await ensureDefaultCategories(other, deps)
    expect(await db!.category.count({ where: { userId: other } })).toBe(TOTAL)

    await expect(
      db!.category.create({
        data: { userId, key: 'lazer', name: 'Duplicada', type: 'EXPENSE', nature: 'WANT' },
      }),
    ).rejects.toThrow()
  })

  it('pais e natureza gravados conforme a árvore padrão', async () => {
    await ensureDefaultCategories(userId, deps)
    const rows = await db!.category.findMany({ where: { userId }, include: { parent: true } })
    for (const def of DEFAULT_CATEGORIES) {
      const row = rows.find((candidate) => candidate.key === def.key)!
      expect(row.parent?.key).toBe(def.parentKey)
      expect(row.nature).toBe(def.nature ?? null)
      expect(row.isSystem).toBe(def.isSystem ?? false)
    }
  })

  it('CA-05: nome editado sobrevive a novo ensure, sem duplicar', async () => {
    await ensureDefaultCategories(userId, deps)
    const supermercado = await db!.category.findFirstOrThrow({
      where: { userId, key: 'supermercado' },
    })
    await updateCategory(userId, supermercado.id, { name: 'Feira e Mercado' }, deps)

    expect(await ensureDefaultCategories(userId, deps)).toEqual({ created: 0, existing: TOTAL })
    const rows = await db!.category.findMany({ where: { userId, key: 'supermercado' } })
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Feira e Mercado')
    expect(rows[0].updatedAt.getTime()).toBeGreaterThan(rows[0].createdAt.getTime())
  })

  it('apagada à mão é recriada e os filhos órfãos (SetNull) são reatados', async () => {
    await ensureDefaultCategories(userId, deps)
    await db!.category.deleteMany({ where: { userId, key: 'mercado' } })

    expect(await ensureDefaultCategories(userId, deps)).toEqual({ created: 1, existing: TOTAL - 1 })
    const mercado = await db!.category.findFirstOrThrow({ where: { userId, key: 'mercado' } })
    const children = await db!.category.findMany({ where: { userId, parentId: mercado.id } })
    expect(children).toHaveLength(4)
  })

  it('árvore: effectiveNature, arquivar e isolamento entre usuários', async () => {
    await ensureDefaultCategories(userId, deps)
    const other = await createUser('cat-outro')

    const lazer = await db!.category.findFirstOrThrow({ where: { userId, key: 'lazer' } })
    await updateCategory(userId, lazer.id, { isArchived: true }, deps)
    const tree = await listCategoryTree(userId, {}, deps)
    expect(tree.some((node) => node.key === 'lazer')).toBe(false)
    expect(tree.find((node) => node.key === 'mercado')?.children[0].effectiveNature).toBe('NEED')
    expect(await listCategoryTree(other, {}, deps)).toEqual([])

    // Outro usuário não enxerga nem edita a categoria.
    await expect(updateCategory(other, lazer.id, { name: 'X' }, deps)).rejects.toMatchObject({
      code: 'CATEGORY_NOT_FOUND',
    })
  })

  it('cria categoria customizada com key única mesmo repetindo o nome', async () => {
    await ensureDefaultCategories(userId, deps)
    const first = await createCategory(userId, { name: 'Extra', type: 'INCOME' }, deps)
    const second = await createCategory(userId, { name: 'Extra', type: 'INCOME' }, deps)
    expect([first.key, second.key]).toEqual(['custom-extra', 'custom-extra-2'])
  })
})
