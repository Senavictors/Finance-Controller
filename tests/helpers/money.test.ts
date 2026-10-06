import { describe, expect, it } from 'vitest'
import { brl, cents } from './money'

describe('brl', () => {
  it('converte formato brasileiro para centavos', () => {
    expect(brl('1.000,00')).toBe(100000)
    expect(brl('10,5')).toBe(1050)
    expect(brl('0,99')).toBe(99)
    expect(brl('1234')).toBe(123400)
    expect(brl('1.234.567,89')).toBe(123456789)
  })

  it('aceita prefixo R$ e sinal negativo', () => {
    expect(brl('R$ 45,90')).toBe(4590)
    expect(brl('-R$ 10,50')).toBe(-1050)
    expect(brl('-1.234,56')).toBe(-123456)
  })

  it('rejeita valores inválidos', () => {
    expect(() => brl('abc')).toThrow()
    expect(() => brl('1,234,56')).toThrow()
    expect(() => brl('')).toThrow()
  })
})

describe('cents', () => {
  it('converte reais em centavos sem erro de ponto flutuante', () => {
    expect(cents(10.5)).toBe(1050)
    expect(cents(0.1 + 0.2)).toBe(30)
    expect(cents(1.005)).toBe(101)
    expect(cents(-45.9)).toBe(-4590)
  })

  it('rejeita não finitos', () => {
    expect(() => cents(Number.NaN)).toThrow()
  })
})
