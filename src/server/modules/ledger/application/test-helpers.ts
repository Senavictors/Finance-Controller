import { computeBalances } from '../domain/balance'
import { LedgerError, type Buckets, type LedgerErrorCode } from '../domain/types'
import { InMemoryLedgerRepository } from '../infra/in-memory-ledger-repository'
import { createLedgerService } from './ledger-service'
import type { LedgerDeps, LedgerMutationEvent } from './ports'

export const USER = 'user-1'
export const OTHER_USER = 'user-2'

/** Meio-dia UTC de um dia de calendário `YYYY-MM-DD`. */
export function day(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`)
}

/**
 * Ambiente de teste de aplicação: repositório em memória + serviço ligado, com contas
 * sintéticas. `uuid` é determinístico (`00000000-0000-4000-8000-00000000000N`).
 */
export function makeLedgerEnv() {
  const events: LedgerMutationEvent[] = []
  const repo = new InMemoryLedgerRepository()
  let uuidSeq = 0
  const deps: LedgerDeps = {
    repo,
    clock: () => new Date('2026-10-05T12:00:00.000Z'),
    uuid: () => `00000000-0000-4000-8000-${String(++uuidSeq).padStart(12, '0')}`,
    afterLedgerMutation: (event) => {
      events.push(event)
    },
  }
  repo.addAccount({ id: 'acc-a', userId: USER, type: 'CHECKING', overdraftLimit: 100000 })
  repo.addAccount({ id: 'acc-b', userId: USER, type: 'CHECKING', overdraftLimit: 0 })
  repo.addAccount({ id: 'acc-sav', userId: USER, type: 'SAVINGS' })
  repo.addAccount({
    id: 'acc-card',
    userId: USER,
    type: 'CREDIT_CARD',
    creditLimit: 500000,
  })
  repo.addAccount({ id: 'acc-old', userId: USER, type: 'CHECKING', isArchived: true })
  repo.addAccount({ id: 'acc-other', userId: OTHER_USER, type: 'CHECKING' })
  return { repo, deps, svc: createLedgerService(deps), ctx: { userId: USER }, events }
}

export type LedgerEnv = ReturnType<typeof makeLedgerEnv>

/** Linha do cache como `Buckets` (zeros se ausente). */
export function cachedBuckets(repo: InMemoryLedgerRepository, accountId: string): Buckets {
  const row = repo.balances.get(accountId)
  return {
    cleared: row?.balanceCleared ?? 0,
    pending: row?.balancePending ?? 0,
    planned: row?.balancePlanned ?? 0,
  }
}

/** Saldo recomputado a partir do ledger da conta (`computeBalances`). */
export function ledgerBuckets(repo: InMemoryLedgerRepository, accountId: string): Buckets {
  return computeBalances(repo.txnsOf(accountId))
}

/** Invariante CA-01: o cache de todas as contas é igual a `computeBalances` do ledger. */
export function expectCacheMatchesLedger(repo: InMemoryLedgerRepository): void {
  for (const account of repo.accounts.values()) {
    const cached = cachedBuckets(repo, account.id)
    const computed = ledgerBuckets(repo, account.id)
    if (
      cached.cleared !== computed.cleared ||
      cached.pending !== computed.pending ||
      cached.planned !== computed.planned
    ) {
      throw new Error(
        `Drift na conta ${account.id}: cache=${JSON.stringify(cached)} ledger=${JSON.stringify(computed)}`,
      )
    }
  }
}

/** Executa `fn` e devolve o `code` do `LedgerError` lançado (ou `undefined` se não lançou). */
export async function ledgerErrorCode(
  fn: () => Promise<unknown>,
): Promise<LedgerErrorCode | undefined> {
  try {
    await fn()
  } catch (error) {
    if (error instanceof LedgerError) return error.code
    throw error
  }
  return undefined
}
