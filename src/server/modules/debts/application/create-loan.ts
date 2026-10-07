import { DebtError } from '../domain/errors'
import { planNewLoan, type NewLoanInput } from '../domain/new-loan'
import { isInstallmentKind, type LoanRecord } from '../domain/types'
import type { DebtsDeps } from './ports'
import { loadAccountPosition } from './shared'

export interface CreateLoanResult {
  loan: LoanRecord
  /** `true` quando a taxa foi inferida da parcela informada (exibir como taxa "efetiva"). */
  rateInferred: boolean
  installmentCount: number
}

/**
 * Cadastra um contrato. Parcelados: grava `Loan` + cronograma Price (parcela real do contrato
 * prevalece; taxa inferida se só ela vier) e aceita contrato em andamento
 * (`alreadyPaidInstallments`). `OVERDRAFT`/`CARD_REVOLVING`: sem cronograma; exigem a conta.
 */
export async function createLoan(
  userId: string,
  input: NewLoanInput,
  deps: DebtsDeps,
): Promise<CreateLoanResult> {
  const plan = planNewLoan(input)

  if (plan.loan.accountId) {
    const position = await loadAccountPosition(deps, userId, plan.loan.accountId)
    if (
      plan.loan.kind === 'OVERDRAFT' &&
      !['CHECKING', 'BUSINESS'].includes(position.accountType)
    ) {
      throw new DebtError('DEBT_INVALID_INPUT', 'Cheque especial exige uma conta corrente.', {
        field: 'accountId',
      })
    }
    if (plan.loan.kind === 'CARD_REVOLVING' && position.accountType !== 'CREDIT_CARD') {
      throw new DebtError('DEBT_INVALID_INPUT', 'Rotativo exige um cartão de crédito.', {
        field: 'accountId',
      })
    }
    if (isInstallmentKind(plan.loan.kind) && position.accountType === 'CREDIT_CARD') {
      throw new DebtError(
        'DEBT_INVALID_INPUT',
        'As parcelas são debitadas de uma conta, não de um cartão.',
        {
          field: 'accountId',
        },
      )
    }
  }

  if (plan.loan.accountId && !isInstallmentKind(plan.loan.kind)) {
    const existing = await deps.loans.findLoanByAccount(userId, plan.loan.accountId, plan.loan.kind)
    if (existing) {
      throw new DebtError(
        'DEBT_INVALID_INPUT',
        'Esta conta já tem uma dívida cadastrada deste tipo.',
        {
          field: 'accountId',
          loanId: existing.id,
        },
      )
    }
  }

  const loan = await deps.loans.insertLoan(userId, deps.newId(), plan.loan, plan.installments)
  return { loan, rateInferred: plan.loan.rateInferred, installmentCount: plan.installments.length }
}
