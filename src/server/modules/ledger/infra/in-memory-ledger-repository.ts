import { bucketOf, zeroBuckets } from '../domain/rules'
import { normalizeLinks } from '../domain/links'
import {
  LedgerError,
  type Buckets,
  type LedgerTxn,
  type NewLedgerTxn,
  type TxnStatus,
} from '../domain/types'
import type {
  BalanceRow,
  LedgerAccount,
  LedgerRepository,
  LedgerTx,
  TransactionHandle,
  TxnListFilter,
  TxnPage,
  TxnPatch,
} from '../application/ports'
import { InMemoryTransactionHandle } from './transaction-handle'
import { runInLedgerTransactionScope } from './transaction-scope'

export type InMemoryOp =
  | 'insertTxn'
  | 'updateTxn'
  | 'deleteTxns'
  | 'incrementBalance'
  | 'setBalance'
  | 'ensureBalance'

function matchesStatus(status: TxnStatus, filter: TxnListFilter['status']): boolean {
  if (filter === undefined) return true
  return Array.isArray(filter)
    ? (filter as readonly TxnStatus[]).includes(status)
    : status === filter
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

/**
 * Locks de linha em memória (equivalente ao `SELECT ... FOR UPDATE` e ao lock implícito de
 * UPDATE/DELETE do Postgres): reentrantes por dono, liberados no fim da transação, com
 * detecção de deadlock (o Postgres devolveria 40P01).
 */
class RowLocks {
  private readonly holders = new Map<string, object>()
  private readonly waiters = new Map<string, Array<() => void>>()
  private readonly waitingFor = new Map<object, string>()

  async acquire(key: string, owner: object): Promise<void> {
    for (;;) {
      const holder = this.holders.get(key)
      if (holder === undefined || holder === owner) {
        this.holders.set(key, owner)
        return
      }
      if (this.wouldDeadlock(holder, owner)) {
        throw new Error('deadlock detected (40P01 simulado)')
      }
      this.waitingFor.set(owner, key)
      await new Promise<void>((resolve) => {
        const queue = this.waiters.get(key) ?? []
        queue.push(resolve)
        this.waiters.set(key, queue)
      })
      this.waitingFor.delete(owner)
    }
  }

  /** `owner` esperar por algo que `holder` segura fecha um ciclo se `holder` já espera `owner`. */
  private wouldDeadlock(holder: object, owner: object): boolean {
    let current: object | undefined = holder
    const seen = new Set<object>()
    while (current !== undefined && !seen.has(current)) {
      if (current === owner) return true
      seen.add(current)
      const key = this.waitingFor.get(current)
      current = key === undefined ? undefined : this.holders.get(key)
    }
    return false
  }

  releaseAll(owner: object): void {
    for (const [key, holder] of [...this.holders]) {
      if (holder !== owner) continue
      this.holders.delete(key)
      const queue = this.waiters.get(key) ?? []
      this.waiters.delete(key)
      for (const wake of queue) wake()
    }
  }
}

/**
 * Repositório em memória para testes de aplicação. Reproduz o contrato do Prisma:
 * transações concorrentes com rollback integral (log de desfazer), locks de linha
 * (`lockTxns`, UPDATE/DELETE e incremento de saldo seguram a linha até o fim da transação),
 * unicidade `(transferId, accountId)`, filtro por `userId` e incremento (nunca
 * "ler-somar-gravar"). Leituras sem lock NÃO são serializadas: um use-case que calcula delta
 * sobre leitura sem `lockTxns` erra aqui como erraria no Postgres (READ COMMITTED).
 * Permite injetar falhas por operação (`failOn`) para provar atomicidade.
 */
export class InMemoryLedgerRepository implements LedgerRepository {
  readonly accounts = new Map<string, LedgerAccount>()
  readonly balances = new Map<string, BalanceRow>()
  readonly txns = new Map<string, LedgerTxn>()

  private seq = 0
  /** @internal */
  readonly locks = new RowLocks()
  private failures: Array<{ op: InMemoryOp; remaining: number; error: Error }> = []
  /** @internal */
  readonly now: () => Date

  constructor(opts: { now?: () => Date } = {}) {
    this.now = opts.now ?? (() => new Date('2026-10-05T12:00:00.000Z'))
  }

  // ---- fixtures de teste ----------------------------------------------------------------

  addAccount(account: Partial<LedgerAccount> & { id: string; userId: string }): LedgerAccount {
    const full: LedgerAccount = {
      type: 'CHECKING',
      isArchived: false,
      overdraftLimit: 0,
      creditLimit: null,
      ...account,
    }
    this.accounts.set(full.id, full)
    return full
  }

  /** Faz a `nth` chamada (1-based, contada a partir de agora) de `op` lançar `error`. */
  failOn(op: InMemoryOp, nth = 1, error: Error = new Error(`falha injetada em ${op}`)): void {
    this.failures.push({ op, remaining: nth, error })
  }

  clearFailures(): void {
    this.failures = []
  }

  /** @internal */
  tick(op: InMemoryOp): void {
    for (const failure of this.failures) {
      if (failure.op !== op) continue
      failure.remaining -= 1
      if (failure.remaining === 0) throw failure.error
    }
  }

  // ---- transação ------------------------------------------------------------------------

  /** @internal */
  nextId(): string {
    this.seq += 1
    return `txn-${String(this.seq).padStart(5, '0')}`
  }

  withTransaction<T>(fn: (tx: LedgerTx) => Promise<T>): Promise<T> {
    // Aninhar outra transação do ledger dentro de `fn` lança `LEDGER_NESTED_TRANSACTION`.
    return runInLedgerTransactionScope(async () => {
      const tx = new InMemoryTx(this)
      try {
        return await fn(tx)
      } catch (error) {
        tx.rollback()
        throw error
      } finally {
        this.locks.releaseAll(tx)
      }
    })
  }

  // ---- leituras -------------------------------------------------------------------------

  async findAccount(userId: string, accountId: string): Promise<LedgerAccount | null> {
    const account = this.accounts.get(accountId)
    return account && account.userId === userId ? clone(account) : null
  }

  async listAccounts(
    userId: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<LedgerAccount[]> {
    return [...this.accounts.values()]
      .filter((a) => a.userId === userId && (opts.includeArchived || !a.isArchived))
      .map(clone)
  }

  async findBalance(userId: string, accountId: string): Promise<BalanceRow | null> {
    const row = this.balances.get(accountId)
    return row && row.userId === userId ? clone(row) : null
  }

  async listBalances(userId: string): Promise<BalanceRow[]> {
    return [...this.balances.values()].filter((b) => b.userId === userId).map(clone)
  }

  async findTxn(userId: string, id: string): Promise<LedgerTxn | null> {
    const txn = this.txns.get(id)
    return txn && txn.userId === userId ? clone(txn) : null
  }

  async findTransferLegs(userId: string, transferId: string): Promise<LedgerTxn[]> {
    return [...this.txns.values()]
      .filter((t) => t.userId === userId && t.transferId === transferId)
      .sort((a, b) => a.amount - b.amount)
      .map(clone)
  }

  async refsExist(
    _userId: string,
    refs: { categoryId?: string | null; merchantId?: string | null },
  ): Promise<{ category: boolean; merchant: boolean }> {
    // O repositório em memória não modela categorias/merchants: tudo existe, salvo ids
    // marcados como inexistentes por `missingRefs` (cobre os caminhos de erro).
    return {
      category: !refs.categoryId || !this.missingRefs.has(refs.categoryId),
      merchant: !refs.merchantId || !this.missingRefs.has(refs.merchantId),
    }
  }

  /** Ids de categoria/merchant que `refsExist` deve tratar como inexistentes (ou de outro usuário). */
  readonly missingRefs = new Set<string>()

  async findTxnByOccurrenceKey(userId: string, occurrenceKey: string): Promise<LedgerTxn | null> {
    const found = [...this.txns.values()].find(
      (t) => t.userId === userId && t.occurrenceKey === occurrenceKey,
    )
    return found ? clone(found) : null
  }

  async linkRefsExist(
    _userId: string,
    refs: { statementId: string | null; seriesId: string | null; importBatchId: string | null },
  ): Promise<{ statement: boolean; series: boolean; importBatch: boolean }> {
    // Não modela faturas/séries/lotes: tudo existe, salvo ids em `missingLinks`.
    return {
      statement: !refs.statementId || !this.missingLinks.has(refs.statementId),
      series: !refs.seriesId || !this.missingLinks.has(refs.seriesId),
      importBatch: !refs.importBatchId || !this.missingLinks.has(refs.importBatchId),
    }
  }

  /** Ids de fatura/série/lote que `linkRefsExist` deve tratar como inexistentes (ou de outro usuário). */
  readonly missingLinks = new Set<string>()

  /** @internal Confere unicidade `(userId, occurrenceKey)` e `(userId, importHash)`. */
  assertUniqueKeys(row: Partial<LedgerTxn> & { userId: string }, selfId?: string): void {
    for (const field of ['occurrenceKey', 'importHash'] as const) {
      const value = row[field]
      if (!value) continue
      const clash = [...this.txns.values()].some(
        (t) => t.userId === row.userId && t.id !== selfId && t[field] === value,
      )
      if (clash) {
        throw new LedgerError(
          'LEDGER_DUPLICATE_KEY',
          `Já existe um lançamento com esta chave (${field}).`,
          {
            field,
          },
        )
      }
    }
  }

  async listTransactions(userId: string, filter: TxnListFilter): Promise<TxnPage> {
    const q = filter.q?.trim().toLowerCase()
    const sorted = [...this.txns.values()]
      .filter((t) => t.userId === userId)
      .filter((t) => !filter.accountId || t.accountId === filter.accountId)
      .filter((t) => matchesStatus(t.status, filter.status))
      .filter((t) => !filter.categoryId || t.categoryId === filter.categoryId)
      .filter(
        (t) =>
          !filter.occurrenceKeyPrefix ||
          (t.occurrenceKey !== null && t.occurrenceKey.startsWith(filter.occurrenceKeyPrefix)),
      )
      .filter((t) => !filter.kind || t.kind === filter.kind)
      .filter((t) => !filter.statementId || t.statementId === filter.statementId)
      .filter((t) => !filter.seriesId || t.seriesId === filter.seriesId)
      .filter((t) => !filter.refundOfId || t.refundOfId === filter.refundOfId)
      .filter((t) => !filter.from || t.date.getTime() >= filter.from.getTime())
      .filter((t) => !filter.to || t.date.getTime() <= filter.to.getTime())
      .filter((t) => !q || t.description.toLowerCase().includes(q))
      .sort(
        (a, b) => b.date.getTime() - a.date.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      )

    let start = 0
    if (filter.cursor) {
      const index = sorted.findIndex((t) => t.id === filter.cursor)
      start = index === -1 ? sorted.length : index + 1
    }
    const slice = sorted.slice(start, start + filter.limit + 1)
    const items = slice.slice(0, filter.limit).map(clone)
    const hasMore = slice.length > filter.limit
    return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null }
  }

  // ---- utilidades de teste --------------------------------------------------------------

  /** Lançamentos de uma conta (cópias). */
  txnsOf(accountId: string): LedgerTxn[] {
    return [...this.txns.values()].filter((t) => t.accountId === accountId).map(clone)
  }
}

/** Transação em memória: escritas seguram a linha e ficam num log de desfazer. */
class InMemoryTx implements LedgerTx {
  private readonly undo: Array<() => void> = []
  private readonly touched = new Set<string>()
  readonly handle: TransactionHandle

  constructor(private readonly repo: InMemoryLedgerRepository) {
    this.handle = new InMemoryTransactionHandle((undo) => {
      this.undo.push(undo)
    })
  }

  rollback(): void {
    for (const restore of this.undo.reverse()) restore()
    this.undo.length = 0
  }

  private remember(key: string, restore: () => void): void {
    if (this.touched.has(key)) return
    this.touched.add(key)
    this.undo.push(restore)
  }

  private rememberTxn(id: string): void {
    const previous = this.repo.txns.get(id)
    this.remember(`t:${id}`, () => {
      if (previous) this.repo.txns.set(id, previous)
      else this.repo.txns.delete(id)
    })
  }

  private rememberBalance(accountId: string): void {
    const previous = this.repo.balances.get(accountId)
    this.remember(`b:${accountId}`, () => {
      if (previous) this.repo.balances.set(accountId, previous)
      else this.repo.balances.delete(accountId)
    })
  }

  // ---- leituras (sem lock, como o READ COMMITTED do Postgres) ----------------------------

  findAccount(userId: string, accountId: string) {
    return this.repo.findAccount(userId, accountId)
  }
  listAccounts(userId: string, opts?: { includeArchived?: boolean }) {
    return this.repo.listAccounts(userId, opts)
  }
  findBalance(userId: string, accountId: string) {
    return this.repo.findBalance(userId, accountId)
  }
  listBalances(userId: string) {
    return this.repo.listBalances(userId)
  }
  findTxn(userId: string, id: string) {
    return this.repo.findTxn(userId, id)
  }
  findTransferLegs(userId: string, transferId: string) {
    return this.repo.findTransferLegs(userId, transferId)
  }
  refsExist(
    userId: string,
    refs: { categoryId?: string | null; merchantId?: string | null },
  ): Promise<{ category: boolean; merchant: boolean }> {
    return this.repo.refsExist(userId, refs)
  }
  listTransactions(userId: string, filter: TxnListFilter): Promise<TxnPage> {
    return this.repo.listTransactions(userId, filter)
  }
  findTxnByOccurrenceKey(userId: string, occurrenceKey: string) {
    return this.repo.findTxnByOccurrenceKey(userId, occurrenceKey)
  }
  linkRefsExist(
    userId: string,
    refs: { statementId: string | null; seriesId: string | null; importBatchId: string | null },
  ) {
    return this.repo.linkRefsExist(userId, refs)
  }

  // ---- locks ----------------------------------------------------------------------------

  async lockTxns(userId: string, ids: string[]): Promise<LedgerTxn[]> {
    const locked: LedgerTxn[] = []
    for (const id of [...new Set(ids)].sort()) {
      const before = this.repo.txns.get(id)
      if (!before || before.userId !== userId) continue
      await this.repo.locks.acquire(`t:${id}`, this)
      // Relê o estado já commitado depois de esperar (linha pode ter mudado ou sumido).
      const current = this.repo.txns.get(id)
      if (current && current.userId === userId) locked.push(clone(current))
    }
    return locked
  }

  async lockOccurrenceKeys(userId: string, occurrenceKeys: string[]): Promise<void> {
    for (const key of [...new Set(occurrenceKeys)].sort()) {
      await this.repo.locks.acquire(`o:${userId}:${key}`, this)
    }
  }

  // ---- escritas -------------------------------------------------------------------------

  async insertTxns(rows: NewLedgerTxn[]): Promise<LedgerTxn[]> {
    const inserted: LedgerTxn[] = []
    for (const row of rows) {
      this.repo.tick('insertTxn')
      if (row.amount === 0) throw new Error('CHECK transactions_amount_nonzero violado')
      if (
        row.transferId &&
        [...this.repo.txns.values()].some(
          (t) => t.transferId === row.transferId && t.accountId === row.accountId,
        )
      ) {
        throw new Error('Unique constraint (transferId, accountId) violada')
      }
      const id = this.repo.nextId()
      const at = this.repo.now()
      this.repo.assertUniqueKeys(row)
      const txn: LedgerTxn = {
        ...clone(row),
        ...normalizeLinks(row),
        id,
        createdAt: at,
        updatedAt: at,
      }
      this.rememberTxn(id)
      await this.repo.locks.acquire(`t:${id}`, this)
      this.repo.txns.set(id, txn)
      inserted.push(clone(txn))
    }
    return inserted
  }

  async updateTxn(userId: string, id: string, patch: TxnPatch): Promise<LedgerTxn> {
    this.repo.tick('updateTxn')
    await this.repo.locks.acquire(`t:${id}`, this)
    const current = this.repo.txns.get(id)
    if (!current || current.userId !== userId) {
      // Equivale ao P2025 do Prisma (linha apagada por outra transação).
      throw new LedgerError('LEDGER_CONCURRENT_UPDATE', 'Lançamento removido por outra requisição.')
    }
    const next: LedgerTxn = { ...current, ...clone(patch), updatedAt: this.repo.now() }
    this.repo.assertUniqueKeys(next, id)
    if (next.amount === 0) throw new Error('CHECK transactions_amount_nonzero violado')
    this.rememberTxn(id)
    this.repo.txns.set(id, next)
    return clone(next)
  }

  async deleteTxns(userId: string, ids: string[]): Promise<number> {
    this.repo.tick('deleteTxns')
    let count = 0
    for (const id of [...new Set(ids)].sort()) {
      await this.repo.locks.acquire(`t:${id}`, this)
      const txn = this.repo.txns.get(id)
      if (txn && txn.userId === userId) {
        this.rememberTxn(id)
        this.repo.txns.delete(id)
        count += 1
      }
    }
    return count
  }

  async incrementBalance(userId: string, accountId: string, delta: Buckets): Promise<BalanceRow> {
    this.repo.tick('incrementBalance')
    await this.repo.locks.acquire(`b:${accountId}`, this)
    const current = this.repo.balances.get(accountId) ?? {
      accountId,
      userId,
      balanceCleared: 0,
      balancePending: 0,
      balancePlanned: 0,
      version: 0,
    }
    const next: BalanceRow = {
      ...current,
      balanceCleared: current.balanceCleared + delta.cleared,
      balancePending: current.balancePending + delta.pending,
      balancePlanned: current.balancePlanned + delta.planned,
      version: current.version + 1,
    }
    this.rememberBalance(accountId)
    this.repo.balances.set(accountId, next)
    return clone(next)
  }

  async ensureBalance(userId: string, accountId: string): Promise<BalanceRow> {
    this.repo.tick('ensureBalance')
    const existing = this.repo.balances.get(accountId)
    if (existing) return clone(existing)
    await this.repo.locks.acquire(`b:${accountId}`, this)
    // Releitura após esperar o lock: outra transação pode ter criado a linha (ON CONFLICT).
    const again = this.repo.balances.get(accountId)
    if (again) return clone(again)
    const row: BalanceRow = {
      accountId,
      userId,
      balanceCleared: 0,
      balancePending: 0,
      balancePlanned: 0,
      version: 0,
    }
    this.rememberBalance(accountId)
    this.repo.balances.set(accountId, row)
    return clone(row)
  }

  async setBalance(userId: string, accountId: string, buckets: Buckets): Promise<BalanceRow> {
    this.repo.tick('setBalance')
    await this.repo.locks.acquire(`b:${accountId}`, this)
    const current = this.repo.balances.get(accountId)
    const next: BalanceRow = {
      accountId,
      userId,
      balanceCleared: buckets.cleared,
      balancePending: buckets.pending,
      balancePlanned: buckets.planned,
      version: current?.version ?? 0,
    }
    this.rememberBalance(accountId)
    this.repo.balances.set(accountId, next)
    return clone(next)
  }

  async sumByBucket(userId: string, accountId: string): Promise<Buckets> {
    const total = zeroBuckets()
    for (const txn of this.repo.txns.values()) {
      if (txn.userId === userId && txn.accountId === accountId) {
        total[bucketOf(txn.status)] += txn.amount
      }
    }
    return total
  }
}
