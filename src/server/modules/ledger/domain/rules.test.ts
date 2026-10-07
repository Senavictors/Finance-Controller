import { describe, expect, it } from 'vitest'
import {
  addBuckets,
  assertAmountInRange,
  assertCalendarDate,
  assertSignForKind,
  bucketOf,
  canChangeStatus,
  deltaFor,
  diffDeltas,
  isMutableWhenReconciled,
  isZeroBuckets,
  mergeDeltas,
  negateBuckets,
  reconciledBlockedFields,
  signedAmountFor,
  validateStatusChange,
  zeroBuckets,
} from './rules'
import { LedgerError, TXN_KINDS, TXN_STATUSES, type TxnKind, type TxnStatus } from './types'

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof LedgerError) return error.code
    throw error
  }
  return undefined
}

describe('assertSignForKind', () => {
  it('EXPENSE, FEE e INTEREST exigem valor negativo', () => {
    for (const kind of ['EXPENSE', 'FEE', 'INTEREST'] as const) {
      expect(codeOf(() => assertSignForKind(kind, 10000))).toBe('LEDGER_INVALID_SIGN')
      expect(codeOf(() => assertSignForKind(kind, -10000))).toBeUndefined()
    }
  })

  it('INCOME exige valor positivo', () => {
    expect(codeOf(() => assertSignForKind('INCOME', -10000))).toBe('LEDGER_INVALID_SIGN')
    expect(codeOf(() => assertSignForKind('INCOME', 10000))).toBeUndefined()
  })

  it('valor zero falha para todos os kinds', () => {
    for (const kind of TXN_KINDS) {
      expect(codeOf(() => assertSignForKind(kind, 0))).toBe('LEDGER_ZERO_AMOUNT')
    }
  })

  it('ADJUSTMENT aceita qualquer sinal; TRANSFER/CARD_PAYMENT são validados no par', () => {
    expect(codeOf(() => assertSignForKind('ADJUSTMENT', 500))).toBeUndefined()
    expect(codeOf(() => assertSignForKind('ADJUSTMENT', -500))).toBeUndefined()
    expect(codeOf(() => assertSignForKind('TRANSFER', -500))).toBeUndefined()
    expect(codeOf(() => assertSignForKind('CARD_PAYMENT', 500))).toBeUndefined()
  })

  it('rejeita fração e valores acima de 2.000.000.000 em módulo', () => {
    expect(codeOf(() => assertSignForKind('INCOME', 10.5))).toBe('LEDGER_AMOUNT_OUT_OF_RANGE')
    expect(codeOf(() => assertSignForKind('INCOME', Number.NaN))).toBe('LEDGER_AMOUNT_OUT_OF_RANGE')
    expect(codeOf(() => assertSignForKind('INCOME', 2_000_000_001))).toBe(
      'LEDGER_AMOUNT_OUT_OF_RANGE',
    )
    expect(codeOf(() => assertSignForKind('EXPENSE', -2_000_000_001))).toBe(
      'LEDGER_AMOUNT_OUT_OF_RANGE',
    )
    expect(codeOf(() => assertSignForKind('INCOME', 2_000_000_000))).toBeUndefined()
    expect(codeOf(() => assertAmountInRange(-2_000_000_000))).toBeUndefined()
  })
})

describe('signedAmountFor (a API recebe módulo; o use-case aplica o sinal)', () => {
  it('aplica sinal negativo a EXPENSE, FEE e INTEREST', () => {
    expect(signedAmountFor('EXPENSE', 2500)).toBe(-2500)
    expect(signedAmountFor('FEE', 990)).toBe(-990)
    expect(signedAmountFor('INTEREST', 120)).toBe(-120)
  })

  it('mantém INCOME positivo e ADJUSTMENT como informado', () => {
    expect(signedAmountFor('INCOME', 2500)).toBe(2500)
    expect(signedAmountFor('ADJUSTMENT', -300)).toBe(-300)
    expect(signedAmountFor('ADJUSTMENT', 300)).toBe(300)
  })

  it('rejeita módulo negativo, zero e kinds de par', () => {
    expect(codeOf(() => signedAmountFor('EXPENSE', -100))).toBe('LEDGER_INVALID_SIGN')
    expect(codeOf(() => signedAmountFor('INCOME', -100))).toBe('LEDGER_INVALID_SIGN')
    expect(codeOf(() => signedAmountFor('EXPENSE', 0))).toBe('LEDGER_ZERO_AMOUNT')
    expect(codeOf(() => signedAmountFor('TRANSFER', 100))).toBe('LEDGER_USE_TRANSFER')
    expect(codeOf(() => signedAmountFor('CARD_PAYMENT', 100))).toBe('LEDGER_USE_TRANSFER')
  })
})

describe('assertCalendarDate', () => {
  it('aceita meio-dia UTC e rejeita outros horários, datas inválidas e não-Date', () => {
    expect(codeOf(() => assertCalendarDate(new Date('2026-10-05T12:00:00.000Z')))).toBeUndefined()
    expect(codeOf(() => assertCalendarDate(new Date('2026-10-05T00:00:00.000Z')))).toBe(
      'LEDGER_INVALID_DATE',
    )
    expect(codeOf(() => assertCalendarDate(new Date('2026-10-05T12:00:00.001Z')))).toBe(
      'LEDGER_INVALID_DATE',
    )
    expect(codeOf(() => assertCalendarDate(new Date('x')))).toBe('LEDGER_INVALID_DATE')
    expect(codeOf(() => assertCalendarDate('2026-10-05' as unknown as Date))).toBe(
      'LEDGER_INVALID_DATE',
    )
  })

  it('não depende do fuso do processo (31/12 e 29/02 no meio-dia UTC)', () => {
    expect(codeOf(() => assertCalendarDate(new Date('2026-12-31T12:00:00.000Z')))).toBeUndefined()
    expect(codeOf(() => assertCalendarDate(new Date('2028-02-29T12:00:00.000Z')))).toBeUndefined()
  })
})

describe('bucketOf e deltaFor', () => {
  it('mapeia status para balde', () => {
    expect(bucketOf('PLANNED')).toBe('planned')
    expect(bucketOf('PENDING')).toBe('pending')
    expect(bucketOf('CLEARED')).toBe('cleared')
    expect(bucketOf('RECONCILED')).toBe('cleared')
  })

  it.each([
    ['PLANNED', { cleared: 0, pending: 0, planned: -700 }],
    ['PENDING', { cleared: 0, pending: -700, planned: 0 }],
    ['CLEARED', { cleared: -700, pending: 0, planned: 0 }],
    ['RECONCILED', { cleared: -700, pending: 0, planned: 0 }],
  ] as const)('deltaFor %s coloca o amount só no balde do status', (status, expected) => {
    expect(deltaFor({ amount: -700, status })).toEqual(expected)
  })

  it('helpers de baldes', () => {
    expect(isZeroBuckets(zeroBuckets())).toBe(true)
    expect(
      addBuckets({ cleared: 1, pending: 2, planned: 3 }, { cleared: 1, pending: 1, planned: 1 }),
    ).toEqual({
      cleared: 2,
      pending: 3,
      planned: 4,
    })
    expect(negateBuckets(zeroBuckets())).toEqual(zeroBuckets())
  })
})

describe('diffDeltas', () => {
  const base = { accountId: 'a', amount: -1000, status: 'CLEARED' as TxnStatus }

  it('criação e remoção', () => {
    expect(diffDeltas(null, base)).toEqual([
      { accountId: 'a', delta: { cleared: -1000, pending: 0, planned: 0 } },
    ])
    expect(diffDeltas(base, null)).toEqual([
      { accountId: 'a', delta: { cleared: 1000, pending: 0, planned: 0 } },
    ])
    expect(diffDeltas(null, null)).toEqual([])
  })

  it('mudança de valor', () => {
    expect(diffDeltas(base, { ...base, amount: -1500 })).toEqual([
      { accountId: 'a', delta: { cleared: -500, pending: 0, planned: 0 } },
    ])
  })

  it('mudança de status PLANNED -> CLEARED move o valor de balde', () => {
    expect(
      diffDeltas(
        { accountId: 'a', amount: 500000, status: 'PLANNED' },
        { accountId: 'a', amount: 500000, status: 'CLEARED' },
      ),
    ).toEqual([{ accountId: 'a', delta: { cleared: 500000, pending: 0, planned: -500000 } }])
  })

  it('CLEARED <-> RECONCILED não muda saldo', () => {
    expect(diffDeltas(base, { ...base, status: 'RECONCILED' })).toEqual([])
  })

  it('mudança de conta move o delta de A para B (ordenado por id)', () => {
    expect(diffDeltas(base, { ...base, accountId: 'b' })).toEqual([
      { accountId: 'a', delta: { cleared: 1000, pending: 0, planned: 0 } },
      { accountId: 'b', delta: { cleared: -1000, pending: 0, planned: 0 } },
    ])
  })

  it('valor e status juntos', () => {
    expect(diffDeltas(base, { accountId: 'a', amount: -400, status: 'PENDING' })).toEqual([
      { accountId: 'a', delta: { cleared: 1000, pending: -400, planned: 0 } },
    ])
  })

  it('sem mudança não gera delta', () => {
    expect(diffDeltas(base, { ...base })).toEqual([])
  })

  it('mergeDeltas soma por conta e omite zerados', () => {
    const merged = mergeDeltas(
      [{ accountId: 'b', delta: { cleared: 100, pending: 0, planned: 0 } }],
      [
        { accountId: 'b', delta: { cleared: -100, pending: 0, planned: 0 } },
        { accountId: 'a', delta: { cleared: 5, pending: 0, planned: 0 } },
      ],
    )
    expect(merged).toEqual([{ accountId: 'a', delta: { cleared: 5, pending: 0, planned: 0 } }])
  })
})

describe('validateStatusChange (matriz 4x4)', () => {
  const allowed: Record<TxnStatus, TxnStatus[]> = {
    PLANNED: ['PLANNED', 'PENDING', 'CLEARED'],
    PENDING: ['PLANNED', 'PENDING', 'CLEARED'],
    CLEARED: ['PLANNED', 'PENDING', 'CLEARED', 'RECONCILED'],
    RECONCILED: [],
  }

  for (const from of TXN_STATUSES) {
    for (const to of TXN_STATUSES) {
      const ok = allowed[from].includes(to)
      it(`${from} -> ${to}: ${ok ? 'permitido' : 'proibido'}`, () => {
        expect(canChangeStatus(from, to)).toBe(ok)
        if (!ok) {
          const expectedCode =
            from === 'RECONCILED' ? 'LEDGER_RECONCILED_LOCKED' : 'LEDGER_INVALID_STATUS_CHANGE'
          expect(codeOf(() => validateStatusChange(from, to))).toBe(expectedCode)
        }
      })
    }
  }
})

describe('isMutableWhenReconciled', () => {
  it('só categoryId, notes, tags e merchantId são editáveis', () => {
    expect(isMutableWhenReconciled({ notes: 'x' })).toBe(true)
    expect(
      isMutableWhenReconciled({ categoryId: 'c', merchantId: null, tags: [], notes: 'n' }),
    ).toBe(true)
    expect(isMutableWhenReconciled({ amount: 5 })).toBe(false)
    expect(isMutableWhenReconciled({ date: new Date(), notes: 'n' })).toBe(false)
    expect(isMutableWhenReconciled({ accountId: 'a' })).toBe(false)
    expect(isMutableWhenReconciled({ kind: 'EXPENSE' satisfies TxnKind })).toBe(false)
  })

  it('campos undefined são ignorados e o patch vazio é mutável', () => {
    expect(isMutableWhenReconciled({ amount: undefined, notes: 'x' })).toBe(true)
    expect(isMutableWhenReconciled({})).toBe(true)
    expect(reconciledBlockedFields({ amount: 1, status: 'PENDING', notes: 'x' })).toEqual([
      'amount',
      'status',
    ])
  })
})
