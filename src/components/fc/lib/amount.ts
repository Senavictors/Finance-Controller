import { formatCurrency } from '@/lib/format'

export type SignTone = 'in' | 'out' | 'neutral'

export type AmountParts = {
  /** '-' para negativo, '+' quando `showSign` e positivo, '' caso contrário */
  sign: '-' | '+' | ''
  symbol: string
  /** parte inteira com separador de milhar pt-BR (ex.: '1.234') */
  integer: string
  /** centavos com dois dígitos (ex.: '56') */
  decimals: string
}

/** Entrada não finita vira 0; fração de centavo é arredondada (valores são Int, ADR-002). */
function normalizeCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0
  return Math.round(cents) + 0 // `+ 0` converte -0 em 0
}

/** Sinal financeiro: positivo = entrada, negativo = saída, zero = neutro. */
export function toneForCents(cents: number): SignTone {
  const value = normalizeCents(cents)
  if (value > 0) return 'in'
  if (value < 0) return 'out'
  return 'neutral'
}

const CURRENCY_PATTERN = /^(\D*?)\s*([\d.]+),(\d{2})$/

/** Decompõe o valor em partes, reaproveitando `formatCurrency` (helper único pt-BR/BRL). */
export function formatAmountParts(
  cents: number,
  options: { showSign?: boolean } = {},
): AmountParts {
  const value = normalizeCents(cents)
  const formatted = formatCurrency(Math.abs(value)).replace(/[\s ]+/g, ' ')
  const match = CURRENCY_PATTERN.exec(formatted)
  const symbol = match?.[1]?.trim() || 'R$'
  const integer = match?.[2] ?? '0'
  const decimals = match?.[3] ?? '00'

  let sign: AmountParts['sign'] = ''
  if (value < 0) sign = '-'
  else if (value > 0 && options.showSign) sign = '+'

  return { sign, symbol, integer, decimals }
}

/** Formato de exibição fixado: `-R$ 1.234,56` (sinal antes do símbolo, espaço não separável). */
export function formatAmountText(cents: number, options: { showSign?: boolean } = {}): string {
  const { sign, symbol, integer, decimals } = formatAmountParts(cents, options)
  return `${sign}${symbol} ${integer},${decimals}`
}

/** Texto para leitores de tela: valor completo e numérico, sem depender do formato visual. */
export function describeAmount(cents: number): string {
  const { sign, integer, decimals } = formatAmountParts(cents)
  const prefix = sign === '-' ? 'menos ' : ''
  return `${prefix}${integer} reais e ${decimals} centavos`
}

/** Limita um progresso ao intervalo [0, 1]; NaN vira 0. */
export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}
