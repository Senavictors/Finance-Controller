import { CardsError } from './errors'

/** Tipos de conta que podem pagar uma fatura (BUSINESS é opcional, ver `includeBusiness`). */
const PAYMENT_SOURCE_TYPES = ['CHECKING', 'WALLET', 'SAVINGS'] as const

export interface PaymentCandidate {
  id: string
  type: string
  isArchived: boolean
  /** Saldo atual da conta no ledger (`cleared + pending`), centavos assinados. */
  current: number
  /** Cheque especial, centavos (>= 0). */
  overdraftLimit: number
}

/** Uso do cheque especial para um saldo (mesma conta do ledger: RN-04 de F1-01). */
export function overdraftUsage(
  current: number,
  overdraftLimit: number,
): { used: number; excess: number; available: number } {
  const limit = Math.max(0, overdraftLimit)
  const used = Math.min(Math.max(0, -current), limit)
  const excess = Math.max(0, -current - limit)
  return { used, excess, available: Math.max(0, current) + (limit - used) }
}

/**
 * Conta sugerida para pagar a fatura: entre CHECKING/WALLET/SAVINGS (e BUSINESS se
 * `includeBusiness`) não arquivadas, a de maior `available = max(0, saldo) + (limite - usado)`;
 * empate pelo menor uso do cheque especial e depois pelo id (determinístico). `null` se não
 * houver candidata.
 */
export function suggestPaymentAccount(
  accounts: readonly PaymentCandidate[],
  options: { includeBusiness?: boolean } = {},
): PaymentCandidate | null {
  const allowed: readonly string[] = options.includeBusiness
    ? [...PAYMENT_SOURCE_TYPES, 'BUSINESS']
    : PAYMENT_SOURCE_TYPES
  const ranked = accounts
    .filter((account) => !account.isArchived && allowed.includes(account.type))
    .map((account) => ({ account, usage: overdraftUsage(account.current, account.overdraftLimit) }))
    .sort(
      (a, b) =>
        b.usage.available - a.usage.available ||
        a.usage.used - b.usage.used ||
        (a.account.id < b.account.id ? -1 : 1),
    )
  return ranked[0]?.account ?? null
}

export interface OverdraftWarning {
  /** `true` se, depois de pagar, a conta fica negativa (entra no cheque especial). */
  willUseOverdraft: boolean
  /** Cheque especial usado depois do pagamento (limitado ao limite). */
  usedAfter: number
  /** Quanto passa do limite (> 0 estoura o cheque especial; não bloqueia, RN-07). */
  excessAfter: number
}

/**
 * Aviso de cheque especial de um pagamento: saldo atual da origem menos o valor pago.
 * Ex.: saldo 100,00, limite 500,00, pagamento 300,00 => usa 200,00 e não estoura.
 */
export function overdraftWarning(
  source: { current: number; overdraftLimit: number },
  amount: number,
): OverdraftWarning {
  const after = source.current - amount
  const { used, excess } = overdraftUsage(after, source.overdraftLimit)
  return { willUseOverdraft: after < 0, usedAfter: used, excessAfter: excess }
}

/**
 * Origem do pagamento (RN-06): outra conta que não o próprio cartão e que não seja cartão de
 * crédito. Valores e abertos são validados pelo use-case sobre a fatura.
 */
export function assertPaymentSource(input: {
  source: { id: string; type: string }
  cardAccountId: string
}): void {
  if (input.source.id === input.cardAccountId) {
    throw new CardsError(
      'INVALID_PAYMENT_SOURCE',
      'A origem do pagamento não pode ser o próprio cartão.',
    )
  }
  if (input.source.type === 'CREDIT_CARD') {
    throw new CardsError(
      'INVALID_PAYMENT_SOURCE',
      'Não é possível pagar a fatura com outro cartão de crédito.',
    )
  }
}

/** Valida o valor do pagamento contra o que está em aberto (RN-06). */
export function assertPaymentAmount(input: { amount: number; open: number }): void {
  const { amount, open } = input
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CardsError(
      'INVALID_AMOUNT',
      'O valor do pagamento deve ser inteiro, em centavos, e maior que zero.',
    )
  }
  if (open <= 0) {
    throw new CardsError('STATEMENT_ALREADY_PAID', 'A fatura não tem valor em aberto.')
  }
  if (amount > open) {
    throw new CardsError(
      'STATEMENT_OVERPAYMENT',
      'O pagamento é maior que o valor em aberto da fatura.',
      { open, requested: amount },
    )
  }
}
