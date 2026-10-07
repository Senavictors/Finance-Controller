import { CardsError } from './errors'

/** Kinds de cartão que podem ser estornados (saída do cartão). */
export const REFUNDABLE_KINDS = ['EXPENSE', 'FEE', 'INTEREST'] as const

export interface RefundOriginal {
  kind: string
  /** Centavos assinados do lançamento original (compra < 0). */
  amount: number
}

/**
 * Quanto ainda pode ser estornado do lançamento original: `|original| - Σ estornos
 * anteriores` (estornos são INCOME positivos com `refundOfId` = original). Nunca negativo.
 */
export function refundableAmount(
  original: Pick<RefundOriginal, 'amount'>,
  previousRefunds: ReadonlyArray<{ amount: number }>,
): number {
  const refunded = previousRefunds.reduce((sum, refund) => sum + Math.abs(refund.amount), 0)
  return Math.max(0, Math.abs(original.amount) - refunded)
}

/**
 * Valida um estorno e devolve o valor restante estornável **depois** dele.
 * - original precisa ser uma saída do cartão (EXPENSE, FEE ou INTEREST);
 * - `amount` inteiro > 0 e `<= refundableAmount` (`REFUND_EXCEEDS_ORIGINAL`).
 */
export function validateRefund(input: {
  original: RefundOriginal
  previousRefunds: ReadonlyArray<{ amount: number }>
  amount: number
}): { refundableBefore: number; refundableAfter: number } {
  const { original, previousRefunds, amount } = input
  if (!(REFUNDABLE_KINDS as readonly string[]).includes(original.kind) || original.amount >= 0) {
    throw new CardsError(
      'NOT_REFUNDABLE',
      'Só compras, tarifas e juros do cartão podem ser estornados.',
      {
        kind: original.kind,
      },
    )
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CardsError(
      'INVALID_AMOUNT',
      'O valor do estorno deve ser inteiro, em centavos, e maior que zero.',
    )
  }
  const refundableBefore = refundableAmount(original, previousRefunds)
  if (amount > refundableBefore) {
    throw new CardsError(
      'REFUND_EXCEEDS_ORIGINAL',
      'O estorno é maior que o valor ainda estornável do lançamento original.',
      { refundable: refundableBefore, requested: amount },
    )
  }
  return { refundableBefore, refundableAfter: refundableBefore - amount }
}
