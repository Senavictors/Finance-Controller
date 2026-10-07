/**
 * Taxas e prioridade (RN-08): a ordem de quitação vem exclusivamente da taxa mensal efetiva.
 */

/** Taxa anual equivalente: `(1 + i)^12 - 1` (fração). 2% a.m. => 26,82% a.a. */
export function annualEquivalent(monthlyRate: number): number {
  if (!Number.isFinite(monthlyRate) || monthlyRate < -1) return Number.NaN
  return Math.expm1(12 * Math.log1p(monthlyRate))
}

export interface RankableDebt {
  id: string
  /** Fração mensal. */
  monthlyRate: number
  /** Custo mensal em centavos. */
  monthlyCost: number
  /** Saldo devedor em centavos. */
  outstanding: number
}

const RATE_EPSILON = 1e-12

/**
 * Ordena por `monthlyRate` decrescente (avalanche); desempate por `monthlyCost` desc, depois
 * `outstanding` desc, depois `id` (determinístico). Não muta a entrada.
 */
export function rankDebtsByRate<T extends RankableDebt>(debts: readonly T[]): T[] {
  return [...debts].sort((a, b) => {
    const rateDiff = b.monthlyRate - a.monthlyRate
    if (Math.abs(rateDiff) > RATE_EPSILON) return rateDiff
    if (b.monthlyCost !== a.monthlyCost) return b.monthlyCost - a.monthlyCost
    if (b.outstanding !== a.outstanding) return b.outstanding - a.outstanding
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}
