import { LedgerError, type AccountPosition, type LedgerTxn } from '@/server/modules/ledger'
import type { ListTransactionsInput } from '@/server/modules/ledger'
import { DebtError } from '../domain/errors'
import { isInstallmentKind, type InstallmentRecord, type LoanRecord } from '../domain/types'
import type { DebtSummaryInput } from '../domain/summary'
import type { DebtsDeps } from './ports'

/** Status do ledger que compõem o saldo atual da conta (`current = cleared + pending`). */
export const BALANCE_STATUSES = ['PENDING', 'CLEARED', 'RECONCILED'] as const

/** Categorias de sistema usadas nos lançamentos de pagamento (ADR-028, F1-07). */
export const CATEGORY_KEYS = {
  installment: 'parcelas-emprestimos',
  interest: 'juros-encargos',
  fee: 'multas-atrasos',
} as const

export async function requireLoan(
  deps: DebtsDeps,
  userId: string,
  loanId: string,
): Promise<LoanRecord> {
  const loan = await deps.loans.findLoan(userId, loanId)
  if (!loan) throw new DebtError('DEBT_LOAN_NOT_FOUND', 'Dívida não encontrada.')
  return loan
}

/** Posição da conta no ledger; conta inexistente (ou de outro usuário) vira `DEBT_ACCOUNT_NOT_FOUND`. */
export async function loadAccountPosition(
  deps: DebtsDeps,
  userId: string,
  accountId: string,
): Promise<AccountPosition> {
  try {
    return await deps.ledger.getAccountPosition({ userId }, accountId)
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'LEDGER_ACCOUNT_NOT_FOUND') {
      throw new DebtError('DEBT_ACCOUNT_NOT_FOUND', 'Conta não encontrada.', { accountId })
    }
    throw error
  }
}

/** Percorre todas as páginas de `listTransactions` do ledger (cursor, 100 por página). */
export async function collectTransactions(
  deps: DebtsDeps,
  userId: string,
  filter: ListTransactionsInput,
): Promise<LedgerTxn[]> {
  const items: LedgerTxn[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await deps.ledger.listTransactions({ userId }, { ...filter, limit: 100, cursor })
    items.push(...page.items)
    if (!page.nextCursor) return items
    cursor = page.nextCursor
  }
}

/**
 * Monta a entrada de `summarizeDebt` de um contrato: parcelas (parcelados), uso do cheque
 * especial (posição do ledger) ou fatura em rotativo (módulo de cartões, só leitura).
 */
export async function buildSummaryInput(
  deps: DebtsDeps,
  userId: string,
  loan: LoanRecord,
  installments: readonly InstallmentRecord[],
  today: Date,
): Promise<DebtSummaryInput> {
  const base = {
    id: loan.id,
    kind: loan.kind,
    name: loan.name,
    monthlyRate: loan.monthlyRate,
    lateFeeRate: loan.lateFeeRate,
    lateInterestMonthlyRate: loan.lateInterestMonthlyRate,
  }
  if (isInstallmentKind(loan.kind)) {
    return { ...base, installments }
  }

  if (loan.kind === 'OVERDRAFT') {
    if (!loan.accountId) return { ...base, overdraft: { used: 0 } }
    let position: AccountPosition
    try {
      position = await deps.ledger.getAccountPosition({ userId }, loan.accountId)
    } catch (error) {
      if (error instanceof LedgerError && error.code === 'LEDGER_ACCOUNT_NOT_FOUND') {
        return { ...base, overdraft: { used: 0 } }
      }
      throw error
    }
    return {
      ...base,
      overdraft: {
        used: position.usage.used,
        excess: position.usage.excess,
        limit: position.usage.limit,
      },
    }
  }

  // CARD_REVOLVING
  if (!loan.accountId) return { ...base, revolving: { unpaid: 0 } }
  const balance = await deps.cardStatements.revolvingBalance(userId, loan.accountId, today)
  let interestAlreadyCharged = 0
  if (balance.unpaid > 0 && balance.since) {
    const interest = await collectTransactions(deps, userId, {
      accountId: loan.accountId,
      kind: 'INTEREST',
      from: balance.since,
      status: [...BALANCE_STATUSES],
    })
    interestAlreadyCharged = interest.reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
  }
  return {
    ...base,
    revolving: {
      unpaid: balance.unpaid,
      originalPrincipal: balance.originalPrincipal > 0 ? balance.originalPrincipal : undefined,
      interestAlreadyCharged,
    },
  }
}
