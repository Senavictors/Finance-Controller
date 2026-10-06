import { describe, expect, it } from 'vitest'
import { resolveCategoryColorKey } from './category-color'

describe('resolveCategoryColorKey', () => {
  it('mantém chaves válidas', () => {
    expect(resolveCategoryColorKey('cat-3')).toBe('cat-3')
    expect(resolveCategoryColorKey('cat-1')).toBe('cat-1')
    expect(resolveCategoryColorKey('cat-10')).toBe('cat-10')
  })

  it('cai em cat-10 para chave inválida ou ausente', () => {
    expect(resolveCategoryColorKey('xyz')).toBe('cat-10')
    expect(resolveCategoryColorKey('cat-11')).toBe('cat-10')
    expect(resolveCategoryColorKey(undefined)).toBe('cat-10')
    expect(resolveCategoryColorKey(null)).toBe('cat-10')
    expect(resolveCategoryColorKey('')).toBe('cat-10')
  })
})
