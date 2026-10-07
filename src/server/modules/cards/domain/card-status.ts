/**
 * Convenção de status dos lançamentos de cartão no ledger (FC2-F1-03):
 * - `date` no futuro => `PLANNED` (parcelas ainda não vencidas no calendário de compra);
 * - `date <= hoje` em fatura aberta => `PENDING`;
 * - lançamento em fatura **fechada** (hoje depois do dia de fechamento) => `CLEARED`.
 * Pagamento de fatura: `PLANNED` se a data é futura, senão `CLEARED`.
 * Funções puras: "hoje" é sempre parâmetro (dia de calendário em meio-dia UTC).
 */

export type CardTxnStatus = 'PLANNED' | 'PENDING' | 'CLEARED'

export function desiredCardTxnStatus(input: {
  /** Data do lançamento (meio-dia UTC). */
  date: Date
  /** Dia de fechamento da fatura em que o lançamento está. */
  statementClosingDate: Date
  /** Dia de calendário de hoje (meio-dia UTC). */
  today: Date
}): CardTxnStatus {
  if (input.date.getTime() > input.today.getTime()) return 'PLANNED'
  if (input.today.getTime() > input.statementClosingDate.getTime()) return 'CLEARED'
  return 'PENDING'
}

export function desiredPaymentStatus(input: { date: Date; today: Date }): 'PLANNED' | 'CLEARED' {
  return input.date.getTime() > input.today.getTime() ? 'PLANNED' : 'CLEARED'
}
