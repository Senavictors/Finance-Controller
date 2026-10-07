import { describe, expect, it } from 'vitest'

import { resolveNature } from './nature'

describe('resolveNature', () => {
  it('usa a natureza própria do filho, mesmo diferente da do pai', () => {
    expect(
      resolveNature({ type: 'EXPENSE', nature: 'MUST', parentId: 'p' }, { nature: 'NEED' }),
    ).toBe('MUST')
  })

  it('filho sem natureza herda a do pai', () => {
    expect(
      resolveNature({ type: 'EXPENSE', nature: null, parentId: 'p' }, { nature: 'WANT' }),
    ).toBe('WANT')
    expect(
      resolveNature({ type: 'EXPENSE', nature: undefined, parentId: 'p' }, { nature: 'NEED' }),
    ).toBe('NEED')
  })

  it('raiz de despesa usa a própria natureza', () => {
    expect(resolveNature({ type: 'EXPENSE', nature: 'MUST', parentId: null }, null)).toBe('MUST')
  })

  it('raiz de despesa sem natureza resulta em null (dado legado, não lança)', () => {
    expect(resolveNature({ type: 'EXPENSE', nature: null, parentId: null }, null)).toBeNull()
  })

  it('receita é sempre null, ainda que haja natureza gravada', () => {
    expect(resolveNature({ type: 'INCOME', nature: null, parentId: null }, null)).toBeNull()
    expect(
      resolveNature({ type: 'INCOME', nature: 'MUST', parentId: 'p' }, { nature: 'NEED' }),
    ).toBeNull()
  })

  it('lança quando o filho precisa do pai e ele não foi informado', () => {
    expect(() => resolveNature({ type: 'EXPENSE', nature: null, parentId: 'p' }, null)).toThrow(
      /pai/,
    )
  })

  it('não consulta o pai quando o filho tem natureza própria (pai ausente é tolerado)', () => {
    expect(resolveNature({ type: 'EXPENSE', nature: 'WANT', parentId: 'p' }, null)).toBe('WANT')
  })
})
