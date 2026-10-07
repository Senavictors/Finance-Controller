import { beforeEach, describe, expect, it } from 'vitest'

import { fakeCategoryRepository } from '../../../../../tests/helpers/category-fakes'
import { DEFAULT_CATEGORIES } from '../domain/default-categories'
import { CategoryError } from '../domain/errors'
import { createCategory } from './create-category'
import { ensureDefaultCategories } from './ensure-default-categories'
import { listCategoryTree } from './list-category-tree'
import { formatSeedSummary, seedCategoriesForOwner } from './seed-categories'
import { updateCategory } from './update-category'

const TOTAL = DEFAULT_CATEGORIES.length

let repo: ReturnType<typeof fakeCategoryRepository>
let deps: { categories: ReturnType<typeof fakeCategoryRepository> }

beforeEach(() => {
  repo = fakeCategoryRepository()
  deps = { categories: repo }
})

async function idOf(userId: string, key: string): Promise<string> {
  const found = (await repo.listByUser(userId)).find((category) => category.key === key)
  if (!found) throw new Error(`categoria ${key} ausente`)
  return found.id
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    return error instanceof CategoryError ? error.code : 'OUTRO'
  }
  return undefined
}

describe('ensureDefaultCategories', () => {
  it('em banco vazio cria as 80 e resolve os pais', async () => {
    expect(await ensureDefaultCategories('u1', deps)).toEqual({ created: TOTAL, existing: 0 })
    expect(TOTAL).toBe(80)

    const rows = await repo.listByUser('u1')
    const byId = new Map(rows.map((row) => [row.id, row]))
    for (const def of DEFAULT_CATEGORIES) {
      const row = rows.find((candidate) => candidate.key === def.key)!
      expect(row.isSystem).toBe(def.isSystem ?? false)
      expect(row.nature).toBe(def.nature ?? null)
      expect(row.isArchived).toBe(false)
      expect(byId.get(row.parentId ?? '')?.key).toBe(def.parentKey)
    }
  })

  it('segunda execução não cria nem duplica', async () => {
    await ensureDefaultCategories('u1', deps)
    expect(await ensureDefaultCategories('u1', deps)).toEqual({ created: 0, existing: TOTAL })
    expect(repo.rows).toHaveLength(TOTAL)
  })

  it('CA-05: mantém o nome editado e não duplica', async () => {
    await ensureDefaultCategories('u1', deps)
    await updateCategory('u1', await idOf('u1', 'supermercado'), { name: 'Feira e Mercado' }, deps)

    expect(await ensureDefaultCategories('u1', deps)).toEqual({ created: 0, existing: TOTAL })
    const matches = repo.rows.filter((row) => row.key === 'supermercado')
    expect(matches).toHaveLength(1)
    expect(matches[0].name).toBe('Feira e Mercado')
  })

  it('preserva natureza, ícone e cor editados', async () => {
    await ensureDefaultCategories('u1', deps)
    await updateCategory(
      'u1',
      await idOf('u1', 'streaming'),
      { nature: 'NEED', icon: 'tv', colorKey: 'cat-1' },
      deps,
    )
    await ensureDefaultCategories('u1', deps)
    expect(repo.rows.find((row) => row.key === 'streaming')).toMatchObject({
      nature: 'NEED',
      icon: 'tv',
      colorKey: 'cat-1',
    })
  })

  it('categoria arquivada continua arquivada e não é recriada', async () => {
    await ensureDefaultCategories('u1', deps)
    await updateCategory('u1', await idOf('u1', 'lazer'), { isArchived: true }, deps)

    expect((await ensureDefaultCategories('u1', deps)).created).toBe(0)
    const lazer = repo.rows.filter((row) => row.key === 'lazer')
    expect(lazer).toHaveLength(1)
    expect(lazer[0].isArchived).toBe(true)
  })

  it('categoria apagada à mão é recriada (key ausente); filhos órfãos são reatados', async () => {
    await ensureDefaultCategories('u1', deps)
    repo.removeByKey('u1', 'mercado') // FK SetNull deixa os 4 filhos sem pai

    expect(await ensureDefaultCategories('u1', deps)).toEqual({ created: 1, existing: TOTAL - 1 })
    const mercadoId = await idOf('u1', 'mercado')
    for (const key of [
      'supermercado',
      'hortifruti-padaria',
      'acougue-peixaria',
      'limpeza-higiene',
    ]) {
      expect(repo.rows.find((row) => row.key === key)?.parentId, key).toBe(mercadoId)
    }
    expect(repo.rows).toHaveLength(TOTAL)
  })

  it('apagar só um filho recria apenas ele', async () => {
    await ensureDefaultCategories('u1', deps)
    repo.removeByKey('u1', 'gas')
    expect(await ensureDefaultCategories('u1', deps)).toEqual({ created: 1, existing: TOTAL - 1 })
  })

  it('não toca categorias customizadas e isola usuários', async () => {
    await ensureDefaultCategories('u1', deps)
    const custom = await createCategory('u1', { name: 'Minha', type: 'INCOME' }, deps)
    expect(await ensureDefaultCategories('u2', deps)).toEqual({ created: TOTAL, existing: 0 })
    await ensureDefaultCategories('u1', deps)
    expect(repo.rows.filter((row) => row.userId === 'u1')).toHaveLength(TOTAL + 1)
    expect(repo.rows.filter((row) => row.userId === 'u2')).toHaveLength(TOTAL)
    expect(repo.rows.some((row) => row.id === custom.id)).toBe(true)
  })
})

describe('listCategoryTree', () => {
  it('devolve a árvore com effectiveNature; supermercado NEED, seguro-veiculo MUST, receita null', async () => {
    await ensureDefaultCategories('u1', deps)
    const tree = await listCategoryTree('u1', {}, deps)
    expect(tree).toHaveLength(20)

    const flat = tree.flatMap((node) => [node, ...node.children])
    const nature = (key: string) => flat.find((node) => node.key === key)?.effectiveNature
    expect(nature('supermercado')).toBe('NEED')
    expect(nature('seguro-veiculo')).toBe('MUST')
    expect(nature('moveis-eletro')).toBe('WANT')
    expect(nature('salario-clt')).toBeNull()
    expect(
      flat.filter((node) => node.type === 'EXPENSE').every((node) => node.effectiveNature),
    ).toBe(true)
  })

  it('não mistura categorias de outro usuário', async () => {
    await ensureDefaultCategories('u1', deps)
    expect(await listCategoryTree('u2', {}, deps)).toEqual([])
  })

  it('CA-06: arquivar lazer funciona e some da árvore padrão (volta com includeArchived)', async () => {
    await ensureDefaultCategories('u1', deps)
    await updateCategory('u1', await idOf('u1', 'lazer'), { isArchived: true }, deps)

    const tree = await listCategoryTree('u1', {}, deps)
    expect(tree.some((node) => node.key === 'lazer')).toBe(false)
    const all = await listCategoryTree('u1', { includeArchived: true }, deps)
    expect(all.some((node) => node.key === 'lazer')).toBe(true)
  })
})

describe('updateCategory', () => {
  beforeEach(async () => {
    await ensureDefaultCategories('u1', deps)
  })

  it('CA-06: arquivar categoria de sistema -> CATEGORY_SYSTEM_LOCKED, sem alterar nada', async () => {
    const id = await idOf('u1', 'juros-encargos')
    expect(await codeOf(updateCategory('u1', id, { isArchived: true }, deps))).toBe(
      'CATEGORY_SYSTEM_LOCKED',
    )
    expect(repo.rows.find((row) => row.id === id)?.isArchived).toBe(false)
  })

  it('sistema pode ser renomeada, mas não trocar key/type', async () => {
    const id = await idOf('u1', 'sem-categoria')
    const node = await updateCategory('u1', id, { name: 'A classificar' }, deps)
    expect(node).toMatchObject({ name: 'A classificar', key: 'sem-categoria', isSystem: true })
    expect(await codeOf(updateCategory('u1', id, { key: 'x' }, deps))).toBe(
      'CATEGORY_SYSTEM_LOCKED',
    )
    expect(await codeOf(updateCategory('u1', id, { type: 'INCOME' }, deps))).toBe(
      'CATEGORY_SYSTEM_LOCKED',
    )
  })

  it('muda natureza de despesa e reflete em effectiveNature dos filhos que herdam', async () => {
    await updateCategory('u1', await idOf('u1', 'compras'), { nature: 'NEED' }, deps)
    const tree = await listCategoryTree('u1', {}, deps)
    const compras = tree.find((node) => node.key === 'compras')!
    expect(compras.effectiveNature).toBe('NEED')
    expect(compras.children.every((child) => child.effectiveNature === 'NEED')).toBe(true)
  })

  it('devolve effectiveNature do filho que herda', async () => {
    const node = await updateCategory(
      'u1',
      await idOf('u1', 'farmacia'),
      { colorKey: 'cat-2' },
      deps,
    )
    expect(node.effectiveNature).toBe('NEED')
  })

  it('não encontra id inexistente nem de outro usuário', async () => {
    expect(await codeOf(updateCategory('u1', 'nao-existe', { name: 'X' }, deps))).toBe(
      'CATEGORY_NOT_FOUND',
    )
    const id = await idOf('u1', 'lazer')
    expect(await codeOf(updateCategory('u2', id, { name: 'X' }, deps))).toBe('CATEGORY_NOT_FOUND')
  })

  it('patch vazio não grava', async () => {
    const id = await idOf('u1', 'lazer')
    const before = repo.rows.find((row) => row.id === id)!.updatedAt
    await updateCategory('u1', id, {}, deps)
    expect(repo.rows.find((row) => row.id === id)!.updatedAt).toEqual(before)
  })
})

describe('createCategory', () => {
  beforeEach(async () => {
    await ensureDefaultCategories('u1', deps)
  })

  it('cria filha de pai padrão com key custom-*, isSystem=false e ordem ao final', async () => {
    const parentId = await idOf('u1', 'lazer')
    const node = await createCategory('u1', { name: 'Jogos de tabuleiro', parentId }, deps)
    expect(node).toMatchObject({
      key: 'custom-jogos-de-tabuleiro',
      isSystem: false,
      parentId,
      type: 'EXPENSE',
      effectiveNature: 'WANT',
      sortOrder: 60,
    })
  })

  it('gera sufixo numérico quando o slug já existe', async () => {
    const first = await createCategory('u1', { name: 'Extra', type: 'INCOME' }, deps)
    const second = await createCategory('u1', { name: 'Extra', type: 'INCOME' }, deps)
    expect([first.key, second.key]).toEqual(['custom-extra', 'custom-extra-2'])
  })

  it('rejeita pai que já é filho (máx. 2 níveis) e pai inexistente', async () => {
    const childId = await idOf('u1', 'hobbies')
    expect(await codeOf(createCategory('u1', { name: 'Neto', parentId: childId }, deps))).toBe(
      'CATEGORY_MAX_DEPTH',
    )
    expect(await codeOf(createCategory('u1', { name: 'X', parentId: 'nada' }, deps))).toBe(
      'CATEGORY_NOT_FOUND',
    )
  })

  it('não aceita pai de outro usuário', async () => {
    await ensureDefaultCategories('u2', deps)
    const foreign = await idOf('u2', 'lazer')
    expect(await codeOf(createCategory('u1', { name: 'X', parentId: foreign }, deps))).toBe(
      'CATEGORY_NOT_FOUND',
    )
  })

  it('raiz de despesa precisa de natureza', async () => {
    expect(await codeOf(createCategory('u1', { name: 'X', type: 'EXPENSE' }, deps))).toBe(
      'CATEGORY_INVALID',
    )
    const node = await createCategory(
      'u1',
      { name: 'Pet extra', type: 'EXPENSE', nature: 'NEED' },
      deps,
    )
    expect(node.effectiveNature).toBe('NEED')
  })
})

describe('seedCategoriesForOwner / formatSeedSummary (CA-01)', () => {
  it('semeia o único usuário e imprime created/existing nas duas execuções', async () => {
    const seed = () => seedCategoriesForOwner({ listUserIds: async () => ['u1'], categories: repo })
    const first = await seed()
    expect(first).toEqual({ ok: true, created: 80, existing: 0 })
    expect(formatSeedSummary(first as { created: number; existing: number })).toBe(
      'created=80 existing=0',
    )
    const second = await seed()
    expect(second).toEqual({ ok: true, created: 0, existing: 80 })
    expect(formatSeedSummary(second as { created: number; existing: number })).toBe(
      'created=0 existing=80',
    )
  })

  it('recusa sem usuário (orienta owner:create) e com mais de um, sem gravar', async () => {
    const none = await seedCategoriesForOwner({ listUserIds: async () => [], categories: repo })
    expect(none).toMatchObject({ ok: false, reason: 'NO_USER' })
    expect(none.ok === false && none.message).toContain('npm run owner:create')

    const many = await seedCategoriesForOwner({
      listUserIds: async () => ['u1', 'u2'],
      categories: repo,
    })
    expect(many).toMatchObject({ ok: false, reason: 'MULTIPLE_USERS' })
    expect(repo.rows).toHaveLength(0)
  })
})
