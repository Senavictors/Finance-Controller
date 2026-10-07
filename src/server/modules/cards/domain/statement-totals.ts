/**
 * Totais da fatura (RN-05, FC2-F1-03). Os lançamentos do cartão no ledger são assinados:
 * compra < 0, estorno > 0, perna do cartão do pagamento > 0. O estorno **abate** a fatura
 * (corrige o bug do 1.x, que só somava despesas).
 */

export type StatementTxnKind =
  | 'EXPENSE'
  | 'INCOME'
  | 'TRANSFER'
  | 'CARD_PAYMENT'
  | 'FEE'
  | 'INTEREST'
  | 'ADJUSTMENT'

/** O mínimo que o cálculo precisa de um lançamento ligado à fatura. */
export interface StatementTxn {
  kind: StatementTxnKind
  /** Centavos assinados, como no ledger. */
  amount: number
}

export interface StatementTotals {
  /** Cobranças: `-Σ amount` de EXPENSE, FEE, INTEREST e ADJUSTMENT negativo. */
  charges: number
  /** Créditos: `Σ amount` de INCOME (estornos, desconto de antecipação) e ADJUSTMENT positivo. */
  credits: number
  /** `charges - credits`; negativo = crédito a favor. É o `totalAmount` da fatura. */
  net: number
  /** `Σ amount` das pernas CARD_PAYMENT positivas no cartão ligadas à fatura. */
  paid: number
  /** `max(0, net - paid)`: o que ainda falta pagar. */
  open: number
  /** `max(0, -(net - paid))`: crédito sobrando (estorno maior que a fatura ou pagamento a mais). */
  creditBalance: number
  /** Componentes que a UI mostra (explicabilidade). */
  breakdown: {
    expenses: number
    fees: number
    interest: number
    adjustmentDebits: number
    refunds: number
    adjustmentCredits: number
    payments: number
  }
  itemCount: number
}

export function computeStatementTotals(txns: readonly StatementTxn[]): StatementTotals {
  const breakdown = {
    expenses: 0,
    fees: 0,
    interest: 0,
    adjustmentDebits: 0,
    refunds: 0,
    adjustmentCredits: 0,
    payments: 0,
  }

  for (const { kind, amount } of txns) {
    switch (kind) {
      case 'EXPENSE':
        breakdown.expenses += -amount
        break
      case 'FEE':
        breakdown.fees += -amount
        break
      case 'INTEREST':
        breakdown.interest += -amount
        break
      case 'INCOME':
        breakdown.refunds += amount
        break
      case 'ADJUSTMENT':
        if (amount < 0) breakdown.adjustmentDebits += -amount
        else breakdown.adjustmentCredits += amount
        break
      case 'CARD_PAYMENT':
        if (amount > 0) breakdown.payments += amount
        break
      default:
        // TRANSFER não pertence à fatura (não é compra nem pagamento de fatura).
        break
    }
  }

  const charges =
    breakdown.expenses + breakdown.fees + breakdown.interest + breakdown.adjustmentDebits
  const credits = breakdown.refunds + breakdown.adjustmentCredits
  const net = charges - credits
  const paid = breakdown.payments
  const balance = net - paid

  return {
    charges,
    credits,
    net,
    paid,
    open: Math.max(0, balance),
    creditBalance: Math.max(0, -balance),
    breakdown,
    itemCount: txns.length,
  }
}
