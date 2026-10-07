import { expect } from 'vitest'
import { createLedgerService, type LedgerTxn } from '@/server/modules/ledger'
import {
  InMemoryLedgerRepository,
  OTHER_USER,
  USER,
  day,
  expectCacheMatchesLedger,
} from '@/server/modules/ledger/testing'
import { InMemoryCardsRepository } from '../infra/in-memory-cards-repository'
import { computeStatementTotals } from '../domain/statement-totals'
import { getStatementStatus } from '../domain/statement-status'
import { createCardsService } from './cards-service'
import type { CardAccountRow, CardsDeps, StatementRow } from './ports'

export { OTHER_USER, USER, day }

/** Meio-dia em São Paulo (15:00Z) do dia informado. */
export function noonSp(iso: string): Date {
  return new Date(`${iso}T15:00:00.000Z`)
}

/** Códigos de erro (`CardsError` ou `LedgerError`) de uma operação que deve falhar. */
export async function errorCodeOf(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn()
  } catch (error) {
    return (error as { code?: string }).code ?? `UNEXPECTED:${String(error)}`
  }
  return undefined
}

/**
 * Ambiente de teste de aplicação dos cartões: ledger em memória + repositório de cartões em
 * memória + relógio controlável. Contas sintéticas:
 * - `chk` corrente (cheque especial R$ 500,00), `chk2` corrente, `sav` poupança, `old` arquivada;
 * - `card` cartão limite R$ 5.000,00, fecha dia 10, vence dia 17;
 * - `card2` cartão limite R$ 3.000,00, fecha dia 25, vence dia 5; `loose` cartão sem ciclo.
 * "Hoje" começa em 2026-10-05.
 */
export function makeCardsEnv(options: { today?: string } = {}) {
  let now = noonSp(options.today ?? '2026-10-05')
  let seq = 0
  const clock = () => new Date(now)
  const ledgerRepo = new InMemoryLedgerRepository()
  const ledger = createLedgerService({
    repo: ledgerRepo,
    clock,
    uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  })
  const cardsRepo = new InMemoryCardsRepository()

  const accounts: Array<Partial<CardAccountRow> & { id: string; userId: string }> = [
    { id: 'chk', userId: USER, type: 'CHECKING', overdraftLimit: 50_000 },
    { id: 'chk2', userId: USER, type: 'CHECKING' },
    { id: 'sav', userId: USER, type: 'SAVINGS' },
    { id: 'old', userId: USER, type: 'CHECKING', isArchived: true },
    {
      id: 'card',
      userId: USER,
      type: 'CREDIT_CARD',
      creditLimit: 500_000,
      closingDay: 10,
      dueDay: 17,
    },
    {
      id: 'card2',
      userId: USER,
      type: 'CREDIT_CARD',
      creditLimit: 300_000,
      closingDay: 25,
      dueDay: 5,
    },
    { id: 'loose', userId: USER, type: 'CREDIT_CARD', creditLimit: 100_000 },
    { id: 'other-chk', userId: OTHER_USER, type: 'CHECKING' },
    {
      id: 'other-card',
      userId: OTHER_USER,
      type: 'CREDIT_CARD',
      creditLimit: 100_000,
      closingDay: 10,
      dueDay: 17,
    },
  ]
  for (const account of accounts) {
    cardsRepo.addAccount(account)
    ledgerRepo.addAccount({
      id: account.id,
      userId: account.userId,
      type: account.type,
      isArchived: account.isArchived,
      overdraftLimit: account.overdraftLimit,
      creditLimit: account.creditLimit ?? null,
    })
  }

  let deterministic = 0
  const deps: CardsDeps = {
    ledger,
    repo: cardsRepo,
    clock,
    uuid: () => `card-id-${String(++deterministic).padStart(5, '0')}`,
  }
  const svc = createCardsService(deps)
  const ctx = { userId: USER }

  /** Saldo inicial de uma conta (ADJUSTMENT assinado, CLEARED). */
  async function fund(accountId: string, cents: number) {
    await ledger.createTransaction(ctx, {
      accountId,
      kind: 'ADJUSTMENT',
      amount: cents,
      date: day('2026-01-01'),
      description: 'Saldo inicial',
      excludeFromBudget: true,
    })
  }

  /** Todos os lançamentos do ledger de uma conta (por data). */
  function txnsOf(accountId: string): LedgerTxn[] {
    return ledgerRepo.txnsOf(accountId)
  }

  function statementsOf(accountId: string): StatementRow[] {
    return [...cardsRepo.statements.values()]
      .filter((s) => s.accountId === accountId)
      .sort((a, b) => (a.statementKey < b.statementKey ? -1 : 1))
  }

  function statementByKey(accountId: string, key: string): StatementRow {
    const row = statementsOf(accountId).find((s) => s.statementKey === key)
    if (!row) throw new Error(`fatura ${key} do cartão ${accountId} não existe`)
    return row
  }

  /**
   * Invariantes depois de qualquer operação: o cache `AccountBalance` bate com o ledger e o
   * cache da fatura (`totalAmount`/`paidAmount`/`status`) bate com os lançamentos ligados a ela.
   */
  function expectConsistent(options: { checkStatus?: boolean } = {}) {
    expectCacheMatchesLedger(ledgerRepo)
    for (const row of cardsRepo.statements.values()) {
      const items = [...ledgerRepo.txns.values()].filter((t) => t.statementId === row.id)
      const totals = computeStatementTotals(items)
      expect({ id: row.id, total: row.totalAmount, paid: row.paidAmount }).toEqual({
        id: row.id,
        total: totals.net,
        paid: totals.paid,
      })
      if (options.checkStatus === false) continue
      expect(row.status).toBe(
        getStatementStatus({
          closingDate: row.closingDate,
          dueDate: row.dueDate,
          totalAmount: totals.net,
          paidAmount: totals.paid,
          now,
        }),
      )
    }
  }

  return {
    ledgerRepo,
    ledger,
    cardsRepo,
    deps,
    svc,
    ctx,
    clock,
    setNow: (iso: string) => {
      now = noonSp(iso)
    },
    fund,
    txnsOf,
    statementsOf,
    statementByKey,
    expectConsistent,
  }
}

export type CardsEnv = ReturnType<typeof makeCardsEnv>
