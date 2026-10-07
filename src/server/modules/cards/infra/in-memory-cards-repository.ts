import { onRollback, type TransactionHandle } from '@/server/modules/ledger'
import { CardsError } from '../domain/errors'
import type {
  AdvanceRow,
  CardAccountRow,
  CardsRepository,
  InstallmentRow,
  NewStatement,
  PurchaseRow,
  PurchaseWithInstallments,
  StatementRow,
  StatementTotalsUpdate,
} from '../application/ports'

function clone<T>(value: T): T {
  return structuredClone(value)
}

/**
 * Repositório de cartões em memória (testes de aplicação). Participa do rollback conjunto da
 * unit of work do ledger registrando o `undo` de cada escrita com `onRollback(tx, ...)`.
 * As contas precisam existir também no `InMemoryLedgerRepository` (o ledger as valida): use
 * `addAccount`, que recebe o par (conta do ledger registrada pelo chamador).
 */
export class InMemoryCardsRepository implements CardsRepository {
  readonly accounts = new Map<string, CardAccountRow>()
  readonly statements = new Map<string, StatementRow>()
  readonly purchases = new Map<string, PurchaseRow>()
  readonly installments = new Map<string, InstallmentRow>()
  readonly advances = new Map<string, AdvanceRow>()

  private failures: Array<{ op: string; remaining: number; error: Error }> = []

  addAccount(row: Partial<CardAccountRow> & { id: string; userId: string }): CardAccountRow {
    const full: CardAccountRow = {
      name: row.id,
      type: 'CHECKING',
      isArchived: false,
      overdraftLimit: 0,
      creditLimit: null,
      closingDay: null,
      dueDay: null,
      ...row,
    }
    this.accounts.set(full.id, full)
    return full
  }

  /** Faz a `nth` chamada de `op` (nome do método) lançar `error` (prova de atomicidade). */
  failOn(op: keyof CardsRepository, nth = 1, error: Error = new Error(`falha injetada em ${op}`)) {
    this.failures.push({ op, remaining: nth, error })
  }

  private maybeFail(op: string): void {
    for (const failure of this.failures) {
      if (failure.op !== op) continue
      failure.remaining -= 1
      if (failure.remaining === 0) throw failure.error
    }
  }

  // ---- contas -------------------------------------------------------------------------

  async findAccount(userId: string, accountId: string): Promise<CardAccountRow | null> {
    const row = this.accounts.get(accountId)
    return row && row.userId === userId ? clone(row) : null
  }

  async listAccounts(userId: string): Promise<CardAccountRow[]> {
    return [...this.accounts.values()].filter((a) => a.userId === userId).map(clone)
  }

  async listActiveCards(userId: string): Promise<CardAccountRow[]> {
    return [...this.accounts.values()]
      .filter((a) => a.userId === userId && a.type === 'CREDIT_CARD' && !a.isArchived)
      .map(clone)
  }

  // ---- faturas ------------------------------------------------------------------------

  async findStatement(userId: string, id: string): Promise<StatementRow | null> {
    const row = this.statements.get(id)
    return row && row.userId === userId ? clone(row) : null
  }

  async findStatementByKey(
    userId: string,
    accountId: string,
    statementKey: string,
  ): Promise<StatementRow | null> {
    const row = [...this.statements.values()].find(
      (s) => s.userId === userId && s.accountId === accountId && s.statementKey === statementKey,
    )
    return row ? clone(row) : null
  }

  async listStatements(userId: string, accountId: string): Promise<StatementRow[]> {
    return [...this.statements.values()]
      .filter((s) => s.userId === userId && s.accountId === accountId)
      .sort((a, b) => (a.statementKey < b.statementKey ? 1 : -1))
      .map(clone)
  }

  async ensureStatements(
    userId: string,
    drafts: NewStatement[],
    tx?: TransactionHandle,
  ): Promise<StatementRow[]> {
    this.maybeFail('ensureStatements')
    const result: StatementRow[] = []
    for (const draft of [...drafts].sort((a, b) => (a.statementKey < b.statementKey ? -1 : 1))) {
      const existing = [...this.statements.values()].find(
        (s) =>
          s.userId === userId &&
          s.accountId === draft.accountId &&
          s.statementKey === draft.statementKey,
      )
      if (existing) {
        result.push(clone(existing))
        continue
      }
      const row: StatementRow = {
        ...draft,
        userId,
        totalAmount: 0,
        paidAmount: 0,
        status: 'OPEN',
      }
      this.statements.set(row.id, row)
      onRollback(tx, () => this.statements.delete(row.id))
      result.push(clone(row))
    }
    return result
  }

  async lockStatements(userId: string, ids: string[]): Promise<StatementRow[]> {
    return [...new Set(ids)]
      .sort()
      .map((id) => this.statements.get(id))
      .filter((row): row is StatementRow => row !== undefined && row.userId === userId)
      .map(clone)
  }

  async updateStatementTotals(
    userId: string,
    id: string,
    update: StatementTotalsUpdate,
    tx?: TransactionHandle,
  ): Promise<StatementRow> {
    this.maybeFail('updateStatementTotals')
    const row = this.statements.get(id)
    if (!row || row.userId !== userId) {
      throw new CardsError('STATEMENT_NOT_FOUND', 'Fatura não encontrada.')
    }
    const previous = clone(row)
    const next = { ...row, ...update }
    this.statements.set(id, next)
    onRollback(tx, () => this.statements.set(id, previous))
    return clone(next)
  }

  // ---- compras e parcelas -------------------------------------------------------------

  async insertPurchase(row: PurchaseRow, tx?: TransactionHandle): Promise<void> {
    this.maybeFail('insertPurchase')
    this.purchases.set(row.id, clone(row))
    onRollback(tx, () => this.purchases.delete(row.id))
  }

  async insertInstallment(row: InstallmentRow, tx?: TransactionHandle): Promise<void> {
    this.maybeFail('insertInstallment')
    this.installments.set(row.id, clone(row))
    onRollback(tx, () => this.installments.delete(row.id))
  }

  private withChildren(purchase: PurchaseRow): PurchaseWithInstallments {
    return {
      ...clone(purchase),
      installments: [...this.installments.values()]
        .filter((i) => i.purchaseId === purchase.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber)
        .map(clone),
      advances: [...this.advances.values()].filter((a) => a.purchaseId === purchase.id).map(clone),
    }
  }

  async lockPurchase(userId: string, id: string): Promise<PurchaseWithInstallments | null> {
    return this.findPurchase(userId, id)
  }

  async findPurchase(userId: string, id: string): Promise<PurchaseWithInstallments | null> {
    const row = this.purchases.get(id)
    return row && row.userId === userId ? this.withChildren(row) : null
  }

  async listPurchases(userId: string, accountId: string): Promise<PurchaseWithInstallments[]> {
    return [...this.purchases.values()]
      .filter((p) => p.userId === userId && p.accountId === accountId)
      .map((p) => this.withChildren(p))
  }

  async insertAdvance(row: AdvanceRow, tx?: TransactionHandle): Promise<void> {
    this.maybeFail('insertAdvance')
    this.advances.set(row.id, clone(row))
    onRollback(tx, () => this.advances.delete(row.id))
  }

  async setInstallmentsAdvance(
    installmentIds: string[],
    advanceId: string,
    tx?: TransactionHandle,
  ): Promise<void> {
    this.maybeFail('setInstallmentsAdvance')
    for (const id of installmentIds) {
      const row = this.installments.get(id)
      if (!row) continue
      const previous = row.advanceId
      row.advanceId = advanceId
      onRollback(tx, () => {
        row.advanceId = previous
      })
    }
  }

  async deletePurchase(userId: string, id: string, tx?: TransactionHandle): Promise<void> {
    this.maybeFail('deletePurchase')
    const purchase = this.purchases.get(id)
    if (!purchase || purchase.userId !== userId) return
    const installments = [...this.installments.values()].filter((i) => i.purchaseId === id)
    const advances = [...this.advances.values()].filter((a) => a.purchaseId === id)
    this.purchases.delete(id)
    for (const i of installments) this.installments.delete(i.id)
    for (const a of advances) this.advances.delete(a.id)
    onRollback(tx, () => {
      this.purchases.set(id, purchase)
      for (const i of installments) this.installments.set(i.id, i)
      for (const a of advances) this.advances.set(a.id, a)
    })
  }
}
