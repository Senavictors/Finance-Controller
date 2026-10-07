import { onRollback, type TransactionHandle } from '@/server/modules/ledger'
import type { PlannedInstallment, PlannedLoan } from '../domain/new-loan'
import type { InstallmentRecord, LoanKind, LoanRecord, LoanStatus } from '../domain/types'
import type {
  CardRevolvingReader,
  CategoryKeyLookup,
  LoanRepository,
  LoanStatePatch,
  LoanUpdateFields,
  MarkInstallmentPaidInput,
  OpenInstallmentRow,
  RevolvingBalance,
} from '../application/ports'

/**
 * Repositório de dívidas em memória (testes de aplicação). Participa do rollback conjunto da
 * unit of work do ledger: as escritas feitas com `tx` registram o `undo` por `onRollback`.
 */
export class InMemoryLoanRepository implements LoanRepository {
  readonly loans = new Map<string, LoanRecord>()
  readonly installments = new Map<string, InstallmentRecord[]>()
  private seq = 0
  private clock = Date.UTC(2026, 9, 5, 12, 0, 0)

  private tick(): Date {
    this.clock += 1000
    return new Date(this.clock)
  }

  async insertLoan(
    userId: string,
    id: string,
    loan: PlannedLoan,
    installments: readonly PlannedInstallment[],
  ): Promise<LoanRecord> {
    const at = this.tick()
    const { rateInferred: _rateInferred, ...fields } = loan
    void _rateInferred
    const record: LoanRecord = {
      ...fields,
      id,
      userId,
      status: 'ACTIVE',
      createdAt: at,
      updatedAt: at,
    }
    this.loans.set(id, record)
    this.installments.set(
      id,
      installments.map((item) => ({
        id: `inst-${++this.seq}`,
        loanId: id,
        number: item.number,
        dueDate: item.dueDate,
        principalCents: item.principalCents,
        interestCents: item.interestCents,
        amountCents: item.amountCents,
        status: item.status,
        paidAt: item.paidAt,
        paidAmountCents: item.paidAmountCents,
        lateChargesCents: 0,
        transactionId: null,
      })),
    )
    return { ...record }
  }

  async findLoan(userId: string, loanId: string): Promise<LoanRecord | null> {
    const loan = this.loans.get(loanId)
    return loan && loan.userId === userId ? { ...loan } : null
  }

  async listLoans(
    userId: string,
    filter: { statuses?: readonly LoanStatus[] } = {},
  ): Promise<LoanRecord[]> {
    return [...this.loans.values()]
      .filter((loan) => loan.userId === userId)
      .filter((loan) => !filter.statuses || filter.statuses.includes(loan.status))
      .map((loan) => ({ ...loan }))
  }

  async findLoanByAccount(
    userId: string,
    accountId: string,
    kind: LoanKind,
  ): Promise<LoanRecord | null> {
    const loan = [...this.loans.values()].find(
      (item) =>
        item.userId === userId &&
        item.accountId === accountId &&
        item.kind === kind &&
        item.status !== 'PAID_OFF',
    )
    return loan ? { ...loan } : null
  }

  async listInstallments(userId: string, loanId: string): Promise<InstallmentRecord[]> {
    const loan = this.loans.get(loanId)
    if (!loan || loan.userId !== userId) return []
    return (this.installments.get(loanId) ?? []).map((item) => ({ ...item }))
  }

  async listInstallmentsByLoans(
    userId: string,
    loanIds: readonly string[],
  ): Promise<Map<string, InstallmentRecord[]>> {
    const result = new Map<string, InstallmentRecord[]>()
    for (const loanId of loanIds) result.set(loanId, await this.listInstallments(userId, loanId))
    return result
  }

  async listOpenInstallments(userId: string, until: Date): Promise<OpenInstallmentRow[]> {
    const rows: OpenInstallmentRow[] = []
    for (const loan of this.loans.values()) {
      if (loan.userId !== userId || loan.status === 'PAID_OFF') continue
      for (const item of this.installments.get(loan.id) ?? []) {
        if (item.status === 'PENDING' && item.dueDate.getTime() <= until.getTime()) {
          rows.push({
            installment: { ...item },
            loan: {
              id: loan.id,
              kind: loan.kind,
              name: loan.name,
              accountId: loan.accountId,
              installmentCount: loan.installmentCount,
              lateFeeRate: loan.lateFeeRate,
              lateInterestMonthlyRate: loan.lateInterestMonthlyRate,
              categoryId: loan.categoryId,
            },
          })
        }
      }
    }
    return rows
  }

  async lockLoan(): Promise<void> {
    // Sem concorrência real em memória: o lock por linha só existe no Postgres.
  }

  async markInstallmentPaid(
    userId: string,
    input: MarkInstallmentPaidInput,
    tx: TransactionHandle,
  ): Promise<boolean> {
    const loan = this.loans.get(input.loanId)
    if (!loan || loan.userId !== userId) return false
    const list = this.installments.get(input.loanId) ?? []
    const index = list.findIndex((item) => item.number === input.number)
    if (index < 0 || list[index].status !== 'PENDING') return false
    const before = list[index]
    list[index] = {
      ...before,
      status: 'PAID',
      paidAt: input.paidAt,
      paidAmountCents: input.paidAmountCents,
      lateChargesCents: input.lateChargesCents,
      transactionId: input.transactionId,
    }
    onRollback(tx, () => {
      list[index] = before
    })
    return true
  }

  async updateLoanState(
    userId: string,
    loanId: string,
    patch: LoanStatePatch,
    tx: TransactionHandle,
  ): Promise<void> {
    const loan = this.loans.get(loanId)
    if (!loan || loan.userId !== userId) return
    const before = loan
    this.loans.set(loanId, { ...loan, ...patch, updatedAt: this.tick() })
    onRollback(tx, () => {
      this.loans.set(loanId, before)
    })
  }

  async updateLoan(
    userId: string,
    loanId: string,
    patch: LoanUpdateFields,
  ): Promise<LoanRecord | null> {
    const loan = this.loans.get(loanId)
    if (!loan || loan.userId !== userId) return null
    const updated = { ...loan, ...patch, updatedAt: this.tick() }
    this.loans.set(loanId, updated)
    return { ...updated }
  }

  async deleteLoan(userId: string, loanId: string): Promise<boolean> {
    const loan = this.loans.get(loanId)
    if (!loan || loan.userId !== userId) return false
    this.loans.delete(loanId)
    this.installments.delete(loanId)
    return true
  }
}

/** Leitor de rotativo em memória: o teste define o saldo por cartão. */
export class InMemoryCardRevolvingReader implements CardRevolvingReader {
  readonly balances = new Map<string, RevolvingBalance>()

  async revolvingBalance(_userId: string, cardAccountId: string): Promise<RevolvingBalance> {
    return this.balances.get(cardAccountId) ?? { unpaid: 0, originalPrincipal: 0, since: null }
  }
}

/** Categorias de sistema em memória: `key` -> id (`cat-<key>`), para todos os usuários. */
export class InMemoryCategoryKeyLookup implements CategoryKeyLookup {
  async idsByKey(_userId: string, keys: readonly string[]): Promise<Record<string, string | null>> {
    return Object.fromEntries(keys.map((key) => [key, `cat-${key}`]))
  }
}
