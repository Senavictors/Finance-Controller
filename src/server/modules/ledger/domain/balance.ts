import { bucketOf, zeroBuckets } from './rules'
import type {
  AccountKind,
  AccountPosition,
  Buckets,
  LedgerWarning,
  LimitUsage,
  TxnStatus,
} from './types'

/** Saldo por balde de um conjunto de lançamentos: `Σ amount` por status (ADR-019). */
export function computeBalances(
  txns: ReadonlyArray<{ amount: number; status: TxnStatus }>,
): Buckets {
  const total = zeroBuckets()
  for (const txn of txns) {
    total[bucketOf(txn.status)] += txn.amount
  }
  return total
}

export interface LimitUsageInput {
  accountType: AccountKind
  balanceCleared: number
  balancePending: number
  balancePlanned: number
  /** Cheque especial (centavos, >= 0). */
  overdraftLimit: number
  /** Limite do cartão (centavos). `null`/ausente em contas que não são cartão. */
  creditLimit: number | null
}

/**
 * Uso do limite. Nunca bloqueia: o ledger reflete a realidade bancária (RN-04).
 *
 * - `CHECKING`/`BUSINESS` (cheque especial): `position = cleared + pending`;
 *   `used = min(max(0, -position), overdraftLimit)`; `excess = max(0, -position - overdraftLimit)`;
 *   `available = max(0, position) + (overdraftLimit - used)` (quanto ainda pode gastar).
 * - `CREDIT_CARD`: `used = min(max(0, -(cleared + pending + planned)), creditLimit)`;
 *   `available = creditLimit - used`.
 * - Demais tipos: `kind = 'NONE'` (limite 0).
 */
export function limitUsage(input: LimitUsageInput): LimitUsage {
  const { accountType, balanceCleared, balancePending, balancePlanned } = input
  const overdraftLimit = Math.max(0, input.overdraftLimit)

  if (accountType === 'CHECKING' || accountType === 'BUSINESS') {
    const position = balanceCleared + balancePending
    const debt = Math.max(0, -position)
    const used = Math.min(debt, overdraftLimit)
    return {
      kind: 'OVERDRAFT',
      limit: overdraftLimit,
      used,
      excess: Math.max(0, debt - overdraftLimit),
      available: Math.max(0, position) + (overdraftLimit - used),
    }
  }

  if (accountType === 'CREDIT_CARD') {
    const creditLimit = Math.max(0, input.creditLimit ?? 0)
    const debt = Math.max(0, -(balanceCleared + balancePending + balancePlanned))
    const used = Math.min(debt, creditLimit)
    return {
      kind: 'CREDIT',
      limit: creditLimit,
      used,
      excess: Math.max(0, debt - creditLimit),
      available: creditLimit - used,
    }
  }

  return { kind: 'NONE', limit: 0, used: 0, available: 0, excess: 0 }
}

export interface PositionInput extends LimitUsageInput {
  accountId: string
}

/** Avisos derivados da posição (informam, não bloqueiam). */
export function warningsFor(
  accountId: string,
  current: number,
  usage: LimitUsage,
): LedgerWarning[] {
  const warnings: LedgerWarning[] = []
  if (usage.kind === 'OVERDRAFT') {
    if (usage.used > 0) warnings.push({ code: 'OVERDRAFT_USED', accountId })
    if (usage.excess > 0) warnings.push({ code: 'OVERDRAFT_LIMIT_EXCEEDED', accountId })
  } else if (usage.kind === 'CREDIT') {
    if (usage.excess > 0) warnings.push({ code: 'CREDIT_LIMIT_EXCEEDED', accountId })
  } else if (current < 0) {
    warnings.push({ code: 'NEGATIVE_BALANCE_UNEXPECTED', accountId })
  }
  return warnings
}

/**
 * Posição completa de uma conta (o que a UI mostra): saldos por balde, `current`
 * (cleared + pending), `projected` (com previstos), uso do limite e avisos.
 */
export function positionOf(input: PositionInput): AccountPosition {
  const { accountId, accountType, balanceCleared, balancePending, balancePlanned } = input
  const current = balanceCleared + balancePending
  const usage = limitUsage(input)
  return {
    accountId,
    accountType,
    balanceCleared,
    balancePending,
    balancePlanned,
    current,
    projected: current + balancePlanned,
    usage,
    warnings: warningsFor(accountId, current, usage),
  }
}
