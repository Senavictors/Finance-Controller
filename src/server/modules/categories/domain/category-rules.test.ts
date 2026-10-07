import { describe, expect, it } from 'vitest'

import {
  buildCategoryTree,
  CATEGORY_KEY_PATTERN,
  generateCustomKey,
  normalizeName,
  planCategoryUpdate,
  planNewCategory,
  slugify,
} from './category-rules'
import { CategoryError } from './errors'
import type { CategoryRecord } from './types'

function record(overrides: Partial<CategoryRecord> & { id: string; key: string }): CategoryRecord {
  return {
    userId: 'u1',
    name: overrides.key,
    type: 'EXPENSE',
    nature: null,
    icon: 'tag',
    colorKey: 'cat-10',
    parentId: null,
    sortOrder: 10,
    isSystem: false,
    isArchived: false,
    createdAt: new Date('2026-10-05T12:00:00Z'),
    updatedAt: new Date('2026-10-05T12:00:00Z'),
    ...overrides,
  }
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return error instanceof CategoryError ? error.code : 'OUTRO'
  }
  return undefined
}

describe('slugify / generateCustomKey', () => {
  it('remove acentos e símbolos', () => {
    expect(slugify('Feira & Mercado')).toBe('feira-mercado')
    expect(slugify('  Ação  Social!! ')).toBe('acao-social')
    expect(slugify('???')).toBe('')
  })

  it('gera custom-<slug> e sufixo numérico na colisão; sempre kebab-case', () => {
    expect(generateCustomKey('Feira', new Set())).toBe('custom-feira')
    expect(generateCustomKey('Feira', new Set(['custom-feira']))).toBe('custom-feira-2')
    expect(generateCustomKey('Feira', new Set(['custom-feira', 'custom-feira-2']))).toBe(
      'custom-feira-3',
    )
    const empty = generateCustomKey('???', new Set())
    expect(empty).toBe('custom-categoria')
    expect(empty).toMatch(CATEGORY_KEY_PATTERN)
    expect(generateCustomKey('x'.repeat(200), new Set()).length).toBeLessThanOrEqual(48)
  })
})

describe('normalizeName', () => {
  it('apara e colapsa espaços; rejeita vazio e longo demais', () => {
    expect(normalizeName('  Feira   e  Mercado ')).toBe('Feira e Mercado')
    expect(codeOf(() => normalizeName('   '))).toBe('CATEGORY_INVALID')
    expect(codeOf(() => normalizeName('a'.repeat(61)))).toBe('CATEGORY_INVALID')
  })
})

describe('planNewCategory', () => {
  const root = record({
    id: 'r',
    key: 'lazer',
    nature: 'WANT',
    icon: 'party-popper',
    colorKey: 'cat-5',
  })
  const child = record({ id: 'c', key: 'hobbies', parentId: 'r' })

  it('filha herda tipo, ícone e cor do pai; isSystem = false', () => {
    const data = planNewCategory({ name: 'Jogos de tabuleiro', parentId: 'r' }, root, new Set())
    expect(data).toMatchObject({
      key: 'custom-jogos-de-tabuleiro',
      type: 'EXPENSE',
      nature: null,
      icon: 'party-popper',
      colorKey: 'cat-5',
      parentId: 'r',
      isSystem: false,
    })
  })

  it('rejeita pai que já é filho (máx. 2 níveis)', () => {
    expect(codeOf(() => planNewCategory({ name: 'Neto', parentId: 'c' }, child, new Set()))).toBe(
      'CATEGORY_MAX_DEPTH',
    )
  })

  it('rejeita tipo divergente do pai', () => {
    expect(
      codeOf(() => planNewCategory({ name: 'X', parentId: 'r', type: 'INCOME' }, root, new Set())),
    ).toBe('CATEGORY_INVALID')
  })

  it('raiz exige tipo; raiz de despesa exige natureza; receita não aceita natureza', () => {
    expect(codeOf(() => planNewCategory({ name: 'X' }, null, new Set()))).toBe('CATEGORY_INVALID')
    expect(codeOf(() => planNewCategory({ name: 'X', type: 'EXPENSE' }, null, new Set()))).toBe(
      'CATEGORY_INVALID',
    )
    expect(
      codeOf(() => planNewCategory({ name: 'X', type: 'INCOME', nature: 'NEED' }, null, new Set())),
    ).toBe('CATEGORY_INVALID')
    expect(planNewCategory({ name: 'Extra', type: 'INCOME' }, null, new Set())).toMatchObject({
      nature: null,
      icon: 'tag',
      colorKey: 'cat-10',
      parentId: null,
    })
    expect(
      planNewCategory({ name: 'Extra', type: 'EXPENSE', nature: 'WANT' }, null, new Set()).nature,
    ).toBe('WANT')
  })

  it('valida ícone e cor (nunca hex)', () => {
    expect(
      codeOf(() =>
        planNewCategory({ name: 'X', type: 'INCOME', colorKey: '#ff0000' }, null, new Set()),
      ),
    ).toBe('CATEGORY_INVALID')
    expect(
      codeOf(() =>
        planNewCategory({ name: 'X', type: 'INCOME', colorKey: 'cat-11' }, null, new Set()),
      ),
    ).toBe('CATEGORY_INVALID')
    expect(
      codeOf(() =>
        planNewCategory({ name: 'X', type: 'INCOME', icon: 'Not Valid' }, null, new Set()),
      ),
    ).toBe('CATEGORY_INVALID')
  })
})

describe('planCategoryUpdate', () => {
  const system = record({ id: 's', key: 'iof', isSystem: true, nature: null, parentId: 'p' })
  const custom = record({ id: 'x', key: 'custom-a', nature: 'WANT' })
  const customChild = record({ id: 'y', key: 'custom-b', parentId: 'x' })
  const income = record({ id: 'i', key: 'salario-clt', type: 'INCOME' })

  it('categoria de sistema: renomeia, mas não arquiva nem muda key/type', () => {
    expect(planCategoryUpdate(system, { name: 'Imposto sobre operações' })).toEqual({
      name: 'Imposto sobre operações',
    })
    expect(codeOf(() => planCategoryUpdate(system, { isArchived: true }))).toBe(
      'CATEGORY_SYSTEM_LOCKED',
    )
    expect(codeOf(() => planCategoryUpdate(system, { key: 'outra' }))).toBe(
      'CATEGORY_SYSTEM_LOCKED',
    )
    expect(codeOf(() => planCategoryUpdate(system, { type: 'INCOME' }))).toBe(
      'CATEGORY_SYSTEM_LOCKED',
    )
    // reenviar o mesmo valor não é mudança
    expect(planCategoryUpdate(system, { key: 'iof', type: 'EXPENSE' })).toEqual({})
    // desarquivar uma de sistema (já ativa) é permitido
    expect(planCategoryUpdate(system, { isArchived: false })).toEqual({ isArchived: false })
  })

  it('categoria comum: arquiva, mas key/type continuam imutáveis (CATEGORY_INVALID)', () => {
    expect(planCategoryUpdate(custom, { isArchived: true })).toEqual({ isArchived: true })
    expect(codeOf(() => planCategoryUpdate(custom, { key: 'outra' }))).toBe('CATEGORY_INVALID')
    expect(codeOf(() => planCategoryUpdate(custom, { type: 'INCOME' }))).toBe('CATEGORY_INVALID')
  })

  it('valida cor, ícone, ordem e nome', () => {
    expect(planCategoryUpdate(custom, { colorKey: 'cat-3', icon: 'coffee', sortOrder: 0 })).toEqual(
      {
        colorKey: 'cat-3',
        icon: 'coffee',
        sortOrder: 0,
      },
    )
    expect(codeOf(() => planCategoryUpdate(custom, { colorKey: '#fff' }))).toBe('CATEGORY_INVALID')
    expect(codeOf(() => planCategoryUpdate(custom, { icon: 'Coffee!' }))).toBe('CATEGORY_INVALID')
    expect(codeOf(() => planCategoryUpdate(custom, { sortOrder: -1 }))).toBe('CATEGORY_INVALID')
    expect(codeOf(() => planCategoryUpdate(custom, { sortOrder: 1.5 }))).toBe('CATEGORY_INVALID')
    expect(codeOf(() => planCategoryUpdate(custom, { name: '  ' }))).toBe('CATEGORY_INVALID')
  })

  it('natureza: só despesa; raiz não pode voltar a null; filho pode herdar de novo', () => {
    expect(planCategoryUpdate(custom, { nature: 'MUST' })).toEqual({ nature: 'MUST' })
    expect(codeOf(() => planCategoryUpdate(custom, { nature: null }))).toBe('CATEGORY_INVALID')
    expect(planCategoryUpdate(customChild, { nature: null })).toEqual({ nature: null })
    expect(codeOf(() => planCategoryUpdate(income, { nature: 'NEED' }))).toBe('CATEGORY_INVALID')
  })
})

describe('buildCategoryTree', () => {
  const records = [
    record({ id: 'b', key: 'b', name: 'B', nature: 'NEED', sortOrder: 20 }),
    record({ id: 'a', key: 'a', name: 'A', nature: 'MUST', sortOrder: 10 }),
    record({ id: 'a2', key: 'a2', name: 'A2', parentId: 'a', sortOrder: 20 }),
    record({ id: 'a1', key: 'a1', name: 'A1', parentId: 'a', sortOrder: 10, nature: 'WANT' }),
    record({ id: 'i', key: 'i', name: 'I', type: 'INCOME', sortOrder: 30 }),
    record({ id: 'z', key: 'z', name: 'Z', nature: 'WANT', sortOrder: 40, isArchived: true }),
    record({ id: 'z1', key: 'z1', name: 'Z1', parentId: 'z', sortOrder: 10 }),
  ]

  it('ordena por sortOrder, calcula effectiveNature e não vaza userId/datas', () => {
    const tree = buildCategoryTree(records)
    expect(tree.map((node) => node.key)).toEqual(['a', 'b', 'i'])
    const a = tree[0]
    expect(a.effectiveNature).toBe('MUST')
    expect(a.children.map((c) => [c.key, c.effectiveNature])).toEqual([
      ['a1', 'WANT'],
      ['a2', 'MUST'],
    ])
    expect(tree[2].effectiveNature).toBeNull()
    expect(a).not.toHaveProperty('userId')
    expect(a).not.toHaveProperty('createdAt')
  })

  it('arquivada some junto com os filhos; includeArchived mostra tudo', () => {
    expect(buildCategoryTree(records).some((node) => node.key === 'z')).toBe(false)
    const full = buildCategoryTree(records, { includeArchived: true })
    expect(full.map((node) => node.key)).toEqual(['a', 'b', 'i', 'z'])
    expect(full[3].children.map((c) => c.key)).toEqual(['z1'])
  })

  it('filho arquivado some só ele', () => {
    const withArchivedChild = records.map((r) => (r.id === 'a1' ? { ...r, isArchived: true } : r))
    expect(buildCategoryTree(withArchivedChild)[0].children.map((c) => c.key)).toEqual(['a2'])
  })

  it('órfão (pai fora da lista) vira raiz sem lançar', () => {
    const tree = buildCategoryTree([record({ id: 'o', key: 'o', parentId: 'sumiu' })])
    expect(tree).toHaveLength(1)
    expect(tree[0].effectiveNature).toBeNull()
  })
})
