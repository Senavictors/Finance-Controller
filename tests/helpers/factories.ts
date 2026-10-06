/**
 * Fábricas de objetos puros para testes de domínio. Sem Prisma, sem I/O.
 *
 * Os formatos são mínimos e deliberadamente desacoplados do schema Prisma 2.0
 * (FC2-F0-02): cada engine pode estender via `overrides`. Ids determinísticos por contador;
 * chame `resetFactories()` em `beforeEach` para reiniciar a sequência.
 * Datas de calendário ao meio-dia UTC; dinheiro em centavos inteiros. Dados 100% sintéticos.
 */

export type Sequence = Record<string, number>

const counters: Sequence = {}

export function resetFactories(): void {
  for (const key of Object.keys(counters)) delete counters[key]
}

function nextId(prefix: string): string {
  counters[prefix] = (counters[prefix] ?? 0) + 1
  return `${prefix}-${String(counters[prefix]).padStart(4, '0')}`
}

/** Data de calendário ao meio-dia UTC, a partir de `YYYY-MM-DD`. */
export function calendarDate(isoDay: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
    throw new Error(`calendarDate: esperado YYYY-MM-DD, recebido "${isoDay}"`)
  }
  return new Date(`${isoDay}T12:00:00.000Z`)
}

export interface TestAccount {
  id: string
  name: string
  type: 'CHECKING' | 'SAVINGS' | 'CASH' | 'INVESTMENT'
  initialBalanceCents: number
  overdraftLimitCents: number
}

export function makeAccount(overrides: Partial<TestAccount> = {}): TestAccount {
  return {
    id: nextId('acc'),
    name: 'CONTA EXEMPLO',
    type: 'CHECKING',
    initialBalanceCents: 0,
    overdraftLimitCents: 0,
    ...overrides,
  }
}

export interface TestTxn {
  id: string
  accountId: string
  date: Date
  description: string
  /** Positivo = crédito (entrada); negativo = débito (saída). */
  amountCents: number
  kind: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  categoryId: string | null
}

export function makeTxn(overrides: Partial<TestTxn> = {}): TestTxn {
  const amountCents = overrides.amountCents ?? -1000
  return {
    id: nextId('txn'),
    accountId: 'acc-0001',
    date: calendarDate('2026-10-05'),
    description: 'MERCADO EXEMPLO',
    amountCents,
    kind: amountCents >= 0 ? 'INCOME' : 'EXPENSE',
    categoryId: null,
    ...overrides,
  }
}

export interface TestCard {
  id: string
  name: string
  limitCents: number
  /** Dia do mês (1-31) em que a fatura fecha. */
  closingDay: number
  /** Dia do mês (1-31) do vencimento. */
  dueDay: number
}

export function makeCard(overrides: Partial<TestCard> = {}): TestCard {
  return {
    id: nextId('card'),
    name: 'CARTAO EXEMPLO',
    limitCents: 500000,
    closingDay: 25,
    dueDay: 5,
    ...overrides,
  }
}

export interface TestLoan {
  id: string
  name: string
  principalCents: number
  /** Taxa mensal em ponto-base (1% = 100). */
  monthlyRateBps: number
  installments: number
  firstDueDate: Date
}

export function makeLoan(overrides: Partial<TestLoan> = {}): TestLoan {
  return {
    id: nextId('loan'),
    name: 'EMPRESTIMO EXEMPLO',
    principalCents: 1200000,
    monthlyRateBps: 150,
    installments: 12,
    firstDueDate: calendarDate('2026-11-10'),
    ...overrides,
  }
}
