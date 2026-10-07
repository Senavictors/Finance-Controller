import { icons } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CATEGORIES,
  SYSTEM_CATEGORY_KEYS,
  type DefaultCategory,
} from './default-categories'
import { CATEGORY_KEY_PATTERN } from './category-rules'
import { resolveNature } from './nature'
import { COLOR_KEYS } from './types'

const byKey = new Map(DEFAULT_CATEGORIES.map((category) => [category.key, category]))

function effectiveNature(category: DefaultCategory) {
  const parent = category.parentKey ? byKey.get(category.parentKey) : null
  return resolveNature(
    { type: category.type, nature: category.nature, parentId: category.parentKey ?? null },
    parent ?? null,
  )
}

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

describe('DEFAULT_CATEGORIES: contagens (80 categorias)', () => {
  const roots = DEFAULT_CATEGORIES.filter((c) => !c.parentKey)
  const children = DEFAULT_CATEGORIES.filter((c) => c.parentKey)

  it('14 pais e 58 filhos de despesa; 6 pais e 2 filhos de receita', () => {
    expect(roots.filter((c) => c.type === 'EXPENSE')).toHaveLength(14)
    expect(children.filter((c) => c.type === 'EXPENSE')).toHaveLength(58)
    expect(roots.filter((c) => c.type === 'INCOME')).toHaveLength(6)
    expect(children.filter((c) => c.type === 'INCOME')).toHaveLength(2)
    expect(DEFAULT_CATEGORIES).toHaveLength(80)
  })
})

describe('DEFAULT_CATEGORIES: integridade (CA-04)', () => {
  it('keys únicas e kebab-case ASCII', () => {
    const keys = DEFAULT_CATEGORIES.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(CATEGORY_KEY_PATTERN)
  })

  it('parentKey aponta para um pai existente, anterior na lista, sem ciclo e com profundidade <= 2', () => {
    const index = new Map(DEFAULT_CATEGORIES.map((c, i) => [c.key, i]))
    for (const category of DEFAULT_CATEGORIES) {
      if (!category.parentKey) continue
      const parent = byKey.get(category.parentKey)
      expect(parent, `pai de ${category.key}`).toBeDefined()
      expect(parent?.parentKey, `${category.key} não pode ter avô`).toBeUndefined()
      expect(index.get(parent!.key)!).toBeLessThan(index.get(category.key)!)
      expect(parent?.type).toBe(category.type)
    }
  })

  it('sortOrder é único entre irmãos', () => {
    const groups = new Map<string, number[]>()
    for (const category of DEFAULT_CATEGORIES) {
      const group = category.parentKey ?? `root:${category.type}`
      groups.set(group, [...(groups.get(group) ?? []), category.sortOrder])
    }
    for (const orders of groups.values()) expect(new Set(orders).size).toBe(orders.length)
  })

  it('não há nome duplicado entre irmãos nem rótulo vazio', () => {
    const seen = new Set<string>()
    for (const category of DEFAULT_CATEGORIES) {
      expect(category.name.trim().length).toBeGreaterThan(0)
      const scope = `${category.parentKey ?? category.type}:${category.name}`
      expect(seen.has(scope), scope).toBe(false)
      seen.add(scope)
    }
  })
})

describe('DEFAULT_CATEGORIES: natureza (CA-02)', () => {
  it('toda despesa tem natureza efetiva e toda receita tem null', () => {
    for (const category of DEFAULT_CATEGORIES) {
      const nature = effectiveNature(category)
      if (category.type === 'EXPENSE') expect(nature, category.key).not.toBeNull()
      else expect(nature, category.key).toBeNull()
    }
  })

  it('natureza explícita só existe em despesa', () => {
    for (const category of DEFAULT_CATEGORIES.filter((c) => c.type === 'INCOME')) {
      expect(category.nature).toBeUndefined()
    }
  })

  it('filhos herdam do pai, salvo natureza própria', () => {
    expect(effectiveNature(byKey.get('supermercado')!)).toBe('NEED')
    expect(effectiveNature(byKey.get('seguro-veiculo')!)).toBe('MUST') // pai NEED
    expect(effectiveNature(byKey.get('moveis-eletro')!)).toBe('WANT') // pai MUST
    expect(effectiveNature(byKey.get('manutencao-casa')!)).toBe('NEED') // pai MUST
    expect(effectiveNature(byKey.get('plano-saude')!)).toBe('MUST') // pai NEED
    expect(effectiveNature(byKey.get('ajuda-familia')!)).toBe('WANT') // pai NEED
    expect(effectiveNature(byKey.get('juros-encargos')!)).toBe('MUST')
    expect(effectiveNature(byKey.get('das-mei')!)).toBe('MUST')
  })

  it('pais têm a natureza prevista na especificação', () => {
    const expected: Record<string, string> = {
      moradia: 'MUST',
      mercado: 'NEED',
      'alimentacao-fora': 'WANT',
      transporte: 'NEED',
      saude: 'NEED',
      educacao: 'NEED',
      assinaturas: 'WANT',
      lazer: 'WANT',
      compras: 'WANT',
      familia: 'NEED',
      'dividas-financeiro': 'MUST',
      impostos: 'MUST',
      doacoes: 'WANT',
      'outros-despesas': 'NEED',
    }
    for (const [key, nature] of Object.entries(expected)) {
      expect(byKey.get(key)?.nature, key).toBe(nature)
    }
  })
})

describe('DEFAULT_CATEGORIES: cor e ícone (CA-03)', () => {
  it('colorKey pertence a cat-1..cat-10', () => {
    for (const category of DEFAULT_CATEGORIES) {
      expect(COLOR_KEYS as readonly string[], category.key).toContain(category.colorKey)
    }
  })

  it('icon é kebab-case e existe em lucide-react', () => {
    for (const category of DEFAULT_CATEGORIES) {
      expect(category.icon.length, category.key).toBeGreaterThan(0)
      expect(category.icon, category.key).toMatch(CATEGORY_KEY_PATTERN)
      expect(icons, `${category.key}: ${category.icon}`).toHaveProperty(toPascalCase(category.icon))
    }
  })

  it('nenhuma cor é hex', () => {
    for (const category of DEFAULT_CATEGORIES) expect(category.colorKey).not.toMatch(/^#/)
  })
})

describe('SYSTEM_CATEGORY_KEYS (CA-07)', () => {
  const required = [
    'juros-encargos',
    'tarifas-bancarias',
    'iof',
    'anuidade-cartao',
    'multas-atrasos',
    'parcelas-emprestimos',
    'das-mei',
    'renda-mei',
    'sem-categoria',
    'outros-receitas',
  ]

  it('contém no mínimo as chaves exigidas pelas outras tasks', () => {
    for (const key of required) expect(SYSTEM_CATEGORY_KEYS as readonly string[]).toContain(key)
  })

  it('todas existem na árvore e estão marcadas isSystem (e só elas)', () => {
    for (const key of SYSTEM_CATEGORY_KEYS) expect(byKey.get(key)?.isSystem, key).toBe(true)
    const flagged = DEFAULT_CATEGORIES.filter((c) => c.isSystem).map((c) => c.key)
    expect([...flagged].sort()).toEqual([...SYSTEM_CATEGORY_KEYS].sort())
  })
})

describe('DEFAULT_CATEGORIES: sem dados pessoais (RN-08)', () => {
  it('nomes são rótulos genéricos sem dígitos', () => {
    for (const category of DEFAULT_CATEGORIES) expect(category.name).not.toMatch(/\d/)
  })
})
