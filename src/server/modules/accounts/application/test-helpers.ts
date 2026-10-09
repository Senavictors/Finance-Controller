import { onRollback, type TransactionHandle } from '@/server/modules/ledger'
import {
  InMemoryLedgerRepository,
  OTHER_USER,
  USER,
  day,
  makeLedgerEnv,
} from '@/server/modules/ledger/testing'

import { AccountError } from '../domain/errors'
import type { AccountRecord } from '../domain/types'
import { createAccountsService } from './accounts-service'
import type { AccountDeps, AccountRepository, AccountUpdate, NewAccountRecord } from './ports'

export { OTHER_USER, USER, day }

/**
 * Repositório de contas em memória para testes de aplicação. Espelha o `unique(userId, name)`
 * do banco (sensível a caixa) e torna cada conta visível ao ledger em memória (a conta precisa
 * existir para o ledger aceitar lançamentos); escritas dentro de uma unit of work entram no
 * rollback conjunto via `onRollback`. Apagar a conta remove também a linha de saldo (cascata do
 * banco).
 */
export class InMemoryAccountRepository implements AccountRepository {
  readonly rows = new Map<string, AccountRecord>()

  constructor(private readonly ledgerRepo: InMemoryLedgerRepository) {}

  private publish(row: AccountRecord): void {
    this.ledgerRepo.addAccount({
      id: row.id,
      userId: row.userId,
      type: row.type,
      isArchived: row.isArchived,
      overdraftLimit: row.overdraftLimit,
      creditLimit: row.creditLimit,
    })
  }

  async listByUser(userId: string): Promise<AccountRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((row) => ({ ...row }))
  }

  async findById(userId: string, id: string): Promise<AccountRecord | null> {
    const row = this.rows.get(id)
    return row && row.userId === userId ? { ...row } : null
  }

  async insert(row: NewAccountRecord, tx?: TransactionHandle): Promise<AccountRecord> {
    for (const other of this.rows.values()) {
      if (other.userId === row.userId && other.name === row.name) {
        throw new AccountError('ACCOUNT_NAME_TAKEN', 'Já existe uma conta com esse nome.')
      }
    }
    const record: AccountRecord = { ...row, isArchived: false }
    this.rows.set(record.id, record)
    this.publish(record)
    onRollback(tx, () => {
      this.rows.delete(record.id)
      this.ledgerRepo.accounts.delete(record.id)
    })
    return { ...record }
  }

  async update(
    userId: string,
    id: string,
    patch: AccountUpdate,
    tx?: TransactionHandle,
  ): Promise<AccountRecord | null> {
    const before = this.rows.get(id)
    if (!before || before.userId !== userId) return null
    if (patch.name !== undefined) {
      for (const other of this.rows.values()) {
        if (other.id !== id && other.userId === userId && other.name === patch.name) {
          throw new AccountError('ACCOUNT_NAME_TAKEN', 'Já existe uma conta com esse nome.')
        }
      }
    }
    const after: AccountRecord = { ...before, ...patch }
    this.rows.set(id, after)
    this.publish(after)
    onRollback(tx, () => {
      this.rows.set(id, before)
      this.publish(before)
    })
    return { ...after }
  }

  async delete(userId: string, id: string, tx?: TransactionHandle): Promise<void> {
    const row = this.rows.get(id)
    if (!row || row.userId !== userId) return
    const balance = this.ledgerRepo.balances.get(id)
    this.rows.delete(id)
    this.ledgerRepo.accounts.delete(id)
    this.ledgerRepo.balances.delete(id)
    onRollback(tx, () => {
      this.rows.set(id, row)
      this.publish(row)
      if (balance) this.ledgerRepo.balances.set(id, balance)
    })
  }

  async setSortOrders(userId: string, orderedIds: string[]): Promise<void> {
    for (const [index, id] of orderedIds.entries()) {
      const row = this.rows.get(id)
      if (row && row.userId === userId) row.sortOrder = index
    }
  }

  async nextSortOrder(userId: string): Promise<number> {
    const orders = [...this.rows.values()]
      .filter((r) => r.userId === userId)
      .map((r) => r.sortOrder)
    return orders.length === 0 ? 0 : Math.max(...orders) + 1
  }
}

/** Ambiente de teste: ledger em memória (sem as contas-fixture) + contas em memória. */
export function makeAccountsEnv() {
  const ledgerEnv = makeLedgerEnv()
  // O ambiente do ledger traz contas-fixture; contas cria as suas.
  ledgerEnv.repo.accounts.clear()
  const accounts = new InMemoryAccountRepository(ledgerEnv.repo)
  let idSeq = 0
  const deps: AccountDeps = {
    accounts,
    ledger: ledgerEnv.svc,
    clock: () => new Date('2026-10-05T12:00:00.000Z'),
    newId: () => `acc-${String(++idSeq).padStart(4, '0')}`,
  }
  return {
    ...ledgerEnv,
    accounts,
    deps,
    svc: createAccountsService(deps),
    ledgerSvc: ledgerEnv.svc,
  }
}

export type AccountsEnv = ReturnType<typeof makeAccountsEnv>

/** Executa `fn` e devolve o `code` do erro lançado (de contas ou do ledger), ou `undefined`. */
export async function errorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn()
    return undefined
  } catch (error) {
    return (error as { code?: string }).code ?? 'UNKNOWN'
  }
}
