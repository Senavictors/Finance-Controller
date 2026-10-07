/**
 * Tipos do domínio do ledger (ADR-019). Domínio puro: sem acesso a banco, sem relógio implícito.
 * Dinheiro em centavos inteiros e assinados (entrada > 0, saída < 0); datas de calendário ao
 * meio-dia UTC (ADR-002).
 */

export const TXN_KINDS = [
  'EXPENSE',
  'INCOME',
  'TRANSFER',
  'CARD_PAYMENT',
  'FEE',
  'INTEREST',
  'ADJUSTMENT',
] as const
export type TxnKind = (typeof TXN_KINDS)[number]

export const TXN_STATUSES = ['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED'] as const
export type TxnStatus = (typeof TXN_STATUSES)[number]

export const ACCOUNT_KINDS = [
  'CHECKING',
  'SAVINGS',
  'WALLET',
  'INVESTMENT',
  'CREDIT_CARD',
  'BUSINESS',
] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const TXN_SOURCES = [
  'MANUAL',
  'QUICKADD',
  'IMPORT',
  'BOT',
  'RECURRING',
  'OPEN_FINANCE',
] as const
export type TxnSource = (typeof TXN_SOURCES)[number]

export const CATEGORY_SOURCES = ['USER', 'RULE', 'MERCHANT', 'LLM', 'PARSER', 'IMPORT'] as const
export type CategorySource = (typeof CATEGORY_SOURCES)[number]

export const REVIEW_STATES = ['NEEDS_REVIEW', 'REVIEWED'] as const
export type ReviewState = (typeof REVIEW_STATES)[number]

/** Kinds que formam um par ligado por `transferId` (uma perna por conta). */
export const TRANSFER_KINDS = ['TRANSFER', 'CARD_PAYMENT'] as const satisfies readonly TxnKind[]
export type TransferKind = (typeof TRANSFER_KINDS)[number]

/** Limite de |amount| (cabe com folga em `Int` do banco, e somas de baldes não estouram 2^53). */
export const MAX_ABS_AMOUNT = 2_000_000_000

/**
 * Campos que o usuário pode travar manualmente (ADR-024: `userLocked` vence qualquer engine).
 * Chave especial `statement`: o usuário moveu o lançamento de fatura (`statementId`/`statementKey`).
 */
export type UserLocked = Record<string, boolean>

/**
 * Vínculos opcionais de um lançamento com outros módulos (todos espelham colunas de
 * `transactions`). O ledger só os grava e valida; as regras de fatura, série, importação e
 * categorização pertencem aos módulos donos.
 */
export interface TxnLinks {
  /** Estorno: id do lançamento original (mesmo usuário). */
  refundOfId: string | null
  /** Série recorrente (`RecurringSeries`). */
  seriesId: string | null
  /** Chave de idempotência de previstos, única por usuário (ex.: `<seriesId>:AAAA-MM-DD`). */
  occurrenceKey: string | null
  /** Fatura do cartão (`CreditCardStatement`). */
  statementId: string | null
  /** Mês de vencimento da fatura, `AAAA-MM`. */
  statementKey: string | null
  importBatchId: string | null
  /** Hash de importação, único por usuário (dedup). */
  importHash: string | null
  categorySource: CategorySource | null
  /** 0-100. */
  aiConfidence: number | null
}

/** Nomes dos vínculos (ordem estável). */
export const TXN_LINK_FIELDS = [
  'refundOfId',
  'seriesId',
  'occurrenceKey',
  'statementId',
  'statementKey',
  'importBatchId',
  'importHash',
  'categorySource',
  'aiConfidence',
] as const satisfies ReadonlyArray<keyof TxnLinks>

/** Lançamento do ledger como o domínio o enxerga (espelho de `Transaction`, sem acoplamento ao banco). */
export interface LedgerTxn extends TxnLinks {
  id: string
  userId: string
  accountId: string
  categoryId: string | null
  merchantId: string | null
  kind: TxnKind
  status: TxnStatus
  review: ReviewState
  source: TxnSource
  /** Centavos, assinado, nunca zero. */
  amount: number
  /** Meio-dia UTC. */
  date: Date
  postedDate: Date | null
  description: string
  rawDescription: string | null
  notes: string | null
  tags: string[]
  transferId: string | null
  excludeFromBudget: boolean
  userLocked: UserLocked
  createdAt: Date
  updatedAt: Date
}

/** Lançamento a inserir (o repositório atribui `id`, `createdAt` e `updatedAt`). */
export interface NewLedgerTxn extends Partial<TxnLinks> {
  userId: string
  accountId: string
  categoryId: string | null
  merchantId: string | null
  kind: TxnKind
  status: TxnStatus
  review: ReviewState
  source: TxnSource
  amount: number
  date: Date
  postedDate: Date | null
  description: string
  rawDescription: string | null
  notes: string | null
  tags: string[]
  transferId: string | null
  excludeFromBudget: boolean
  userLocked: UserLocked
}

/** Os três baldes de saldo (ADR-019). */
export interface Buckets {
  cleared: number
  pending: number
  planned: number
}

export type Bucket = keyof Buckets

/** Delta de saldo a aplicar em uma conta. */
export interface AccountDelta {
  accountId: string
  delta: Buckets
}

export type LedgerWarningCode =
  | 'OVERDRAFT_USED'
  | 'OVERDRAFT_LIMIT_EXCEEDED'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'NEGATIVE_BALANCE_UNEXPECTED'

export interface LedgerWarning {
  code: LedgerWarningCode
  accountId?: string
}

export type LimitKind = 'OVERDRAFT' | 'CREDIT' | 'NONE'

/** Uso do limite (cheque especial ou cartão). `excess` > 0 não bloqueia: só informa. */
export interface LimitUsage {
  kind: LimitKind
  limit: number
  used: number
  available: number
  excess: number
}

/** Posição de uma conta: saldos por balde, saldo atual, projetado e uso do limite. */
export interface AccountPosition {
  accountId: string
  accountType: AccountKind
  balanceCleared: number
  balancePending: number
  balancePlanned: number
  /** cleared + pending: o que existe hoje na conta. */
  current: number
  /** cleared + pending + planned: com os previstos. */
  projected: number
  usage: LimitUsage
  warnings: LedgerWarning[]
}

/** Códigos estáveis de erro do ledger (contrato público: UI, bot e MCP dependem deles). */
export const LEDGER_ERROR_CODES = [
  'LEDGER_INVALID_SIGN',
  'LEDGER_ZERO_AMOUNT',
  'LEDGER_AMOUNT_OUT_OF_RANGE',
  'LEDGER_INVALID_DATE',
  'LEDGER_INVALID_KIND',
  'LEDGER_INVALID_STATUS_CHANGE',
  'LEDGER_RECONCILED_LOCKED',
  'LEDGER_SAME_ACCOUNT',
  'LEDGER_USE_TRANSFER',
  'LEDGER_TRANSFER_KIND_IMMUTABLE',
  'LEDGER_TRANSFER_ACCOUNT_IMMUTABLE',
  'LEDGER_TRANSFER_PAIR_BROKEN',
  'LEDGER_CARD_TRANSFER_SOURCE',
  'LEDGER_ACCOUNT_ARCHIVED',
  'LEDGER_ACCOUNT_NOT_FOUND',
  'LEDGER_TXN_NOT_FOUND',
  'LEDGER_CATEGORY_NOT_FOUND',
  'LEDGER_MERCHANT_NOT_FOUND',
  'LEDGER_EMPTY_PATCH',
  'LEDGER_INVALID_INPUT',
  'LEDGER_CONCURRENT_UPDATE',
  'LEDGER_INVALID_LINK',
  'LEDGER_LINK_NOT_FOUND',
  'LEDGER_DUPLICATE_KEY',
  'LEDGER_NESTED_TRANSACTION',
] as const
export type LedgerErrorCode = (typeof LEDGER_ERROR_CODES)[number]

export type LedgerErrorCategory = 'INVALID' | 'NOT_FOUND' | 'CONFLICT'

const CATEGORY_BY_CODE: Record<LedgerErrorCode, LedgerErrorCategory> = {
  LEDGER_INVALID_SIGN: 'INVALID',
  LEDGER_ZERO_AMOUNT: 'INVALID',
  LEDGER_AMOUNT_OUT_OF_RANGE: 'INVALID',
  LEDGER_INVALID_DATE: 'INVALID',
  LEDGER_INVALID_KIND: 'INVALID',
  LEDGER_INVALID_STATUS_CHANGE: 'CONFLICT',
  LEDGER_RECONCILED_LOCKED: 'CONFLICT',
  LEDGER_SAME_ACCOUNT: 'INVALID',
  LEDGER_USE_TRANSFER: 'INVALID',
  LEDGER_TRANSFER_KIND_IMMUTABLE: 'CONFLICT',
  LEDGER_TRANSFER_ACCOUNT_IMMUTABLE: 'CONFLICT',
  LEDGER_TRANSFER_PAIR_BROKEN: 'CONFLICT',
  LEDGER_CARD_TRANSFER_SOURCE: 'INVALID',
  LEDGER_ACCOUNT_ARCHIVED: 'CONFLICT',
  LEDGER_ACCOUNT_NOT_FOUND: 'NOT_FOUND',
  LEDGER_TXN_NOT_FOUND: 'NOT_FOUND',
  LEDGER_CATEGORY_NOT_FOUND: 'NOT_FOUND',
  LEDGER_MERCHANT_NOT_FOUND: 'NOT_FOUND',
  LEDGER_EMPTY_PATCH: 'INVALID',
  LEDGER_INVALID_INPUT: 'INVALID',
  LEDGER_CONCURRENT_UPDATE: 'CONFLICT',
  LEDGER_INVALID_LINK: 'INVALID',
  LEDGER_LINK_NOT_FOUND: 'NOT_FOUND',
  LEDGER_DUPLICATE_KEY: 'CONFLICT',
  LEDGER_NESTED_TRANSACTION: 'CONFLICT',
}

/** Erro de regra do ledger com código estável (a camada HTTP traduz para 400/404/409). */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode
  readonly category: LedgerErrorCategory
  readonly details?: Record<string, unknown>

  constructor(code: LedgerErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'LedgerError'
    this.code = code
    this.category = CATEGORY_BY_CODE[code]
    this.details = details
  }
}

export function isLedgerError(error: unknown): error is LedgerError {
  return error instanceof LedgerError
}
