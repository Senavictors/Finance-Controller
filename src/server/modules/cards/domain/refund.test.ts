import { describe, expect, it } from 'vitest'
import { refundableAmount, validateRefund } from './refund'

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

describe('cards/domain/refund', () => {
  it('refundableAmount: valor do original menos os estornos anteriores', () => {
    expect(refundableAmount({ amount: -50_000 }, [])).toBe(50_000)
    expect(refundableAmount({ amount: -50_000 }, [{ amount: 12_000 }])).toBe(38_000)
    expect(refundableAmount({ amount: -50_000 }, [{ amount: 30_000 }, { amount: 20_000 }])).toBe(0)
  })

  it('refundableAmount nunca fica negativo', () => {
    expect(refundableAmount({ amount: -1_000 }, [{ amount: 5_000 }])).toBe(0)
  })

  it('validateRefund aceita estorno parcial e devolve o que sobra', () => {
    expect(
      validateRefund({
        original: { kind: 'EXPENSE', amount: -50_000 },
        previousRefunds: [{ amount: 10_000 }],
        amount: 15_000,
      }),
    ).toEqual({ refundableBefore: 40_000, refundableAfter: 25_000 })
  })

  it('REFUND_EXCEEDS_ORIGINAL quando passa do estornável (CA-04)', () => {
    expect(
      errorCode(() =>
        validateRefund({
          original: { kind: 'EXPENSE', amount: -50_000 },
          previousRefunds: [{ amount: 40_000 }],
          amount: 10_001,
        }),
      ),
    ).toBe('REFUND_EXCEEDS_ORIGINAL')
    expect(
      errorCode(() =>
        validateRefund({
          original: { kind: 'EXPENSE', amount: -50_000 },
          previousRefunds: [{ amount: 40_000 }],
          amount: 10_000,
        }),
      ),
    ).toBeUndefined()
  })

  it('só saídas do cartão são estornáveis (EXPENSE, FEE, INTEREST)', () => {
    for (const kind of ['EXPENSE', 'FEE', 'INTEREST']) {
      expect(
        errorCode(() =>
          validateRefund({ original: { kind, amount: -1_000 }, previousRefunds: [], amount: 100 }),
        ),
      ).toBeUndefined()
    }
    for (const kind of ['INCOME', 'CARD_PAYMENT', 'TRANSFER', 'ADJUSTMENT']) {
      expect(
        errorCode(() =>
          validateRefund({ original: { kind, amount: 1_000 }, previousRefunds: [], amount: 100 }),
        ),
      ).toBe('NOT_REFUNDABLE')
    }
  })

  it('valor inválido', () => {
    const original = { kind: 'EXPENSE', amount: -1_000 }
    expect(errorCode(() => validateRefund({ original, previousRefunds: [], amount: 0 }))).toBe(
      'INVALID_AMOUNT',
    )
    expect(errorCode(() => validateRefund({ original, previousRefunds: [], amount: 1.5 }))).toBe(
      'INVALID_AMOUNT',
    )
  })
})
