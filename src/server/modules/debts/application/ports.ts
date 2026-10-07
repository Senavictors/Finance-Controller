import type { LedgerService, TransactionHandle } from '@/server/modules/ledger'
import type { PlannedInstallment, PlannedLoan } from '../domain/new-loan'
import type { InstallmentRecord, LoanKind, LoanRecord, LoanStatus } from '../domain/types'

/** Parcela em aberto com o contexto do contrato (obrigações do ciclo, F3-02). */
export interface OpenInstallmentRow {
  installment: InstallmentRecord
  loan: Pick<
    LoanRecord,
    | 'id'
    | 'kind'
    | 'name'
    | 'accountId'
    | 'installmentCount'
    | 'lateFeeRate'
    | 'lateInterestMonthlyRate'
    | 'categoryId'
  >
}

export interface LoanStatePatch {
  outstandingCents: number
  status: LoanStatus
}

export interface LoanUpdateFields {
  name?: string
  lenderName?: string | null
  accountId?: string | null
  categoryId?: string | null
  notes?: string | null
  monthlyRate?: number
  lateFeeRate?: number
  lateInterestMonthlyRate?: number
  status?: LoanStatus
}

export interface MarkInstallmentPaidInput {
  loanId: string
  number: number
  paidAt: Date
  paidAmountCents: number
  lateChargesCents: number
  /** Lançamento da parcela principal no ledger. */
  transactionId: string
}

/**
 * Porta de persistência de dívidas. Toda operação é escopada por `userId`. O parâmetro `tx`
 * (handle do unit of work do ledger) faz a escrita entrar na MESMA transação dos lançamentos.
 * Implementações: `infra/prisma-loan-repository.ts` e `infra/in-memory-loan-repository.ts`.
 */
export interface LoanRepository {
  /** Grava `Loan` e `LoanInstallment[]` atomicamente. */
  insertLoan(
    userId: string,
    id: string,
    loan: PlannedLoan,
    installments: readonly PlannedInstallment[],
  ): Promise<LoanRecord>
  findLoan(userId: string, loanId: string, tx?: TransactionHandle): Promise<LoanRecord | null>
  listLoans(userId: string, filter?: { statuses?: readonly LoanStatus[] }): Promise<LoanRecord[]>
  findLoanByAccount(userId: string, accountId: string, kind: LoanKind): Promise<LoanRecord | null>
  listInstallments(
    userId: string,
    loanId: string,
    tx?: TransactionHandle,
  ): Promise<InstallmentRecord[]>
  listInstallmentsByLoans(
    userId: string,
    loanIds: readonly string[],
  ): Promise<Map<string, InstallmentRecord[]>>
  /** Parcelas `PENDING` de contratos `ACTIVE|DEFAULTED` com vencimento `<= until`. */
  listOpenInstallments(userId: string, until: Date): Promise<OpenInstallmentRow[]>
  /** Trava a linha do contrato (`FOR UPDATE`) antes de chamar o ledger (ordem de locks). */
  lockLoan(userId: string, loanId: string, tx: TransactionHandle): Promise<void>
  /** Marca como paga só se ainda estiver `PENDING`; devolve `false` se outra requisição chegou antes. */
  markInstallmentPaid(
    userId: string,
    input: MarkInstallmentPaidInput,
    tx: TransactionHandle,
  ): Promise<boolean>
  updateLoanState(
    userId: string,
    loanId: string,
    patch: LoanStatePatch,
    tx: TransactionHandle,
  ): Promise<void>
  updateLoan(userId: string, loanId: string, patch: LoanUpdateFields): Promise<LoanRecord | null>
  deleteLoan(userId: string, loanId: string): Promise<boolean>
}

/** Fatura em atraso/rotativo de um cartão (leitura-somente; o dono é o módulo de cartões). */
export interface RevolvingBalance {
  /** Σ (total - pago) das faturas vencidas e não quitadas, centavos. */
  unpaid: number
  /** Σ total dessas faturas: valor original da dívida do cartão (base do teto de 100%). */
  originalPrincipal: number
  /** Fechamento da fatura vencida mais antiga: juros do rotativo são contados daí em diante. */
  since: Date | null
}

export interface CardRevolvingReader {
  revolvingBalance(userId: string, cardAccountId: string, today: Date): Promise<RevolvingBalance>
}

/** Resolve categorias de sistema por `key` (`parcelas-emprestimos`, `juros-encargos`...). */
export interface CategoryKeyLookup {
  idsByKey(userId: string, keys: readonly string[]): Promise<Record<string, string | null>>
}

export interface DebtsDeps {
  loans: LoanRepository
  /** Serviço do ledger ligado ao Prisma (`getLedgerService()`) ou, em testes, em memória. */
  ledger: LedgerService
  cardStatements: CardRevolvingReader
  categories: CategoryKeyLookup
  /** Gerador de ids (UUID) injetável para testes determinísticos. */
  newId: () => string
}
