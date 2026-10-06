import { describe, expect, it } from 'vitest'
import {
  clampProgress,
  describeAmount,
  formatAmountParts,
  formatAmountText,
  toneForCents,
} from './amount'

describe('toneForCents', () => {
  it('classifica positivo, negativo e zero', () => {
    expect(toneForCents(1)).toBe('in')
    expect(toneForCents(-1)).toBe('out')
    expect(toneForCents(0)).toBe('neutral')
  })

  it('trata entrada inválida como zero', () => {
    expect(toneForCents(Number.NaN)).toBe('neutral')
    expect(toneForCents(-0)).toBe('neutral')
  })
})

describe('formatAmountParts', () => {
  it('decompõe um valor negativo', () => {
    expect(formatAmountParts(-123456)).toEqual({
      sign: '-',
      symbol: 'R$',
      integer: '1.234',
      decimals: '56',
    })
  })

  it('não exibe sinal em zero, mesmo com showSign', () => {
    expect(formatAmountParts(0, { showSign: true }).sign).toBe('')
  })

  it('exibe + só quando showSign e positivo', () => {
    expect(formatAmountParts(100, { showSign: true }).sign).toBe('+')
    expect(formatAmountParts(100).sign).toBe('')
  })

  it('formata valores pequenos com dois dígitos de centavos', () => {
    expect(formatAmountParts(5)).toMatchObject({ integer: '0', decimals: '05' })
  })

  it('não lança em Number.MAX_SAFE_INTEGER', () => {
    expect(() => formatAmountParts(Number.MAX_SAFE_INTEGER)).not.toThrow()
    expect(formatAmountParts(Number.MAX_SAFE_INTEGER).integer).toMatch(/^[\d.]+$/)
  })

  it('trata NaN e infinito como zero', () => {
    expect(formatAmountParts(Number.NaN)).toEqual({
      sign: '',
      symbol: 'R$',
      integer: '0',
      decimals: '00',
    })
    expect(formatAmountParts(Number.POSITIVE_INFINITY).integer).toBe('0')
  })
})

describe('formatAmountText (formato fixado: -R$ 1.234,56)', () => {
  it('coloca o sinal antes do símbolo e usa espaço não separável', () => {
    expect(formatAmountText(-123456)).toBe('-R$ 1.234,56')
    expect(formatAmountText(100000)).toBe('R$ 1.000,00')
    expect(formatAmountText(25000, { showSign: true })).toBe('+R$ 250,00')
  })
})

describe('describeAmount', () => {
  it('descreve o valor completo para leitores de tela', () => {
    expect(describeAmount(-123456)).toBe('menos 1.234 reais e 56 centavos')
    expect(describeAmount(100000)).toBe('1.000 reais e 00 centavos')
  })
})

describe('clampProgress', () => {
  it('limita ao intervalo [0, 1]', () => {
    expect(clampProgress(-1)).toBe(0)
    expect(clampProgress(2)).toBe(1)
    expect(clampProgress(0.4)).toBe(0.4)
    expect(clampProgress(Number.NaN)).toBe(0)
    expect(clampProgress(Number.NEGATIVE_INFINITY)).toBe(0)
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(1)
  })
})
