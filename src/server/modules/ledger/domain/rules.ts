import {
  LedgerError,
  MAX_ABS_AMOUNT,
  type AccountDelta,
  type Bucket,
  type Buckets,
  type TxnKind,
  type TxnStatus,
} from './types'

/** Valida que o valor é inteiro (centavos) e cabe no limite do ledger. */
export function assertAmountInRange(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new LedgerError('LEDGER_AMOUNT_OUT_OF_RANGE', 'O valor deve ser inteiro, em centavos.')
  }
  if (Math.abs(amount) > MAX_ABS_AMOUNT) {
    throw new LedgerError(
      'LEDGER_AMOUNT_OUT_OF_RANGE',
      `O valor excede o limite de ${MAX_ABS_AMOUNT} centavos.`,
    )
  }
}

/** Valores zerados nunca entram no ledger (CHECK `amount <> 0` é a segunda barreira). */
export function assertNonZero(amount: number): void {
  if (amount === 0) {
    throw new LedgerError('LEDGER_ZERO_AMOUNT', 'O valor do lançamento não pode ser zero.')
  }
}

/**
 * Sinal obrigatório por kind: EXPENSE/FEE/INTEREST saem (`< 0`), INCOME entra (`> 0`),
 * ADJUSTMENT aceita qualquer sinal. TRANSFER/CARD_PAYMENT são validados no par
 * (`assertTransferPair`); aqui só valida faixa e não-zero.
 */
export function assertSignForKind(kind: TxnKind, amount: number): void {
  assertAmountInRange(amount)
  assertNonZero(amount)
  switch (kind) {
    case 'EXPENSE':
    case 'FEE':
    case 'INTEREST':
      if (amount > 0) {
        throw new LedgerError('LEDGER_INVALID_SIGN', `${kind} exige valor negativo (saída).`, {
          kind,
        })
      }
      return
    case 'INCOME':
      if (amount < 0) {
        throw new LedgerError('LEDGER_INVALID_SIGN', 'INCOME exige valor positivo (entrada).', {
          kind,
        })
      }
      return
    case 'ADJUSTMENT':
    case 'TRANSFER':
    case 'CARD_PAYMENT':
      return
  }
}

/**
 * Aplica o sinal do kind a um valor informado em módulo (decisão FC2-F1-01: a API recebe o
 * módulo e o use-case aplica o sinal). Apenas `ADJUSTMENT` recebe o valor já assinado.
 * TRANSFER/CARD_PAYMENT não passam por aqui (usam `buildTransferLegs`).
 */
export function signedAmountFor(kind: TxnKind, informed: number): number {
  assertAmountInRange(informed)
  assertNonZero(informed)
  switch (kind) {
    case 'ADJUSTMENT':
      return informed
    case 'EXPENSE':
    case 'FEE':
    case 'INTEREST':
      if (informed < 0) {
        throw new LedgerError(
          'LEDGER_INVALID_SIGN',
          `${kind}: informe o valor em módulo (positivo); o sinal é aplicado pelo ledger.`,
          { kind },
        )
      }
      return 0 - informed
    case 'INCOME':
      if (informed < 0) {
        throw new LedgerError(
          'LEDGER_INVALID_SIGN',
          'INCOME: informe o valor em módulo (positivo).',
          { kind },
        )
      }
      return informed
    case 'TRANSFER':
    case 'CARD_PAYMENT':
      throw new LedgerError(
        'LEDGER_USE_TRANSFER',
        `${kind} é um par ligado de lançamentos: use createTransfer.`,
        { kind },
      )
  }
}

/** Datas de calendário são sempre meio-dia UTC (ADR-002, RN-07). */
export function assertCalendarDate(date: Date, field = 'date'): void {
  const valid =
    date instanceof Date &&
    !Number.isNaN(date.getTime()) &&
    date.getUTCHours() === 12 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  if (!valid) {
    throw new LedgerError(
      'LEDGER_INVALID_DATE',
      `${field}: datas de calendário devem estar ao meio-dia UTC.`,
      { field },
    )
  }
}

export function bucketOf(status: TxnStatus): Bucket {
  switch (status) {
    case 'PLANNED':
      return 'planned'
    case 'PENDING':
      return 'pending'
    case 'CLEARED':
    case 'RECONCILED':
      return 'cleared'
  }
}

export function zeroBuckets(): Buckets {
  return { cleared: 0, pending: 0, planned: 0 }
}

export function isZeroBuckets(b: Buckets): boolean {
  return b.cleared === 0 && b.pending === 0 && b.planned === 0
}

/** Delta que um lançamento contribui: o `amount` no balde do status, 0 nos demais. */
export function deltaFor(txn: { amount: number; status: TxnStatus }): Buckets {
  const delta = zeroBuckets()
  delta[bucketOf(txn.status)] = txn.amount
  return delta
}

/** Soma de deltas por balde. */
export function addBuckets(a: Buckets, b: Buckets): Buckets {
  return {
    cleared: a.cleared + b.cleared,
    pending: a.pending + b.pending,
    planned: a.planned + b.planned,
  }
}

/** Inverte o sinal de um delta (desfazer uma contribuição). */
export function negateBuckets(b: Buckets): Buckets {
  return { cleared: 0 - b.cleared, pending: 0 - b.pending, planned: 0 - b.planned }
}

export interface DeltaSource {
  accountId: string
  amount: number
  status: TxnStatus
}

/**
 * Deltas a aplicar nas contas quando um lançamento muda de `before` para `after`.
 * `before = null` é criação; `after = null` é remoção. Suporta mudança de `accountId`
 * (desfaz na conta antiga, soma na nova). Contas sem variação são omitidas; resultado ordenado
 * por `accountId` (ordem estável de lock no banco, evita deadlock entre transferências opostas).
 */
export function diffDeltas(before: DeltaSource | null, after: DeltaSource | null): AccountDelta[] {
  const byAccount = new Map<string, Buckets>()
  const apply = (accountId: string, delta: Buckets) => {
    byAccount.set(accountId, addBuckets(byAccount.get(accountId) ?? zeroBuckets(), delta))
  }
  if (before) apply(before.accountId, negateBuckets(deltaFor(before)))
  if (after) apply(after.accountId, deltaFor(after))
  return [...byAccount.entries()]
    .filter(([, delta]) => !isZeroBuckets(delta))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([accountId, delta]) => ({ accountId, delta }))
}

/** Junta deltas de várias mudanças (por conta), omitindo contas sem variação e ordenando por id. */
export function mergeDeltas(...lists: AccountDelta[][]): AccountDelta[] {
  const byAccount = new Map<string, Buckets>()
  for (const list of lists) {
    for (const { accountId, delta } of list) {
      byAccount.set(accountId, addBuckets(byAccount.get(accountId) ?? zeroBuckets(), delta))
    }
  }
  return [...byAccount.entries()]
    .filter(([, delta]) => !isZeroBuckets(delta))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([accountId, delta]) => ({ accountId, delta }))
}

/**
 * Transições de status. `RECONCILED` é origem proibida (imutável; desconciliar é caminho
 * explícito da F1-04). `RECONCILED` só é destino a partir de `CLEARED`. Demais: livres
 * (avanços e retrocessos entre PLANNED, PENDING e CLEARED; mesmo status é no-op).
 */
export function validateStatusChange(from: TxnStatus, to: TxnStatus): void {
  if (from === 'RECONCILED') {
    throw new LedgerError(
      'LEDGER_RECONCILED_LOCKED',
      'Lançamento conciliado é imutável: desfaça a conciliação antes de alterar o status.',
      { from, to },
    )
  }
  if (to === 'RECONCILED' && from !== 'CLEARED') {
    throw new LedgerError(
      'LEDGER_INVALID_STATUS_CHANGE',
      'Só lançamentos compensados (CLEARED) podem ser conciliados.',
      { from, to },
    )
  }
}

export function canChangeStatus(from: TxnStatus, to: TxnStatus): boolean {
  try {
    validateStatusChange(from, to)
    return true
  } catch {
    return false
  }
}

/** Campos editáveis em lançamento conciliado: apenas rótulos (RN-05). */
export const RECONCILED_MUTABLE_FIELDS = ['categoryId', 'notes', 'tags', 'merchantId'] as const

/** Campos do patch (com valor definido) que não podem mudar em lançamento conciliado. */
export function reconciledBlockedFields(patch: object): string[] {
  const allowed: readonly string[] = RECONCILED_MUTABLE_FIELDS
  return Object.entries(patch)
    .filter(([key, value]) => value !== undefined && !allowed.includes(key))
    .map(([key]) => key)
}

export function isMutableWhenReconciled(patch: object): boolean {
  return reconciledBlockedFields(patch).length === 0
}
