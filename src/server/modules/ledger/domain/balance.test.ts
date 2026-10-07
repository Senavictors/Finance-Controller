import { describe, expect, it } from 'vitest'
import { computeBalances, limitUsage, positionOf, warningsFor } from './balance'
import type { AccountKind } from './types'

const checking = (
  cleared: number,
  pending = 0,
  planned = 0,
  overdraftLimit = 100000,
  accountType: AccountKind = 'CHECKING',
) => ({
  accountType,
  balanceCleared: cleared,
  balancePending: pending,
  balancePlanned: planned,
  overdraftLimit,
  creditLimit: null,
})

describe('computeBalances', () => {
  it('soma por balde; RECONCILED conta como cleared', () => {
    expect(
      computeBalances([
        { amount: 100000, status: 'CLEARED' },
        { amount: 50000, status: 'RECONCILED' },
        { amount: -20000, status: 'PENDING' },
        { amount: 500000, status: 'PLANNED' },
        { amount: -10000, status: 'PLANNED' },
      ]),
    ).toEqual({ cleared: 150000, pending: -20000, planned: 490000 })
  })

  it('lista vazia zera tudo', () => {
    expect(computeBalances([])).toEqual({ cleared: 0, pending: 0, planned: 0 })
  })

  it('valores próximos de 2^31 não estouram', () => {
    const total = computeBalances([
      { amount: 2_000_000_000, status: 'CLEARED' },
      { amount: 2_000_000_000, status: 'CLEARED' },
      { amount: 2_000_000_000, status: 'CLEARED' },
    ])
    expect(total.cleared).toBe(6_000_000_000)
  })
})

describe('limitUsage - cheque especial (CHECKING/BUSINESS)', () => {
  it('saldo positivo: não usa limite e o disponível soma saldo e limite', () => {
    expect(limitUsage(checking(20000))).toEqual({
      kind: 'OVERDRAFT',
      limit: 100000,
      used: 0,
      excess: 0,
      available: 120000,
    })
  })

  it('saldo zero', () => {
    expect(limitUsage(checking(0))).toMatchObject({ used: 0, excess: 0, available: 100000 })
  })

  it('negativo dentro do limite', () => {
    expect(limitUsage(checking(-30000))).toMatchObject({ used: 30000, excess: 0, available: 70000 })
  })

  it('exatamente no limite', () => {
    expect(limitUsage(checking(-100000))).toMatchObject({ used: 100000, excess: 0, available: 0 })
  })

  it('acima do limite gera excedente', () => {
    expect(limitUsage(checking(-120000))).toMatchObject({
      used: 100000,
      excess: 20000,
      available: 0,
    })
  })

  it('overdraftLimit = 0 com saldo negativo: excedente = |saldo|', () => {
    expect(limitUsage(checking(-4000, 0, 0, 0))).toMatchObject({
      limit: 0,
      used: 0,
      excess: 4000,
      available: 0,
    })
  })

  it('usa cleared + pending e ignora previstos', () => {
    expect(limitUsage(checking(10000, -50000, -999999))).toMatchObject({ used: 40000, excess: 0 })
  })

  it('BUSINESS se comporta como CHECKING', () => {
    expect(limitUsage(checking(-1000, 0, 0, 5000, 'BUSINESS'))).toMatchObject({
      kind: 'OVERDRAFT',
      used: 1000,
      available: 4000,
    })
  })

  it('limite negativo é tratado como zero', () => {
    expect(limitUsage(checking(-1000, 0, 0, -5))).toMatchObject({ limit: 0, excess: 1000 })
  })

  it('valores próximos de 2^31 não estouram', () => {
    expect(limitUsage(checking(-2_000_000_000, -2_000_000_000, 0, 2_000_000_000))).toMatchObject({
      used: 2_000_000_000,
      excess: 2_000_000_000,
      available: 0,
    })
  })
})

describe('limitUsage - cartão e demais tipos', () => {
  const card = (cleared: number, pending: number, planned: number, creditLimit: number | null) => ({
    accountType: 'CREDIT_CARD' as const,
    balanceCleared: cleared,
    balancePending: pending,
    balancePlanned: planned,
    overdraftLimit: 0,
    creditLimit,
  })

  it('cartão com compras PENDING + PLANNED consome o limite', () => {
    expect(limitUsage(card(0, -100000, -50000, 500000))).toEqual({
      kind: 'CREDIT',
      limit: 500000,
      used: 150000,
      excess: 0,
      available: 350000,
    })
  })

  it('cartão acima do limite', () => {
    expect(limitUsage(card(-400000, -100000, -50000, 500000))).toMatchObject({
      used: 500000,
      excess: 50000,
      available: 0,
    })
  })

  it('cartão com pagamento a mais (saldo positivo) não usa limite', () => {
    expect(limitUsage(card(10000, 0, 0, 500000))).toMatchObject({ used: 0, available: 500000 })
  })

  it('cartão sem limite cadastrado trata como 0', () => {
    expect(limitUsage(card(0, -1000, 0, null))).toMatchObject({ limit: 0, used: 0, excess: 1000 })
  })

  it.each(['SAVINGS', 'WALLET', 'INVESTMENT'] as const)('%s não tem limite', (type) => {
    expect(limitUsage(checking(-500, 0, 0, 100000, type))).toEqual({
      kind: 'NONE',
      limit: 0,
      used: 0,
      available: 0,
      excess: 0,
    })
  })
})

describe('positionOf e avisos', () => {
  it('CA-06: saldo 20000, despesa de 50000 -> current -30000, usado 30000, OVERDRAFT_USED', () => {
    const position = positionOf({ accountId: 'a', ...checking(-30000) })
    expect(position.current).toBe(-30000)
    expect(position.usage).toMatchObject({ used: 30000, excess: 0, available: 70000 })
    expect(position.warnings).toEqual([{ code: 'OVERDRAFT_USED', accountId: 'a' }])
  })

  it('CA-06: estourando o limite gera OVERDRAFT_USED e OVERDRAFT_LIMIT_EXCEEDED', () => {
    const position = positionOf({ accountId: 'a', ...checking(-120000) })
    expect(position.usage).toMatchObject({ used: 100000, excess: 20000 })
    expect(position.warnings.map((w) => w.code)).toEqual([
      'OVERDRAFT_USED',
      'OVERDRAFT_LIMIT_EXCEEDED',
    ])
  })

  it('CA-07: SAVINGS negativa gera NEGATIVE_BALANCE_UNEXPECTED', () => {
    const position = positionOf({ accountId: 's', ...checking(-100, 0, 0, 0, 'SAVINGS') })
    expect(position.warnings).toEqual([{ code: 'NEGATIVE_BALANCE_UNEXPECTED', accountId: 's' }])
  })

  it('projected soma previstos; saldo positivo não gera aviso', () => {
    const position = positionOf({ accountId: 'a', ...checking(10000, 2000, 500000) })
    expect(position.current).toBe(12000)
    expect(position.projected).toBe(512000)
    expect(position.warnings).toEqual([])
  })

  it('cartão acima do limite avisa CREDIT_LIMIT_EXCEEDED', () => {
    expect(
      warningsFor('c', -600000, {
        kind: 'CREDIT',
        limit: 500000,
        used: 500000,
        excess: 100000,
        available: 0,
      }),
    ).toEqual([{ code: 'CREDIT_LIMIT_EXCEEDED', accountId: 'c' }])
  })
})
