import { onRollback, type TransactionHandle } from '@/server/modules/ledger'
import type {
  IncomeAccountRef,
  IncomeRepository,
  IncomeRuleRecord,
  MeiLedgerRecord,
  MeiProfileRecord,
} from '../application/ports'

/** Fonte das contas: o `accounts` do repositório em memória do ledger (mesmo objeto, sem cópia). */
export interface AccountSource {
  accounts: Map<string, { id: string; userId: string; type: string; isArchived: boolean }>
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

/**
 * Repositório em memória do módulo (testes de aplicação). Lê as contas do repositório em
 * memória do ledger (assim a conta existe para os dois) e entra no rollback conjunto da unit of
 * work (`onRollback`). Não simula locks de linha: o Postgres real é coberto pelos testes de
 * integração.
 */
export class InMemoryIncomeRepository implements IncomeRepository {
  readonly rules = new Map<string, IncomeRuleRecord>()
  readonly profiles = new Map<string, MeiProfileRecord>()
  readonly meiLedgers = new Map<string, MeiLedgerRecord>()
  /** `userId:key` -> id da categoria. */
  readonly categories = new Map<string, string>()

  private seq = 0

  constructor(
    private readonly accountSource: AccountSource,
    private readonly now: () => Date = () => new Date('2026-10-05T12:00:00.000Z'),
  ) {}

  addCategory(userId: string, key: string, id: string = `cat-${key}`): void {
    this.categories.set(`${userId}:${key}`, id)
  }

  async findAccount(userId: string, accountId: string): Promise<IncomeAccountRef | null> {
    const account = this.accountSource.accounts.get(accountId)
    if (!account || account.userId !== userId) return null
    return {
      id: account.id,
      userId: account.userId,
      type: account.type,
      isArchived: account.isArchived,
    }
  }

  async listBusinessAccountIds(userId: string): Promise<string[]> {
    return [...this.accountSource.accounts.values()]
      .filter((a) => a.userId === userId && a.type === 'BUSINESS')
      .map((a) => a.id)
      .sort()
  }

  async resolveCategoryId(userId: string, key: string): Promise<string | null> {
    return this.categories.get(`${userId}:${key}`) ?? null
  }

  async listRules(userId: string, opts: { activeOnly?: boolean } = {}) {
    return [...this.rules.values()]
      .filter((r) => r.userId === userId && (!opts.activeOnly || r.isActive))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map(clone)
  }

  async findRule(userId: string, id: string) {
    const rule = this.rules.get(id)
    return rule && rule.userId === userId ? clone(rule) : null
  }

  async lockRules(userId: string, opts: { ruleId?: string; activeOnly?: boolean }) {
    return [...this.rules.values()]
      .filter((r) => r.userId === userId)
      .filter((r) => opts.ruleId === undefined || r.id === opts.ruleId)
      .filter((r) => opts.activeOnly !== true || r.isActive)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map(clone)
  }

  async insertRule(
    rule: Omit<IncomeRuleRecord, 'createdAt' | 'updatedAt'>,
    tx: TransactionHandle,
  ): Promise<IncomeRuleRecord> {
    const stamp = this.now()
    const row: IncomeRuleRecord = { ...clone(rule), createdAt: stamp, updatedAt: stamp }
    this.rules.set(row.id, row)
    onRollback(tx, () => this.rules.delete(row.id))
    return clone(row)
  }

  async updateRule(
    userId: string,
    id: string,
    patch: Partial<IncomeRuleRecord>,
    tx: TransactionHandle,
  ): Promise<IncomeRuleRecord> {
    const current = this.rules.get(id)
    if (!current || current.userId !== userId) throw new Error('income_rule não encontrada')
    const before = clone(current)
    const next: IncomeRuleRecord = { ...current, ...clone(patch), updatedAt: this.now() }
    this.rules.set(id, next)
    onRollback(tx, () => this.rules.set(id, before))
    return clone(next)
  }

  async findProfile(userId: string) {
    const profile = this.profiles.get(userId)
    return profile ? clone(profile) : null
  }

  async lockProfile(userId: string) {
    return this.findProfile(userId)
  }

  async upsertProfile(
    userId: string,
    id: string,
    data: Omit<MeiProfileRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    tx: TransactionHandle,
  ): Promise<MeiProfileRecord> {
    const before = this.profiles.get(userId)
    const stamp = this.now()
    const next: MeiProfileRecord = before
      ? { ...before, ...clone(data), updatedAt: stamp }
      : {
          id: id || `mei-${++this.seq}`,
          userId,
          ...clone(data),
          createdAt: stamp,
          updatedAt: stamp,
        }
    this.profiles.set(userId, next)
    onRollback(tx, () => {
      if (before) this.profiles.set(userId, before)
      else this.profiles.delete(userId)
    })
    return clone(next)
  }

  async findMeiLedger(userId: string, year: number) {
    const record = this.meiLedgers.get(`${userId}:${year}`)
    return record ? clone(record) : null
  }

  async upsertMeiLedger(record: MeiLedgerRecord, tx: TransactionHandle) {
    const key = `${record.userId}:${record.year}`
    const before = this.meiLedgers.get(key)
    this.meiLedgers.set(key, clone(record))
    onRollback(tx, () => {
      if (before) this.meiLedgers.set(key, before)
      else this.meiLedgers.delete(key)
    })
    return clone(record)
  }
}
