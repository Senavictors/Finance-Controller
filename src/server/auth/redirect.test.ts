import { describe, expect, it } from 'vitest'

import { safeCallbackUrl } from './redirect'

describe('safeCallbackUrl', () => {
  it.each([
    ['/hoje', '/hoje'],
    ['/lancamentos?filtro=inbox', '/lancamentos?filtro=inbox'],
    ['/planejar#topo', '/planejar#topo'],
  ])('aceita caminho interno %s', (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected)
  })

  it.each([
    ['//evil.com'],
    ['//evil.example'],
    ['https://x'],
    ['https://evil.example'],
    ['http://evil.example/hoje'],
    ['/\\evil'],
    ['\\\\evil'],
    ['/\t/evil.com'],
    ['/\n/evil.com'],
    ['javascript:alert(1)'],
    ['hoje'],
    [''],
  ])('rejeita %j e cai em /hoje', (input) => {
    expect(safeCallbackUrl(input)).toBe('/hoje')
  })

  it('undefined e null caem em /hoje', () => {
    expect(safeCallbackUrl(undefined)).toBe('/hoje')
    expect(safeCallbackUrl(null)).toBe('/hoje')
  })

  it('evita laço de volta ao /login', () => {
    expect(safeCallbackUrl('/login')).toBe('/hoje')
    expect(safeCallbackUrl('/login?callbackUrl=/hoje')).toBe('/hoje')
  })

  it('respeita o fallback informado', () => {
    expect(safeCallbackUrl('https://x', '/mais')).toBe('/mais')
  })
})
