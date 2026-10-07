import { describe, expect, it } from 'vitest'
import {
  assertPaymentAmount,
  assertPaymentSource,
  overdraftUsage,
  overdraftWarning,
  suggestPaymentAccount,
  type PaymentCandidate,
} from './payment'

const acc = (over: Partial<PaymentCandidate> & { id: string }): PaymentCandidate => ({
  type: 'CHECKING',
  isArchived: false,
  current: 0,
  overdraftLimit: 0,
  ...over,
})

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

describe('cards/domain/payment: suggestPaymentAccount', () => {
  it('CA-07: escolhe a de maior available entre 3 contas', () => {
    const picked = suggestPaymentAccount([
      acc({ id: 'a', current: 10_000, overdraftLimit: 0 }), // 10.000
      acc({ id: 'b', current: -20_000, overdraftLimit: 100_000 }), // 80.000
      acc({ id: 'c', type: 'SAVINGS', current: 50_000, overdraftLimit: 0 }), // 50.000
    ])
    expect(picked?.id).toBe('b')
  })

  it('ignora arquivadas, cartões e contas de investimento', () => {
    const picked = suggestPaymentAccount([
      acc({ id: 'arq', isArchived: true, current: 999_999 }),
      acc({ id: 'cartao', type: 'CREDIT_CARD', current: 999_999 }),
      acc({ id: 'inv', type: 'INVESTMENT', current: 999_999 }),
      acc({ id: 'ok', current: 1_000 }),
    ])
    expect(picked?.id).toBe('ok')
  })

  it('devolve null sem candidatas', () => {
    expect(suggestPaymentAccount([])).toBeNull()
    expect(suggestPaymentAccount([acc({ id: 'x', type: 'CREDIT_CARD' })])).toBeNull()
    expect(suggestPaymentAccount([acc({ id: 'x', isArchived: true })])).toBeNull()
  })

  it('BUSINESS só entra com includeBusiness', () => {
    const accounts = [
      acc({ id: 'pj', type: 'BUSINESS', current: 90_000 }),
      acc({ id: 'pf', current: 1_000 }),
    ]
    expect(suggestPaymentAccount(accounts)?.id).toBe('pf')
    expect(suggestPaymentAccount(accounts, { includeBusiness: true })?.id).toBe('pj')
  })

  it('empate de available: menor uso do cheque especial; depois id', () => {
    // a: saldo 0 + limite 50.000 => 50.000, usado 0 | b: saldo -10.000 + limite 60.000 => available 50.000, usado 10.000
    const picked = suggestPaymentAccount([
      acc({ id: 'b', current: -10_000, overdraftLimit: 60_000 }),
      acc({ id: 'a', current: 0, overdraftLimit: 50_000 }),
    ])
    expect(picked?.id).toBe('a')
    const byId = suggestPaymentAccount([
      acc({ id: 'z', current: 5_000 }),
      acc({ id: 'y', current: 5_000 }),
    ])
    expect(byId?.id).toBe('y')
  })

  it('wallet entra como candidata', () => {
    expect(suggestPaymentAccount([acc({ id: 'w', type: 'WALLET', current: 100 })])?.id).toBe('w')
  })
})

describe('cards/domain/payment: overdraft', () => {
  it('overdraftUsage espelha o uso do cheque especial do ledger', () => {
    expect(overdraftUsage(10_000, 50_000)).toEqual({ used: 0, excess: 0, available: 60_000 })
    expect(overdraftUsage(-20_000, 50_000)).toEqual({ used: 20_000, excess: 0, available: 30_000 })
    expect(overdraftUsage(-70_000, 50_000)).toEqual({ used: 50_000, excess: 20_000, available: 0 })
  })

  it('CA-06: saldo 100,00, limite 500,00, pagando 300,00 => usa 200,00', () => {
    expect(overdraftWarning({ current: 10_000, overdraftLimit: 50_000 }, 30_000)).toEqual({
      willUseOverdraft: true,
      usedAfter: 20_000,
      excessAfter: 0,
    })
  })

  it('sem uso do cheque especial', () => {
    expect(overdraftWarning({ current: 100_000, overdraftLimit: 50_000 }, 30_000)).toEqual({
      willUseOverdraft: false,
      usedAfter: 0,
      excessAfter: 0,
    })
    // zera exatamente
    expect(overdraftWarning({ current: 30_000, overdraftLimit: 0 }, 30_000).willUseOverdraft).toBe(
      false,
    )
  })

  it('acima do limite informa o excesso (não bloqueia)', () => {
    expect(overdraftWarning({ current: 10_000, overdraftLimit: 50_000 }, 80_000)).toEqual({
      willUseOverdraft: true,
      usedAfter: 50_000,
      excessAfter: 20_000,
    })
  })

  it('conta que já estava negativa continua usando', () => {
    expect(overdraftWarning({ current: -5_000, overdraftLimit: 50_000 }, 1_000)).toEqual({
      willUseOverdraft: true,
      usedAfter: 6_000,
      excessAfter: 0,
    })
  })
})

describe('cards/domain/payment: validações', () => {
  it('origem igual ao cartão ou outro cartão é inválida (CA-05)', () => {
    expect(
      errorCode(() =>
        assertPaymentSource({
          source: { id: 'card-1', type: 'CREDIT_CARD' },
          cardAccountId: 'card-1',
        }),
      ),
    ).toBe('INVALID_PAYMENT_SOURCE')
    expect(
      errorCode(() =>
        assertPaymentSource({
          source: { id: 'card-2', type: 'CREDIT_CARD' },
          cardAccountId: 'card-1',
        }),
      ),
    ).toBe('INVALID_PAYMENT_SOURCE')
    expect(
      errorCode(() =>
        assertPaymentSource({ source: { id: 'chk', type: 'CHECKING' }, cardAccountId: 'card-1' }),
      ),
    ).toBeUndefined()
  })

  it('valor do pagamento: ok até o aberto, OVERPAYMENT acima, ALREADY_PAID sem aberto', () => {
    expect(errorCode(() => assertPaymentAmount({ amount: 18_000, open: 18_000 }))).toBeUndefined()
    expect(errorCode(() => assertPaymentAmount({ amount: 18_001, open: 18_000 }))).toBe(
      'STATEMENT_OVERPAYMENT',
    )
    expect(errorCode(() => assertPaymentAmount({ amount: 100, open: 0 }))).toBe(
      'STATEMENT_ALREADY_PAID',
    )
    expect(errorCode(() => assertPaymentAmount({ amount: 0, open: 100 }))).toBe('INVALID_AMOUNT')
    expect(errorCode(() => assertPaymentAmount({ amount: 1.5, open: 100 }))).toBe('INVALID_AMOUNT')
  })
})
