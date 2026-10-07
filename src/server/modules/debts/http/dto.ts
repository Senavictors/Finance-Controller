import type { LoanRecord } from '../domain/types'
import type { SimulatePayoffResult, PayoffScenario } from '../application/simulate-payoff'

/** JSON não representa `Infinity`: prazo "nunca quita" vira `months: null` + `neverPaysOff`. */
function toScenarioDto(scenario: PayoffScenario) {
  return {
    ...scenario,
    months: Number.isFinite(scenario.months) ? scenario.months : null,
  }
}

export function toSimulationDto(result: SimulatePayoffResult) {
  return {
    ...result,
    baseline: toScenarioDto(result.baseline),
    scenario: toScenarioDto(result.scenario),
  }
}

/** Contrato como a API expõe (taxas em fração; sem campos internos). */
export function toLoanDto(loan: LoanRecord) {
  const { userId: _userId, ...rest } = loan
  void _userId
  return rest
}
