/**
 * Helpers de dinheiro para testes. Dinheiro é sempre centavos `Int`.
 *
 * brl('1.000,00') -> 100000
 * brl('-R$ 10,50') -> -1050
 * cents(10.5) -> 1050
 */
export function brl(value: string): number {
  const raw = value.trim()
  const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw)
  const digits = raw.replace(/[R$\s()+-]/g, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(digits)) {
    throw new Error(`brl: valor inválido "${value}"`)
  }
  const [intPart, decPart = ''] = digits.replace(/\./g, '').split(',')
  const centavos = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'))
  return negative ? -centavos : centavos
}

/** Converte reais (number) em centavos inteiros, sem erro de ponto flutuante. */
export function cents(reais: number): number {
  if (!Number.isFinite(reais)) {
    throw new Error(`cents: valor inválido ${reais}`)
  }
  return Math.round(Number((reais * 100).toPrecision(15)))
}
