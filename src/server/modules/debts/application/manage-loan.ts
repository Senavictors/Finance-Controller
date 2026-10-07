import { DebtError } from '../domain/errors'
import { assertNoLongDigits, roundRateForStorage } from '../domain/new-loan'
import {
  isInstallmentKind,
  MAX_MONTHLY_RATE,
  type LoanRecord,
  type LoanStatus,
} from '../domain/types'
import type { DebtsDeps, LoanUpdateFields } from './ports'
import { loadAccountPosition, requireLoan } from './shared'

export interface UpdateLoanInput {
  name?: string
  lenderName?: string | null
  accountId?: string | null
  categoryId?: string | null
  notes?: string | null
  /** Só `OVERDRAFT`/`CARD_REVOLVING` (nos parcelados a taxa é do contrato e define o cronograma). */
  monthlyRate?: number
  lateFeeRate?: number
  lateInterestMonthlyRate?: number
  /** `ACTIVE` ou `DEFAULTED`; encerrar é `archiveLoan` e quitar é pagar a última parcela. */
  status?: Extract<LoanStatus, 'ACTIVE' | 'DEFAULTED'>
}

/**
 * Edita campos descritivos do contrato. O cronograma não é recalculado: valor, parcelas e taxa de
 * contratos parcelados não mudam (apague e recadastre se o contrato estava errado).
 */
export async function updateLoan(
  userId: string,
  loanId: string,
  input: UpdateLoanInput,
  deps: DebtsDeps,
): Promise<LoanRecord> {
  const loan = await requireLoan(deps, userId, loanId)
  const patch: LoanUpdateFields = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name || name.length > 80) {
      throw new DebtError('DEBT_INVALID_INPUT', 'Nome deve ter de 1 a 80 caracteres.', {
        field: 'name',
      })
    }
    assertNoLongDigits(name, 'name')
    patch.name = name
  }
  if (input.lenderName !== undefined) {
    const lender = input.lenderName?.trim() || null
    if (lender) {
      if (lender.length > 80) {
        throw new DebtError('DEBT_INVALID_INPUT', 'Credor deve ter no máximo 80 caracteres.', {
          field: 'lenderName',
        })
      }
      assertNoLongDigits(lender, 'lenderName')
    }
    patch.lenderName = lender
  }
  if (input.notes !== undefined) patch.notes = input.notes?.trim().slice(0, 500) || null
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId
  if (input.accountId !== undefined) {
    if (input.accountId !== null) await loadAccountPosition(deps, userId, input.accountId)
    patch.accountId = input.accountId
  }
  if (input.monthlyRate !== undefined) {
    if (isInstallmentKind(loan.kind)) {
      throw new DebtError(
        'DEBT_INVALID_INPUT',
        'A taxa de um contrato parcelado define o cronograma e não pode ser alterada.',
        { field: 'monthlyRate' },
      )
    }
    if (!(input.monthlyRate >= 0 && input.monthlyRate <= MAX_MONTHLY_RATE)) {
      throw new DebtError('DEBT_INVALID_INPUT', 'Taxa mensal fora da faixa.', {
        field: 'monthlyRate',
      })
    }
    patch.monthlyRate = roundRateForStorage(input.monthlyRate)
  }
  for (const field of ['lateFeeRate', 'lateInterestMonthlyRate'] as const) {
    const value = input[field]
    if (value === undefined) continue
    if (!(value >= 0 && value <= 1)) {
      throw new DebtError('DEBT_INVALID_INPUT', 'Multa e mora devem ser frações entre 0 e 1.', {
        field,
      })
    }
    patch[field] = value
  }
  if (input.status !== undefined) {
    if (loan.status === 'PAID_OFF') {
      throw new DebtError('DEBT_INVALID_INPUT', 'Dívida encerrada não pode ser reaberta.', {
        field: 'status',
      })
    }
    patch.status = input.status
  }

  if (Object.keys(patch).length === 0) return loan
  const updated = await deps.loans.updateLoan(userId, loanId, patch)
  if (!updated) throw new DebtError('DEBT_LOAN_NOT_FOUND', 'Dívida não encontrada.')
  return updated
}

/**
 * Encerra o contrato sem apagar o histórico (`status = PAID_OFF`). O schema da F0-02 não tem um
 * status `ARCHIVED`; encerrado deixa de aparecer em `listDebts` e em `listPendingDebtObligations`.
 */
export async function archiveLoan(
  userId: string,
  loanId: string,
  deps: DebtsDeps,
): Promise<LoanRecord> {
  await requireLoan(deps, userId, loanId)
  const updated = await deps.loans.updateLoan(userId, loanId, { status: 'PAID_OFF' })
  if (!updated) throw new DebtError('DEBT_LOAN_NOT_FOUND', 'Dívida não encontrada.')
  return updated
}

/**
 * Apaga o contrato e as parcelas. Bloqueado se alguma parcela foi paga pelo sistema (há lançamento
 * no ledger): nesse caso use `archiveLoan`. Parcelas cadastradas como "já pagas" (sem lançamento)
 * não bloqueiam.
 */
export async function deleteLoan(userId: string, loanId: string, deps: DebtsDeps): Promise<void> {
  await requireLoan(deps, userId, loanId)
  const installments = await deps.loans.listInstallments(userId, loanId)
  if (installments.some((item) => item.status === 'PAID' && item.transactionId !== null)) {
    throw new DebtError(
      'DEBT_LOAN_HAS_PAID_INSTALLMENTS',
      'Esta dívida tem parcelas pagas no sistema. Encerre-a em vez de apagar.',
    )
  }
  const deleted = await deps.loans.deleteLoan(userId, loanId)
  if (!deleted) throw new DebtError('DEBT_LOAN_NOT_FOUND', 'Dívida não encontrada.')
}
