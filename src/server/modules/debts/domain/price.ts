/**
 * Sistema Price (parcela fixa), ADR-028. Domínio puro: centavos inteiros, taxa mensal como
 * FRAÇÃO (0.02 = 2% a.m.), arredondamento `Math.round` (meio para cima) em cada passo.
 *
 *   PMT     = P * i / (1 - (1 + i)^-n)        (i = 0  =>  round(P / n))
 *   juros_k = round(saldo_(k-1) * i)
 *   amort_k = PMT - juros_k
 *   saldo_k = saldo_(k-1) - amort_k           (a última parcela absorve o resíduo)
 */
import { addMonthsClamped } from './calendar'
import { DebtError } from './errors'

function assertCents(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', `${name} deve ser um inteiro de centavos >= 0.`)
  }
}

function assertRate(rate: number): void {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Taxa mensal deve ser uma fração >= 0.')
  }
}

function assertInstallments(installments: number): void {
  if (!Number.isInteger(installments) || installments < 1) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Número de parcelas deve ser um inteiro >= 1.')
  }
}

/** PMT sem arredondar (usado também pela busca da taxa implícita). */
export function exactPmt(principal: number, monthlyRate: number, installments: number): number {
  if (monthlyRate === 0) return principal / installments
  // 1 - (1+i)^-n  ==  -expm1(-n * log1p(i)): estável para taxas muito pequenas.
  const denominator = -Math.expm1(-installments * Math.log1p(monthlyRate))
  return (principal * monthlyRate) / denominator
}

export interface PriceInput {
  /** Centavos. */
  principal: number
  /** Fração mensal. */
  monthlyRate: number
  installments: number
}

/** Parcela fixa Price, arredondada ao centavo. */
export function priceInstallment({ principal, monthlyRate, installments }: PriceInput): number {
  assertCents(principal, 'principal')
  assertRate(monthlyRate)
  assertInstallments(installments)
  return Math.round(exactPmt(principal, monthlyRate, installments))
}

export interface AmortizationRow {
  /** 1-based. */
  number: number
  /** Meio-dia UTC. */
  dueDate: Date
  /** Juros embutidos na parcela, centavos. */
  interest: number
  /** Amortização do principal, centavos. */
  principal: number
  /** Valor da parcela (= principal + interest). */
  amount: number
  /** Saldo devedor depois de pagar esta parcela. */
  balanceAfter: number
}

export interface AmortizationInput extends PriceInput {
  /** Vencimento da 1ª parcela (meio-dia UTC). */
  firstDueDate: Date
  /**
   * Valor real da parcela do contrato (CET, seguros...). Prevalece sobre o PMT calculado (RN-03);
   * a última parcela ainda absorve o resíduo.
   */
  installmentAmount?: number
}

/**
 * Cronograma de amortização. Soma das amortizações = principal e saldo final = 0, sempre. As
 * datas usam `addMonthsClamped(firstDueDate, k - 1)` (dia 31 vira 28/fev e volta a 31/mar).
 *
 * Lança `DEBT_INCONSISTENT_CONTRACT` se a parcela informada não cobre os juros ou quita o
 * saldo antes da última parcela (taxa e parcela incompatíveis).
 */
export function buildAmortizationSchedule(input: AmortizationInput): AmortizationRow[] {
  const { principal, monthlyRate, installments, firstDueDate, installmentAmount } = input
  assertCents(principal, 'principal')
  assertRate(monthlyRate)
  assertInstallments(installments)
  if (installmentAmount !== undefined) assertCents(installmentAmount, 'installmentAmount')

  const pmt = installmentAmount ?? priceInstallment({ principal, monthlyRate, installments })
  const rows: AmortizationRow[] = []
  let balance = principal

  for (let k = 1; k <= installments; k += 1) {
    const interest = Math.round(balance * monthlyRate)
    const isLast = k === installments
    let amortization: number
    if (isLast) {
      amortization = balance
    } else {
      amortization = pmt - interest
      // PMT calculado pode, em principais minúsculos, arredondar para cima e quitar o saldo
      // um pouco antes do fim: prende ao saldo (as parcelas seguintes ficam zeradas).
      if (installmentAmount === undefined) amortization = Math.min(amortization, balance)
      if (amortization < 0 || amortization > balance) {
        throw new DebtError(
          'DEBT_INCONSISTENT_CONTRACT',
          'Taxa e valor da parcela são incompatíveis com o número de parcelas.',
          { installment: k },
        )
      }
    }
    balance -= amortization
    rows.push({
      number: k,
      dueDate: addMonthsClamped(firstDueDate, k - 1),
      interest,
      principal: amortization,
      amount: amortization + interest,
      balanceAfter: balance,
    })
  }
  return rows
}

export interface ImpliedRateInput {
  principal: number
  installmentAmount: number
  installments: number
}

const RATE_TOLERANCE = 1e-9
const MAX_ITERATIONS = 200
const MAX_RATE_BRACKET = 64

/**
 * Taxa mensal (fração) que faz `PMT(i) = installmentAmount`, por bissecção em `[0, hi]` (hi parte
 * de 1 e dobra até cobrir a parcela), tolerância 1e-9 e no máximo 200 iterações. Devolve 0 se
 * `installmentAmount * installments <= principal` (parcela não cobre nem o principal).
 */
export function impliedMonthlyRate({
  principal,
  installmentAmount,
  installments,
}: ImpliedRateInput): number {
  assertCents(principal, 'principal')
  assertCents(installmentAmount, 'installmentAmount')
  assertInstallments(installments)
  if (principal === 0 || installmentAmount * installments <= principal) return 0

  let low = 0
  let high = 1
  while (exactPmt(principal, high, installments) < installmentAmount && high < MAX_RATE_BRACKET) {
    high *= 2
  }
  for (let i = 0; i < MAX_ITERATIONS && high - low > RATE_TOLERANCE; i += 1) {
    const mid = (low + high) / 2
    if (exactPmt(principal, mid, installments) < installmentAmount) low = mid
    else high = mid
  }
  return (low + high) / 2
}

/**
 * Saldo devedor depois de `paidCount` parcelas pagas (em ordem). 0 pagas = principal do
 * cronograma; todas pagas = 0.
 */
export function outstandingBalance(
  schedule: readonly AmortizationRow[],
  paidCount: number,
): number {
  if (!Number.isInteger(paidCount) || paidCount < 0) {
    throw new DebtError('DEBT_INVALID_INPUT', 'paidCount deve ser um inteiro >= 0.')
  }
  if (schedule.length === 0) return 0
  if (paidCount >= schedule.length) return 0
  if (paidCount === 0) return schedule.reduce((sum, row) => sum + row.principal, 0)
  return schedule[paidCount - 1].balanceAfter
}
