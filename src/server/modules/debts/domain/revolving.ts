/**
 * Rotativo do cartão (RN-06): custo mensal = não pago x taxa, respeitado o teto legal de juros e
 * encargos (100% do valor original da dívida do cartão), configurável por `capMultiple`.
 */
import { DebtError } from './errors'

export interface RevolvingInput {
  /** Valor da fatura não pago (saldo em rotativo), centavos. */
  unpaid: number
  /** Taxa mensal (fração). */
  monthlyRate: number
  /** Valor original da dívida do cartão, base do teto. Sem ele não há teto. */
  originalPrincipal?: number
  /** Juros e encargos já cobrados sobre essa dívida, centavos. */
  interestAlreadyCharged?: number
  /** Múltiplo do original permitido em juros e encargos (padrão 1 = 100%). */
  capMultiple?: number
}

export interface RevolvingCostDetail {
  /** Custo mensal depois do teto, centavos. */
  cost: number
  /** `round(unpaid * rate)`, antes do teto. */
  uncapped: number
  /** `true` se o teto reduziu o custo. */
  capped: boolean
  /** Quanto ainda cabe sob o teto (`undefined` sem `originalPrincipal`). */
  remainingCap?: number
}

export function revolvingMonthlyCostDetail({
  unpaid,
  monthlyRate,
  originalPrincipal,
  interestAlreadyCharged = 0,
  capMultiple = 1,
}: RevolvingInput): RevolvingCostDetail {
  if (!Number.isInteger(unpaid) || unpaid < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'unpaid deve ser um inteiro de centavos >= 0.')
  }
  if (!Number.isFinite(monthlyRate) || monthlyRate < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'monthlyRate deve ser uma fração >= 0.')
  }
  if (!Number.isFinite(capMultiple) || capMultiple < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'capMultiple deve ser >= 0.')
  }
  if (!Number.isInteger(interestAlreadyCharged) || interestAlreadyCharged < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'interestAlreadyCharged deve ser inteiro >= 0.')
  }
  const uncapped = Math.round(unpaid * monthlyRate)
  if (originalPrincipal === undefined) return { cost: uncapped, uncapped, capped: false }
  if (!Number.isInteger(originalPrincipal) || originalPrincipal < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'originalPrincipal deve ser inteiro >= 0.')
  }
  const remainingCap = Math.max(
    0,
    Math.round(originalPrincipal * capMultiple) - interestAlreadyCharged,
  )
  const cost = Math.min(uncapped, remainingCap)
  return { cost, uncapped, capped: cost < uncapped, remainingCap }
}

/** Custo mensal do rotativo, centavos. Ver `revolvingMonthlyCostDetail` para o breakdown. */
export function revolvingMonthlyCost(input: RevolvingInput): number {
  return revolvingMonthlyCostDetail(input).cost
}
