import { BUSINESS_TIME_ZONE, calendarDayInZone } from './calendar'

export type StatementStatus = 'OPEN' | 'CLOSED' | 'PAID' | 'OVERDUE'

export interface StatementStatusInput {
  /** Dia de fechamento (meio-dia UTC). */
  closingDate: Date
  /** Dia de vencimento (meio-dia UTC). */
  dueDate: Date
  /** Total líquido da fatura (cobranças - créditos); pode ser <= 0 após estornos. */
  totalAmount: number
  paidAmount: number
  /** Instante de referência (injetado; nada de relógio implícito, RN-12). */
  now: Date
  /** Fuso do "hoje" de negócio; padrão `America/Sao_Paulo`. */
  timeZone?: string
}

/**
 * Status da fatura (CA do FC2-F1-03):
 * - `PAID`: há valor a pagar (`total > 0`) e nada em aberto; ou a fatura já fechou sem saldo
 *   a pagar (vazia ou com crédito de estorno, `total <= 0`).
 * - `OVERDUE`: venceu e ainda há valor em aberto.
 * - `CLOSED`: fechou (o dia de fechamento já passou) e ainda não venceu / sem atraso.
 * - `OPEN`: ainda recebe compras (hoje <= dia de fechamento).
 *
 * "Hoje" é o dia de calendário de `now` em `timeZone`; no dia do fechamento a fatura ainda é
 * `OPEN` e no dia do vencimento ainda não é `OVERDUE`.
 */
export function getStatementStatus(input: StatementStatusInput): StatementStatus {
  const today = calendarDayInZone(input.now, input.timeZone ?? BUSINESS_TIME_ZONE)
  const closed = today.getTime() > input.closingDate.getTime()

  if (input.totalAmount <= 0) return closed ? 'PAID' : 'OPEN'

  const open = Math.max(0, input.totalAmount - input.paidAmount)
  if (open === 0) return 'PAID'
  if (today.getTime() > input.dueDate.getTime()) return 'OVERDUE'
  if (closed) return 'CLOSED'
  return 'OPEN'
}
