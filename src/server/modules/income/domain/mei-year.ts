import {
  ceilingRemaining,
  ceilingUsagePct,
  meiLevel,
  meiMessage,
  projectYearEnd,
  proportionalCeiling,
  type MeiLevel,
  type YearEndProjection,
} from './mei-ceiling'

/**
 * Faturamento do MEI no ano a partir do ledger (RN-08, regime de caixa): soma, por mês do
 * recebimento, os `INCOME` compensados (`CLEARED|RECONCILED`) das contas PJ. Transferências
 * (inclusive PJ -> PF), ajustes, estornos e previstos ficam de fora (dupla contagem é bug).
 */

export interface MeiLedgerRow {
  accountId: string
  kind: string
  status: string
  /** Assinado, como no ledger. */
  amount: number
  /** Meio-dia UTC. */
  date: Date
  refundOfId: string | null
}

export function isMeiRevenue(row: MeiLedgerRow, year: number, accountIds: ReadonlySet<string>) {
  return (
    row.kind === 'INCOME' &&
    (row.status === 'CLEARED' || row.status === 'RECONCILED') &&
    row.amount > 0 &&
    row.refundOfId === null &&
    row.date.getUTCFullYear() === year &&
    accountIds.has(row.accountId)
  )
}

/** 12 valores (janeiro a dezembro) em centavos. */
export function sumMeiByMonth(
  rows: readonly MeiLedgerRow[],
  year: number,
  accountIds: ReadonlySet<string>,
): number[] {
  const byMonth = new Array<number>(12).fill(0)
  for (const row of rows) {
    if (!isMeiRevenue(row, year, accountIds)) continue
    const index = row.date.getUTCMonth()
    byMonth[index] = (byMonth[index] ?? 0) + row.amount
  }
  return byMonth
}

/** Quantos meses do ano já fecharam em `today` (mês corrente ainda aberto: mês - 1). */
export function monthsElapsedIn(year: number, today: Date): number {
  const todayYear = today.getUTCFullYear()
  if (year < todayYear) return 12
  if (year > todayYear) return 0
  return today.getUTCMonth()
}

/** Mês (1-12) em que a atividade começa no ano: o da abertura no ano de abertura, senão janeiro. */
export function firstActiveMonthOf(openedAt: Date | null, year: number): number {
  if (openedAt !== null && openedAt.getUTCFullYear() === year) return openedAt.getUTCMonth() + 1
  return 1
}

export interface MeiYearSummary {
  year: number
  ceiling: number
  accumulated: number
  remaining: number
  /** 80 => 80%. */
  pct: number
  level: MeiLevel
  message: string | null
  byMonth: number[]
  projection: YearEndProjection
}

export function buildMeiYearSummary(input: {
  year: number
  /** Dia de calendário de hoje no fuso de negócio (meio-dia UTC). */
  today: Date
  annualCeilingCents: number
  openedAt: Date | null
  byMonth: readonly number[]
}): MeiYearSummary {
  const byMonth = Array.from({ length: 12 }, (_, i) => input.byMonth[i] ?? 0)
  const ceiling = proportionalCeiling({
    annualCeiling: input.annualCeilingCents,
    openedAt: input.openedAt,
    year: input.year,
  })
  const accumulated = byMonth.reduce((sum, value) => sum + value, 0)
  const level = meiLevel({ accumulated, ceiling })
  return {
    year: input.year,
    ceiling,
    accumulated,
    remaining: ceilingRemaining(ceiling, accumulated),
    pct: ceilingUsagePct(accumulated, ceiling),
    level,
    message: meiMessage(level),
    byMonth,
    projection: projectYearEnd({
      byMonth,
      monthsElapsed: monthsElapsedIn(input.year, input.today),
      ceiling,
      firstActiveMonth: firstActiveMonthOf(input.openedAt, input.year),
    }),
  }
}
