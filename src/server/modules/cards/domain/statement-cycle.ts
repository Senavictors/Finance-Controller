import { addDays, clampDay, monthIndexOfKey, monthKeyOf, toCalendarDay, utcNoon } from './calendar'
import { CardsError } from './errors'

/**
 * Ciclo de fatura (ADR-008, FC2-F1-03). Tudo em dias de calendário ao meio-dia UTC (ADR-002):
 * nenhuma função usa o fuso do servidor nem lê o relógio.
 *
 * Regras (RN-02, RN-03):
 * - A fatura é identificada por `statementKey = AAAA-MM` do mês de **vencimento**.
 * - Compra até o dia de fechamento (inclusive) cai na fatura que fecha naquele dia; depois, na
 *   seguinte (`closingInclusive = true`, padrão do 1.x; `false` empurra a compra do próprio dia
 *   de fechamento para a seguinte).
 * - `dueDay <= closingDay` (comparação nominal, não depende do tamanho do mês) vence no mês
 *   seguinte ao do fechamento; senão, no mesmo mês. A chave de vencimento de um cartão é
 *   estável ao longo do ano.
 * - Dias 29/30/31 são limitados ao último dia de cada mês.
 */

export interface StatementCycleInput {
  /** Dia de calendário da compra (meio-dia UTC). */
  purchaseDate: Date
  closingDay: number
  dueDay: number
  /** Padrão `true`: compra no dia do fechamento entra na fatura que fecha naquele dia. */
  closingInclusive?: boolean
}

export interface StatementCycle {
  /** Primeiro dia do ciclo (meio-dia UTC). */
  periodStart: Date
  /** Último dia do ciclo. Com `closingInclusive = true` é o próprio `closingDate`. */
  periodEnd: Date
  /** Dia de fechamento (meio-dia UTC). */
  closingDate: Date
  /** Dia de vencimento (meio-dia UTC). */
  dueDate: Date
  /** `AAAA-MM` do mês de vencimento. */
  statementKey: string
}

function assertBillingDay(name: string, day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new CardsError('INVALID_BILLING_DAY', `${name} deve ser um inteiro de 1 a 31.`, {
      field: name,
    })
  }
}

/** Monta o ciclo a partir do mês (ano, mês 0-11) em que a fatura fecha. */
function cycleFromClosingMonth(
  closingYear: number,
  closingMonth: number,
  closingDay: number,
  dueDay: number,
  closingInclusive: boolean,
): StatementCycle {
  const closingDate = utcNoon(
    closingYear,
    closingMonth,
    clampDay(closingYear, closingMonth, closingDay),
  )
  const previousYear = closingMonth === 0 ? closingYear - 1 : closingYear
  const previousMonth = closingMonth === 0 ? 11 : closingMonth - 1
  const previousClosing = utcNoon(
    previousYear,
    previousMonth,
    clampDay(previousYear, previousMonth, closingDay),
  )

  const dueTotal = closingYear * 12 + closingMonth + (dueDay <= closingDay ? 1 : 0)
  const dueYear = Math.floor(dueTotal / 12)
  const dueMonth = dueTotal - dueYear * 12
  const dueDate = utcNoon(dueYear, dueMonth, clampDay(dueYear, dueMonth, dueDay))

  return {
    periodStart: closingInclusive ? addDays(previousClosing, 1) : previousClosing,
    periodEnd: closingInclusive ? closingDate : addDays(closingDate, -1),
    closingDate,
    dueDate,
    statementKey: monthKeyOf(dueDate),
  }
}

/**
 * Ciclo (e `statementKey`) da fatura que recebe uma compra feita em `purchaseDate`.
 * Ex.: fechamento 10, vencimento 17, compra em 2026-10-05 => fecha 2026-10-10, vence
 * 2026-10-17, chave `2026-10`; compra em 2026-12-20 => fecha 2027-01-10, chave `2027-01`.
 */
export function getStatementCycle(input: StatementCycleInput): StatementCycle {
  const { closingDay, dueDay } = input
  const closingInclusive = input.closingInclusive ?? true
  assertBillingDay('closingDay', closingDay)
  assertBillingDay('dueDay', dueDay)
  if (!(input.purchaseDate instanceof Date) || Number.isNaN(input.purchaseDate.getTime())) {
    throw new CardsError('INVALID_DATE', 'Data da compra inválida.')
  }

  const date = toCalendarDay(input.purchaseDate)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const closingThisMonth = clampDay(year, month, closingDay)
  const afterClosing = closingInclusive ? day > closingThisMonth : day >= closingThisMonth

  const closingYear = afterClosing && month === 11 ? year + 1 : year
  const closingMonth = afterClosing ? (month + 1) % 12 : month
  return cycleFromClosingMonth(closingYear, closingMonth, closingDay, dueDay, closingInclusive)
}

/**
 * Ciclo de uma fatura a partir da sua `statementKey` (mês de vencimento). Serve para criar a
 * fatura-alvo ao mover um lançamento ou registrar um estorno com `statementKey` informada.
 */
export function getStatementCycleByKey(input: {
  statementKey: string
  closingDay: number
  dueDay: number
  closingInclusive?: boolean
}): StatementCycle {
  const { statementKey, closingDay, dueDay } = input
  assertBillingDay('closingDay', closingDay)
  assertBillingDay('dueDay', dueDay)
  let dueIndex: number
  try {
    dueIndex = monthIndexOfKey(statementKey)
  } catch {
    throw new CardsError('INVALID_STATEMENT_KEY', 'statementKey deve estar no formato AAAA-MM.', {
      statementKey,
    })
  }
  const closingIndex = dueIndex - (dueDay <= closingDay ? 1 : 0)
  const closingYear = Math.floor(closingIndex / 12)
  const closingMonth = closingIndex - closingYear * 12
  return cycleFromClosingMonth(
    closingYear,
    closingMonth,
    closingDay,
    dueDay,
    input.closingInclusive ?? true,
  )
}

/** Cartão com ciclo configurado (limite, fechamento e vencimento) segundo as colunas do 2.0. */
export function isCardConfigured(account: {
  type: string
  creditLimit: number | null
  closingDay: number | null
  dueDay: number | null
}): boolean {
  return (
    account.type === 'CREDIT_CARD' &&
    account.creditLimit != null &&
    account.closingDay != null &&
    account.dueDay != null
  )
}

// ---------------------------------------------------------------------------------------
// Legado do 1.x (FC2-F0-01): mantido só porque o teste original (`statement-cycle.test.ts`)
// o exercita. Usa o fuso local do processo e `Date` com horário; NÃO use em código novo.
// ---------------------------------------------------------------------------------------

export type CreditCardAccountConfig = {
  id: string
  userId: string
  type: string
  creditLimit: number | null
  statementClosingDay: number | null
  statementDueDay: number | null
}

/** @deprecated Use `isCardConfigured` (colunas `closingDay`/`dueDay` do 2.0). */
export function isCreditCardBillingConfigured(account: CreditCardAccountConfig) {
  return (
    account.type === 'CREDIT_CARD' &&
    account.creditLimit != null &&
    account.statementClosingDay != null &&
    account.statementDueDay != null
  )
}

function legacyBuildMonthDate(year: number, month: number, day: number, endOfDay = false) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const safeDay = Math.min(day, lastDay)

  return new Date(
    year,
    month,
    safeDay,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  )
}

/** @deprecated Use `getStatementCycle` (meio-dia UTC e `statementKey`). */
export function getCreditCardStatementCycle({
  transactionDate,
  closingDay,
  dueDay,
}: {
  transactionDate: Date
  closingDay: number
  dueDay: number
}) {
  const txDate = new Date(transactionDate)
  txDate.setHours(12, 0, 0, 0)

  let closingYear = txDate.getFullYear()
  let closingMonth = txDate.getMonth()
  let closingDate = legacyBuildMonthDate(closingYear, closingMonth, closingDay, true)

  if (txDate > closingDate) {
    closingMonth += 1
    if (closingMonth > 11) {
      closingMonth = 0
      closingYear += 1
    }
    closingDate = legacyBuildMonthDate(closingYear, closingMonth, closingDay, true)
  }

  let previousClosingYear = closingYear
  let previousClosingMonth = closingMonth - 1
  if (previousClosingMonth < 0) {
    previousClosingMonth = 11
    previousClosingYear -= 1
  }

  const previousClosingDate = legacyBuildMonthDate(
    previousClosingYear,
    previousClosingMonth,
    closingDay,
    true,
  )
  const periodStart = new Date(previousClosingDate)
  periodStart.setDate(periodStart.getDate() + 1)
  periodStart.setHours(0, 0, 0, 0)

  let dueYear = closingYear
  let dueMonth = closingMonth
  let dueDate = legacyBuildMonthDate(dueYear, dueMonth, dueDay, true)

  if (dueDate <= closingDate) {
    dueMonth += 1
    if (dueMonth > 11) {
      dueMonth = 0
      dueYear += 1
    }
    dueDate = legacyBuildMonthDate(dueYear, dueMonth, dueDay, true)
  }

  return {
    periodStart,
    periodEnd: closingDate,
    closingDate,
    dueDate,
  }
}
