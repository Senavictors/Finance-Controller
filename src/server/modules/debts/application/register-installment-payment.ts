import { toCalendarDate } from '../domain/calendar'
import type { LedgerWarning } from '@/server/modules/ledger'
import { DebtError } from '../domain/errors'
import { lateCharges, type LateCharges } from '../domain/late-charges'
import { isInstallmentKind, type LoanStatus } from '../domain/types'
import type { DebtsDeps } from './ports'
import { CATEGORY_KEYS, loadAccountPosition, requireLoan } from './shared'

export interface RegisterInstallmentPaymentInput {
  loanId: string
  number: number
  /** Dia do pagamento (meio-dia UTC). */
  payDate: Date
  /** Conta de onde sai o dinheiro. */
  accountId: string
  /**
   * Total efetivamente debitado (parcela + encargos reais do banco). Omitido = parcela +
   * encargos calculados. Menor que a parcela não é aceito (pagamento parcial fora de escopo).
   */
  amountPaid?: number
}

export interface RegisterInstallmentPaymentResult {
  loanId: string
  number: number
  paidAt: Date
  /** Total debitado da conta, centavos. */
  paidAmountCents: number
  /** Encargos efetivamente pagos (multa + mora), centavos. */
  lateChargesCents: number
  /** Cálculo de referência do atraso na data do pagamento. */
  computedCharges: LateCharges
  /** Lançamentos criados no ledger. */
  transactionIds: { installment: string; fee: string | null; interest: string | null }
  outstandingCents: number
  loanStatus: LoanStatus
  /** `true` se havia parcela anterior ainda pendente (pagamento fora de ordem, permitido). */
  outOfOrder: boolean
  /** Avisos do ledger (ex.: `OVERDRAFT_USED`). */
  warnings: LedgerWarning[]
}

/**
 * Paga uma parcela: cria no ledger o `EXPENSE` da parcela (categoria `parcelas-emprestimos`) e,
 * se houver encargos, `FEE` (`multas-atrasos`) e `INTEREST` (`juros-encargos`) separados, e marca
 * a `LoanInstallment` como paga, tudo em UMA transação (unit of work do ledger, ADR-025).
 */
export async function registerInstallmentPayment(
  userId: string,
  input: RegisterInstallmentPaymentInput,
  deps: DebtsDeps,
): Promise<RegisterInstallmentPaymentResult> {
  if (!(input.payDate instanceof Date) || Number.isNaN(input.payDate.getTime())) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Data de pagamento inválida.', { field: 'payDate' })
  }
  const payDate = toCalendarDate(input.payDate)
  if (!Number.isInteger(input.number) || input.number < 1) {
    throw new DebtError('DEBT_INVALID_INPUT', 'Número da parcela inválido.', { field: 'number' })
  }
  if (
    input.amountPaid !== undefined &&
    (!Number.isInteger(input.amountPaid) || input.amountPaid <= 0)
  ) {
    throw new DebtError('DEBT_INVALID_INPUT', 'amountPaid deve ser um inteiro de centavos > 0.', {
      field: 'amountPaid',
    })
  }

  // Leituras fora da transação (a `fn` do unit of work pode rodar duas vezes em deadlock).
  const loan = await requireLoan(deps, userId, input.loanId)
  if (!isInstallmentKind(loan.kind)) {
    throw new DebtError('DEBT_NOT_INSTALLMENT_LOAN', 'Esta dívida não tem parcelas.')
  }
  const account = await loadAccountPosition(deps, userId, input.accountId)
  if (account.accountType === 'CREDIT_CARD') {
    throw new DebtError('DEBT_INVALID_INPUT', 'Pague a parcela com uma conta, não com um cartão.', {
      field: 'accountId',
    })
  }
  const categoryIds = await deps.categories.idsByKey(userId, Object.values(CATEGORY_KEYS))
  const label = `${loan.name}`

  return deps.ledger.runInTransaction({ userId }, async (uow) => {
    // 1. Trava do módulo ANTES do ledger (ordem de locks, docs/domain/ledger.md).
    await deps.loans.lockLoan(userId, loan.id, uow.tx)
    const current = await deps.loans.findLoan(userId, loan.id, uow.tx)
    if (!current) throw new DebtError('DEBT_LOAN_NOT_FOUND', 'Dívida não encontrada.')
    const installments = await deps.loans.listInstallments(userId, loan.id, uow.tx)
    const installment = installments.find((item) => item.number === input.number)
    if (!installment) {
      throw new DebtError('DEBT_INSTALLMENT_NOT_FOUND', 'Parcela não encontrada.', {
        number: input.number,
      })
    }
    if (installment.status === 'PAID') {
      throw new DebtError('INSTALLMENT_ALREADY_PAID', 'Esta parcela já foi paga.', {
        number: input.number,
      })
    }
    if (installment.status === 'SKIPPED') {
      throw new DebtError('DEBT_INSTALLMENT_NOT_PAYABLE', 'Esta parcela foi ignorada.', {
        number: input.number,
      })
    }

    // 2. Encargos: calculados na data do pagamento; o valor real do banco (`amountPaid`) prevalece.
    const computed = lateCharges({
      amount: installment.amountCents,
      dueDate: installment.dueDate,
      payDate,
      lateFeePct: current.lateFeeRate,
      lateInterestMonthly: current.lateInterestMonthlyRate,
    })
    let fee = computed.fee
    let interest = computed.interest
    if (input.amountPaid !== undefined) {
      if (input.amountPaid < installment.amountCents) {
        throw new DebtError(
          'DEBT_PARTIAL_PAYMENT_UNSUPPORTED',
          'Pagamento menor que a parcela não é suportado.',
          { amountPaid: input.amountPaid, amount: installment.amountCents },
        )
      }
      const extra = input.amountPaid - installment.amountCents
      fee = Math.min(computed.fee, extra)
      interest = extra - fee
    }
    const charges = fee + interest

    // 3. Ledger: parcela, multa e juros de mora em lançamentos próprios (relatório de juros pagos).
    const dateText = `${installment.number}/${current.installmentCount ?? installments.length}`
    const parcel = await uow.createTransaction({
      accountId: input.accountId,
      kind: 'EXPENSE',
      amount: installment.amountCents,
      date: payDate,
      description: `Parcela ${dateText} - ${label}`,
      categoryId: categoryIds[CATEGORY_KEYS.installment] ?? null,
    })
    const warnings = [...parcel.warnings]
    let feeId: string | null = null
    let interestId: string | null = null
    if (fee > 0) {
      const created = await uow.createTransaction({
        accountId: input.accountId,
        kind: 'FEE',
        amount: fee,
        date: payDate,
        description: `Multa por atraso ${dateText} - ${label}`,
        categoryId: categoryIds[CATEGORY_KEYS.fee] ?? null,
      })
      feeId = created.transaction.id
      warnings.push(...created.warnings)
    }
    if (interest > 0) {
      const created = await uow.createTransaction({
        accountId: input.accountId,
        kind: 'INTEREST',
        amount: interest,
        date: payDate,
        description: `Juros de mora ${dateText} - ${label}`,
        categoryId: categoryIds[CATEGORY_KEYS.interest] ?? null,
      })
      interestId = created.transaction.id
      warnings.push(...created.warnings)
    }

    // 4. Módulo: parcela paga + saldo/status do contrato, na mesma transação.
    const paidAmountCents = installment.amountCents + charges
    const marked = await deps.loans.markInstallmentPaid(
      userId,
      {
        loanId: loan.id,
        number: installment.number,
        paidAt: payDate,
        paidAmountCents,
        lateChargesCents: charges,
        transactionId: parcel.transaction.id,
      },
      uow.tx,
    )
    if (!marked) {
      // Outra requisição venceu a corrida: desfaz os lançamentos acima.
      throw new DebtError('INSTALLMENT_ALREADY_PAID', 'Esta parcela já foi paga.', {
        number: input.number,
      })
    }
    const stillOpen = installments.filter(
      (item) => item.status === 'PENDING' && item.number !== installment.number,
    )
    const outstandingCents = stillOpen.reduce((sum, item) => sum + item.principalCents, 0)
    const loanStatus: LoanStatus = stillOpen.length === 0 ? 'PAID_OFF' : current.status
    await deps.loans.updateLoanState(
      userId,
      loan.id,
      { outstandingCents, status: loanStatus },
      uow.tx,
    )

    return {
      loanId: loan.id,
      number: installment.number,
      paidAt: payDate,
      paidAmountCents,
      lateChargesCents: charges,
      computedCharges: computed,
      transactionIds: { installment: parcel.transaction.id, fee: feeId, interest: interestId },
      outstandingCents,
      loanStatus,
      outOfOrder: stillOpen.some((item) => item.number < installment.number),
      warnings,
    }
  })
}
