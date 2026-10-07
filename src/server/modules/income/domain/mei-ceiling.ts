/**
 * Teto anual do MEI (RN-07/08/09). O teto é PARÂMETRO do `MeiProfile` (muda por lei); o padrão
 * documentado é `DEFAULT_MEI_ANNUAL_CEILING_CENTS`. Aritmética inteira (sem ponto flutuante nas
 * comparações). As mensagens são avisos informativos, não orientação fiscal.
 */

/** Teto anual padrão (valor de exemplo/legal vigente na escrita; editável no perfil). */
export const DEFAULT_MEI_ANNUAL_CEILING_CENTS = 8_100_000

/** Divisão inteira arredondando metade para cima (inputs inteiros não negativos). */
function divRound(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}

/**
 * Teto do ano: ano de abertura => `round(teto x mesesDeAtividade / 12)` com
 * `mesesDeAtividade = 12 - mêsDeAbertura + 1` (o mês de abertura conta inteiro); ano posterior
 * à abertura (ou abertura desconhecida) => teto cheio; ano anterior à abertura => 0.
 */
export function proportionalCeiling(input: {
  annualCeiling: number
  openedAt: Date | null
  year: number
}): number {
  const { annualCeiling, openedAt, year } = input
  if (openedAt === null) return annualCeiling
  const openedYear = openedAt.getUTCFullYear()
  if (year < openedYear) return 0
  if (year > openedYear) return annualCeiling
  const monthsOfActivity = 12 - (openedAt.getUTCMonth() + 1) + 1
  return divRound(annualCeiling * monthsOfActivity, 12)
}

export const MEI_LEVELS = ['OK', 'ATTENTION', 'CRITICAL', 'EXCEEDED', 'SEVERE'] as const
export type MeiLevel = (typeof MEI_LEVELS)[number]

/**
 * Nível do acumulado frente ao teto, em inteiros (ADR-032, proposto): `OK` < 80% <= `ATTENTION`
 * < 95% <= `CRITICAL` < 100% <= `EXCEEDED` < 120% <= `SEVERE`. Teto 0 com acumulado 0 => `OK`
 * (sem divisão por zero); teto 0 com acumulado > 0 => `SEVERE` (receita sem teto disponível).
 * O aviso de projeção (`willExceed`/`exceedMonth`) é independente e vem de `projectYearEnd`.
 */
export function meiLevel(input: { accumulated: number; ceiling: number }): MeiLevel {
  const { accumulated, ceiling } = input
  if (ceiling <= 0 && accumulated <= 0) return 'OK'
  const scaled = accumulated * 100
  if (scaled >= ceiling * 120) return 'SEVERE'
  if (scaled >= ceiling * 100) return 'EXCEEDED'
  if (scaled >= ceiling * 95) return 'CRITICAL'
  if (scaled >= ceiling * 80) return 'ATTENTION'
  return 'OK'
}

/** Texto informativo curto (pt-BR); `OK` não tem mensagem. Sem aconselhamento fiscal. */
export function meiMessage(level: MeiLevel): string | null {
  switch (level) {
    case 'ATTENTION':
      return 'Você usou 80% do teto do MEI'
    case 'CRITICAL':
      return 'Você já usou 95% do teto do MEI: a margem restante é pequena'
    case 'EXCEEDED':
      return 'Teto ultrapassado: o excedente de até 20% exige DAS complementar'
    case 'SEVERE':
      return 'Acima de 120% do teto: risco de desenquadramento do MEI, fale com seu contador'
    default:
      return null
  }
}

/** Quanto falta para o teto (negativo quando ultrapassado). */
export function ceilingRemaining(ceiling: number, accumulated: number): number {
  return ceiling - accumulated
}

/** Percentual do teto usado, com 2 casas (80 => 80%). Teto <= 0 => 0. */
export function ceilingUsagePct(accumulated: number, ceiling: number): number {
  if (ceiling <= 0) return 0
  return Math.round((accumulated * 10_000) / ceiling) / 100
}

export interface YearEndProjection {
  /** Realizado dos meses fechados + (para cada mês restante) o maior entre o realizado e a média. */
  projectedTotal: number
  /** Média mensal dos meses de atividade já fechados (0 se nenhum). */
  monthlyAverage: number
  /** `projectedTotal > ceiling`. */
  willExceed: boolean
  /** Primeiro mês (1-12) em que o acumulado projetado passa do teto; `null` se não passa. */
  exceedMonth: number | null
  /** 12 valores: o realizado nos meses fechados e a projeção nos demais (0 antes da atividade). */
  projectedByMonth: number[]
}

/**
 * Projeção de fim de ano (explicável): média dos meses de atividade já fechados, aplicada aos
 * meses restantes (mantendo o realizado quando ele já supera a média). Com 0 meses fechados não
 * há base para média e a projeção é o realizado até agora (sem divisão por zero).
 *
 * `monthsElapsed` = quantos meses do ano já fecharam (0..12; no mês corrente = mês - 1).
 * `firstActiveMonth` = 1..12, primeiro mês de atividade no ano (mês de abertura; padrão 1).
 */
export function projectYearEnd(input: {
  byMonth: readonly number[]
  monthsElapsed: number
  ceiling: number
  firstActiveMonth?: number
}): YearEndProjection {
  const first = Math.min(12, Math.max(1, input.firstActiveMonth ?? 1))
  const closed = Math.min(12, Math.max(0, Math.trunc(input.monthsElapsed)))
  const monthAt = (m: number) => input.byMonth[m - 1] ?? 0

  let closedSum = 0
  for (let m = first; m <= closed; m += 1) closedSum += monthAt(m)
  const closedCount = Math.max(0, closed - first + 1)
  const monthlyAverage = closedCount === 0 ? 0 : divRound(closedSum, closedCount)

  const projectedByMonth: number[] = []
  for (let m = 1; m <= 12; m += 1) {
    if (m < first) projectedByMonth.push(0)
    else if (m <= closed) projectedByMonth.push(monthAt(m))
    else projectedByMonth.push(Math.max(monthAt(m), monthlyAverage))
  }

  let running = 0
  let exceedMonth: number | null = null
  for (let m = 1; m <= 12; m += 1) {
    running += projectedByMonth[m - 1] ?? 0
    if (exceedMonth === null && running > input.ceiling) exceedMonth = m
  }
  return {
    projectedTotal: running,
    monthlyAverage,
    willExceed: running > input.ceiling,
    exceedMonth,
    projectedByMonth,
  }
}
