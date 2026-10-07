import { describe, expect, it } from 'vitest'
import { desiredCardTxnStatus, desiredPaymentStatus } from './card-status'

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe('cards/domain/card-status', () => {
  const closing = day('2026-10-10')

  it('data futura é PLANNED', () => {
    expect(
      desiredCardTxnStatus({
        date: day('2026-11-05'),
        statementClosingDate: day('2026-11-10'),
        today: day('2026-10-05'),
      }),
    ).toBe('PLANNED')
  })

  it('data de hoje em fatura aberta é PENDING', () => {
    expect(
      desiredCardTxnStatus({
        date: day('2026-10-05'),
        statementClosingDate: closing,
        today: day('2026-10-05'),
      }),
    ).toBe('PENDING')
  })

  it('no dia do fechamento a fatura ainda está aberta (PENDING)', () => {
    expect(
      desiredCardTxnStatus({
        date: day('2026-10-08'),
        statementClosingDate: closing,
        today: day('2026-10-10'),
      }),
    ).toBe('PENDING')
  })

  it('depois do fechamento é CLEARED', () => {
    expect(
      desiredCardTxnStatus({
        date: day('2026-10-08'),
        statementClosingDate: closing,
        today: day('2026-10-11'),
      }),
    ).toBe('CLEARED')
  })

  it('pagamento: futuro é PLANNED, senão CLEARED', () => {
    expect(desiredPaymentStatus({ date: day('2026-10-06'), today: day('2026-10-05') })).toBe(
      'PLANNED',
    )
    expect(desiredPaymentStatus({ date: day('2026-10-05'), today: day('2026-10-05') })).toBe(
      'CLEARED',
    )
    expect(desiredPaymentStatus({ date: day('2026-10-01'), today: day('2026-10-05') })).toBe(
      'CLEARED',
    )
  })
})
