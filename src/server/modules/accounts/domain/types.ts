/**
 * Tipos do domínio de contas (FC2-F1-02). Domínio puro: sem banco, sem relógio implícito.
 * Dinheiro em centavos inteiros; o saldo NUNCA é coluna da conta: vem do ledger (ADR-019).
 */

export const ACCOUNT_TYPES = [
  'CHECKING',
  'SAVINGS',
  'WALLET',
  'INVESTMENT',
  'CREDIT_CARD',
  'BUSINESS',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** Tipos que contam como "caixa" (dinheiro disponível hoje). */
export const CASH_TYPES = [
  'CHECKING',
  'SAVINGS',
  'WALLET',
  'BUSINESS',
] as const satisfies readonly AccountType[]

/** Tipos com cheque especial. */
export const OVERDRAFT_TYPES = ['CHECKING', 'BUSINESS'] as const satisfies readonly AccountType[]

export const ACCOUNT_COLOR_KEYS = [
  'cat-1',
  'cat-2',
  'cat-3',
  'cat-4',
  'cat-5',
  'cat-6',
  'cat-7',
  'cat-8',
  'cat-9',
  'cat-10',
] as const

/** Limite de nome e de valores (cabe em `Int` do banco; igual ao teto do ledger). */
export const ACCOUNT_NAME_MAX = 60
export const MAX_CENTS = 2_000_000_000

/** Linha de conta como o domínio a enxerga (espelho de `Account`, sem acoplar ao Prisma). */
export interface AccountRecord {
  id: string
  userId: string
  name: string
  type: AccountType
  issuerKey: string | null
  networkKey: string | null
  colorKey: string | null
  icon: string | null
  /** Cheque especial, centavos (>= 0). */
  overdraftLimit: number
  /** Só `CREDIT_CARD`. */
  creditLimit: number | null
  closingDay: number | null
  dueDay: number | null
  isArchived: boolean
  sortOrder: number
}

/** Campos configuráveis de uma conta (entrada de criação, sem o saldo inicial). */
export interface AccountFields {
  name: string
  type: AccountType
  issuerKey?: string | null
  networkKey?: string | null
  colorKey?: string | null
  icon?: string | null
  overdraftLimit?: number | null
  creditLimit?: number | null
  closingDay?: number | null
  dueDay?: number | null
}

/** Campos normalizados, prontos para gravar (sem `undefined`). */
export interface NormalizedAccountFields {
  name: string
  type: AccountType
  issuerKey: string | null
  networkKey: string | null
  colorKey: string | null
  icon: string | null
  overdraftLimit: number
  creditLimit: number | null
  closingDay: number | null
  dueDay: number | null
}

export type AccountFieldErrors = Partial<Record<string, string[]>>
