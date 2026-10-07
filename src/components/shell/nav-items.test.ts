import { describe, expect, it } from 'vitest'

import { MORE_ITEM, TAB_ITEMS, activeTabKey } from './nav-items'

describe('TAB_ITEMS (RN-01, ADR-017)', () => {
  it('tem 5 slots na ordem Hoje, Lançamentos, +, Planejar, Cartões', () => {
    expect(TAB_ITEMS.map((item) => item.key)).toEqual([
      'hoje',
      'lancamentos',
      'capturar',
      'planejar',
      'cartoes',
    ])
    expect(TAB_ITEMS.map((item) => item.label)).toEqual([
      'Hoje',
      'Lançamentos',
      'Novo',
      'Planejar',
      'Cartões',
    ])
  })

  it('só o "+" tem href null (nunca navega, RN-02)', () => {
    const withoutHref = TAB_ITEMS.filter((item) => item.href === null)
    expect(withoutHref.map((item) => item.key)).toEqual(['capturar'])
  })

  it('o "+" ocupa o slot central', () => {
    expect(TAB_ITEMS[Math.floor(TAB_ITEMS.length / 2)].key).toBe('capturar')
  })

  it('Mais fica fora da tab bar', () => {
    expect(TAB_ITEMS.some((item) => (item.key as string) === MORE_ITEM.key)).toBe(false)
    expect(MORE_ITEM.href).toBe('/mais')
  })
})

describe('activeTabKey (CA-08)', () => {
  it.each([
    ['/hoje', 'hoje'],
    ['/hoje/', 'hoje'],
    ['/hoje/qualquer', 'hoje'],
    ['/lancamentos', 'lancamentos'],
    ['/lancamentos/abc', 'lancamentos'],
    ['/planejar', 'planejar'],
    ['/cartoes', 'cartoes'],
    ['/cartoes/xyz/fatura', 'cartoes'],
    ['/mais', 'mais'],
    ['/mais/contas', 'mais'],
  ])('%s => %s', (pathname, expected) => {
    expect(activeTabKey(pathname)).toBe(expected)
  })

  it.each(['/login', '/', '', '/hojexyz', '/lancamentosabc', '/ui', '/maisdois'])(
    '%j => null',
    (pathname) => {
      expect(activeTabKey(pathname)).toBeNull()
    },
  )
})
