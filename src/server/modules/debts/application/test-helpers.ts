import { OTHER_USER, USER, day, makeLedgerEnv } from '@/server/modules/ledger/testing'
import {
  InMemoryCardRevolvingReader,
  InMemoryCategoryKeyLookup,
  InMemoryLoanRepository,
} from '../infra/in-memory-loan-repository'
import type { DebtsDeps } from './ports'

export { OTHER_USER, USER, day }

/**
 * Ambiente de teste de aplicação de dívidas: ledger em memória (contas sintéticas `acc-a`
 * corrente com cheque especial de R$ 1.000,00, `acc-b` corrente sem limite, `acc-card` cartão),
 * repositório de dívidas em memória que participa do rollback do unit of work.
 */
export function makeDebtsEnv() {
  const ledger = makeLedgerEnv()
  const loans = new InMemoryLoanRepository()
  const cards = new InMemoryCardRevolvingReader()
  let seq = 0
  const deps: DebtsDeps = {
    loans,
    ledger: ledger.svc,
    cardStatements: cards,
    categories: new InMemoryCategoryKeyLookup(),
    newId: () => `loan-${++seq}`,
  }
  return { ledger, loans, cards, deps, userId: USER }
}

export type DebtsEnv = ReturnType<typeof makeDebtsEnv>

/** Saldo inicial sintético numa conta (ADJUSTMENT assinado). */
export async function seedBalance(
  env: DebtsEnv,
  accountId: string,
  amount: number,
  date = '2026-09-01',
) {
  await env.ledger.svc.createTransaction(
    { userId: USER },
    {
      accountId,
      kind: 'ADJUSTMENT',
      amount,
      date: day(date),
      description: 'Saldo inicial',
      excludeFromBudget: true,
    },
  )
}

/** Código do `DebtError` lançado por `fn` (ou `undefined`). */
export async function debtErrorCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn()
  } catch (error) {
    if (error instanceof Error && 'code' in error) return String((error as { code: unknown }).code)
    throw error
  }
  return undefined
}
