import type { LedgerService, TransactionHandle } from '@/server/modules/ledger'
import type { StatementStatus } from '../domain/statement-status'

/**
 * Portas do módulo de cartões (FC2-F1-03). A implementação Prisma fica em `infra/`; testes de
 * aplicação usam `InMemoryCardsRepository`. Todos os métodos aceitam `tx` opcional: dentro de
 * `ledger.runInTransaction` o use-case passa `uow.tx` e a escrita entra na MESMA transação
 * do ledger (rollback conjunto). Todas as consultas filtram por `userId` (ids de outro usuário
 * voltam `null`/vazio => 404).
 */

/** Conta como o módulo de cartões a enxerga (leitura; o CRUD de contas é da FC2-F1-02). */
export interface CardAccountRow {
  id: string
  userId: string
  name: string
  type: 'CHECKING' | 'SAVINGS' | 'WALLET' | 'INVESTMENT' | 'CREDIT_CARD' | 'BUSINESS'
  isArchived: boolean
  /** Cheque especial, centavos. */
  overdraftLimit: number
  creditLimit: number | null
  closingDay: number | null
  dueDay: number | null
}

export interface StatementRow {
  id: string
  userId: string
  accountId: string
  /** Meio-dia UTC. */
  periodStart: Date
  periodEnd: Date
  closingDate: Date
  dueDate: Date
  /** `AAAA-MM` do vencimento. */
  statementKey: string
  /** Total líquido (cobranças - créditos), cache derivado do ledger. */
  totalAmount: number
  paidAmount: number
  status: StatementStatus
}

export type NewStatement = Omit<StatementRow, 'totalAmount' | 'paidAmount' | 'status'>

export interface StatementTotalsUpdate {
  totalAmount: number
  paidAmount: number
  status: StatementStatus
}

export interface PurchaseRow {
  id: string
  userId: string
  accountId: string
  categoryId: string | null
  merchantId: string | null
  description: string
  notes: string | null
  purchaseDate: Date
  totalAmount: number
  installmentCount: number
}

export interface InstallmentRow {
  id: string
  purchaseId: string
  advanceId: string | null
  installmentNumber: number
  originalAmount: number
  originalDate: Date
  ledgerTransactionId: string
}

export interface AdvanceRow {
  id: string
  userId: string
  purchaseId: string
  accountId: string
  advancedAt: Date
  totalOriginalAmount: number
  totalPaidAmount: number
  totalDiscountAmount: number
  notes: string | null
}

export type PurchaseWithInstallments = PurchaseRow & {
  installments: InstallmentRow[]
  advances: AdvanceRow[]
}

export interface CardsRepository {
  // ---- contas (leitura) ---------------------------------------------------------------
  findAccount(
    userId: string,
    accountId: string,
    tx?: TransactionHandle,
  ): Promise<CardAccountRow | null>
  /** Todas as contas do usuário (para sugerir a origem do pagamento). */
  listAccounts(userId: string, tx?: TransactionHandle): Promise<CardAccountRow[]>
  /** Cartões de crédito ativos (não arquivados) do usuário. */
  listActiveCards(userId: string, tx?: TransactionHandle): Promise<CardAccountRow[]>

  // ---- faturas ------------------------------------------------------------------------
  findStatement(userId: string, id: string, tx?: TransactionHandle): Promise<StatementRow | null>
  findStatementByKey(
    userId: string,
    accountId: string,
    statementKey: string,
    tx?: TransactionHandle,
  ): Promise<StatementRow | null>
  /** Faturas do cartão, da mais recente (vencimento) para a mais antiga. */
  listStatements(userId: string, accountId: string, tx?: TransactionHandle): Promise<StatementRow[]>
  /**
   * Cria as faturas que não existirem (`INSERT ... ON CONFLICT (account_id, statement_key) DO
   * NOTHING`: idempotente e seguro sob concorrência) e devolve TODAS as pedidas, na ordem de
   * `statementKey`. Chame com as chaves já ordenadas entre use-cases (ordem global de locks).
   */
  ensureStatements(
    userId: string,
    drafts: NewStatement[],
    tx?: TransactionHandle,
  ): Promise<StatementRow[]>
  /**
   * `SELECT ... FOR UPDATE` das faturas (ordenado por id) e devolve o estado commitado atual.
   * Trave a fatura ANTES de chamar o ledger (ordem de locks de docs/domain/ledger.md).
   */
  lockStatements(userId: string, ids: string[], tx?: TransactionHandle): Promise<StatementRow[]>
  updateStatementTotals(
    userId: string,
    id: string,
    update: StatementTotalsUpdate,
    tx?: TransactionHandle,
  ): Promise<StatementRow>

  // ---- compras e parcelas -------------------------------------------------------------
  insertPurchase(row: PurchaseRow, tx?: TransactionHandle): Promise<void>
  insertInstallment(row: InstallmentRow, tx?: TransactionHandle): Promise<void>
  /** Trava a compra (`FOR UPDATE`) e a devolve com parcelas e antecipações. */
  lockPurchase(
    userId: string,
    id: string,
    tx?: TransactionHandle,
  ): Promise<PurchaseWithInstallments | null>
  findPurchase(
    userId: string,
    id: string,
    tx?: TransactionHandle,
  ): Promise<PurchaseWithInstallments | null>
  /** Compras do cartão que ainda têm parcelas futuras (para o resumo). */
  listPurchases(
    userId: string,
    accountId: string,
    tx?: TransactionHandle,
  ): Promise<PurchaseWithInstallments[]>
  insertAdvance(row: AdvanceRow, tx?: TransactionHandle): Promise<void>
  setInstallmentsAdvance(
    installmentIds: string[],
    advanceId: string,
    tx?: TransactionHandle,
  ): Promise<void>
  /** Apaga a compra (parcelas e antecipações caem em cascata). */
  deletePurchase(userId: string, id: string, tx?: TransactionHandle): Promise<void>
}

export interface CardsDeps {
  ledger: LedgerService
  repo: CardsRepository
  /** Relógio injetável (RN-12). */
  clock: () => Date
  /** Gera ids (compras, faturas, antecipações). Chame ANTES de `runInTransaction` (retry idempotente). */
  uuid: () => string
  /** Fuso de negócio do "hoje"; padrão `America/Sao_Paulo`. */
  timeZone?: string
}

export interface CardsContext {
  userId: string
}
