import { addMonthsClamped, isValidDate, toCalendarDay } from './calendar'
import { CardsError } from './errors'

/** Máximo de parcelas de uma compra (RN-10). `installmentCount = 1` é compra à vista. */
export const MAX_INSTALLMENTS = 24

export { addMonthsClamped }

function assertAmount(totalAmount: number): void {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new CardsError(
      'INVALID_AMOUNT',
      'O valor da compra deve ser inteiro, em centavos, e maior que zero.',
    )
  }
}

function assertCount(installmentCount: number): void {
  if (
    !Number.isInteger(installmentCount) ||
    installmentCount < 1 ||
    installmentCount > MAX_INSTALLMENTS
  ) {
    throw new CardsError(
      'INVALID_INSTALLMENT_COUNT',
      `O número de parcelas deve ser um inteiro de 1 a ${MAX_INSTALLMENTS}.`,
      { max: MAX_INSTALLMENTS },
    )
  }
}

/**
 * Divide o total em parcelas inteiras (centavos). O resto vai uma unidade por parcela nas
 * primeiras (10.000 em 3x = 3.334 + 3.333 + 3.333); a soma é sempre o total. Rejeita valor
 * menor que o número de parcelas (`INSTALLMENT_TOO_SMALL`): nenhuma parcela pode ser zero.
 */
export function splitAmountIntoInstallments(totalAmount: number, installmentCount: number) {
  assertAmount(totalAmount)
  assertCount(installmentCount)
  if (totalAmount < installmentCount) {
    throw new CardsError(
      'INSTALLMENT_TOO_SMALL',
      'O valor total não pode ser menor que o número de parcelas (cada parcela precisa de ao menos 1 centavo).',
      { totalAmount, installmentCount },
    )
  }

  const baseAmount = Math.floor(totalAmount / installmentCount)
  const remainder = totalAmount % installmentCount

  return Array.from(
    { length: installmentCount },
    (_, index) => baseAmount + (index < remainder ? 1 : 0),
  )
}

/**
 * Cronograma de parcelas. A parcela `n` vence na data da **compra** + (n-1) meses, sempre a
 * partir da data original (âncora), com o dia limitado ao último dia do mês: compra em
 * 31/01 => 31/01, 28/02, 31/03, 30/04 (sem acúmulo de clamp). Datas em meio-dia UTC.
 */
export function buildInstallmentSchedule(
  totalAmount: number,
  installmentCount: number,
  date: Date,
) {
  if (!isValidDate(date)) throw new CardsError('INVALID_DATE', 'Data da compra inválida.')
  const amounts = splitAmountIntoInstallments(totalAmount, installmentCount)
  const anchor = toCalendarDay(date)

  return amounts.map((amount, index) => ({
    installmentNumber: index + 1,
    amount,
    date: addMonthsClamped(anchor, index),
  }))
}
