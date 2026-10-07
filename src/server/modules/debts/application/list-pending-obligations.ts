import { toCalendarDate } from '../domain/calendar'
import { DebtError } from '../domain/errors'
import { assessInstallment } from '../domain/summary'
import type { InstallmentState, LateCharges } from '../domain/late-charges'
import type { LoanKind } from '../domain/types'
import type { DebtsDeps } from './ports'

export interface DebtObligation {
  loanId: string
  loanName: string
  kind: LoanKind
  /** Conta de débito do contrato. */
  accountId: string | null
  categoryId: string | null
  number: number
  installmentCount: number | null
  dueDate: Date
  /** `PENDING` ou `OVERDUE` (calculado em `now`). */
  status: Extract<InstallmentState, 'PENDING' | 'OVERDUE'>
  /** Valor da parcela, centavos. */
  amount: number
  lateCharges: LateCharges
  /** Parcela + encargos de atraso até `now`: o valor que o engine Disponível reserva. */
  amountDueNow: number
}

/**
 * Compromissos de dívida do ciclo (contrato consumido pelo engine Disponível, F3-02): parcelas
 * `PENDING|OVERDUE` com vencimento `<= until`, com o valor corrigido até hoje (RN-09). Parcelas
 * pagas e ignoradas ficam de fora. Ordenado por vencimento, contrato e número.
 */
export async function listPendingDebtObligations(
  userId: string,
  options: { until: Date; now: Date },
  deps: DebtsDeps,
): Promise<DebtObligation[]> {
  if (!(options.until instanceof Date) || Number.isNaN(options.until.getTime())) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Data limite inválida.', { field: 'until' })
  }
  const rows = await deps.loans.listOpenInstallments(userId, toCalendarDate(options.until))
  return rows
    .map(({ installment, loan }): DebtObligation => {
      const assessed = assessInstallment(installment, loan, options.now)
      return {
        loanId: loan.id,
        loanName: loan.name,
        kind: loan.kind,
        accountId: loan.accountId,
        categoryId: loan.categoryId,
        number: installment.number,
        installmentCount: loan.installmentCount,
        dueDate: installment.dueDate,
        status: assessed.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING',
        amount: installment.amountCents,
        lateCharges: assessed.lateCharges,
        amountDueNow: assessed.amountDueNow,
      }
    })
    .sort(
      (a, b) =>
        a.dueDate.getTime() - b.dueDate.getTime() ||
        (a.loanId < b.loanId ? -1 : a.loanId > b.loanId ? 1 : 0) ||
        a.number - b.number,
    )
}
