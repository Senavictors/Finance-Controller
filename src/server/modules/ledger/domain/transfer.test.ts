import { describe, expect, it } from 'vitest'
import {
  assertTransferPair,
  buildTransferLegs,
  isTransferKind,
  isTransferLeg,
  type BuildTransferLegsInput,
} from './transfer'
import { LedgerError } from './types'

const date = new Date('2026-10-05T12:00:00.000Z')

function input(overrides: Partial<BuildTransferLegsInput> = {}): BuildTransferLegsInput {
  return {
    userId: 'u1',
    sourceAccountId: 'a',
    destinationAccountId: 'b',
    amount: 10000,
    date,
    kind: 'TRANSFER',
    description: 'Transferência entre contas',
    status: 'CLEARED',
    uuid: () => '00000000-0000-4000-8000-000000000001',
    ...overrides,
  }
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof LedgerError) return error.code
    throw error
  }
  return undefined
}

describe('buildTransferLegs', () => {
  it('gera pernas com sinais opostos, mesmo transferId, ordem origem/destino', () => {
    const { transferId, outgoing, incoming } = buildTransferLegs(input())
    expect(transferId).toBe('00000000-0000-4000-8000-000000000001')
    expect(outgoing).toMatchObject({ accountId: 'a', amount: -10000, transferId })
    expect(incoming).toMatchObject({ accountId: 'b', amount: 10000, transferId })
    expect(outgoing.amount + incoming.amount).toBe(0)
    expect(outgoing.kind).toBe('TRANSFER')
    expect(incoming.status).toBe('CLEARED')
  })

  it('pares ficam fora de orçamento e sem categoria (dupla contagem é bug)', () => {
    const { outgoing, incoming } = buildTransferLegs(input({ kind: 'CARD_PAYMENT' }))
    for (const leg of [outgoing, incoming]) {
      expect(leg.excludeFromBudget).toBe(true)
      expect(leg.categoryId).toBeNull()
      expect(leg.kind).toBe('CARD_PAYMENT')
    }
  })

  it('propaga status, data, descrição, notas e tags (cópias independentes)', () => {
    const tags = ['pj']
    const { outgoing, incoming } = buildTransferLegs(input({ status: 'PLANNED', notes: 'n', tags }))
    expect(outgoing.status).toBe('PLANNED')
    expect(incoming.notes).toBe('n')
    expect(outgoing.tags).toEqual(['pj'])
    expect(outgoing.tags).not.toBe(incoming.tags)
    expect(outgoing.date).toBe(date)
  })

  it('origem = destino falha', () => {
    expect(codeOf(() => buildTransferLegs(input({ destinationAccountId: 'a' })))).toBe(
      'LEDGER_SAME_ACCOUNT',
    )
  })

  it('valor <= 0 falha com código estável', () => {
    expect(codeOf(() => buildTransferLegs(input({ amount: 0 })))).toBe('LEDGER_ZERO_AMOUNT')
    expect(codeOf(() => buildTransferLegs(input({ amount: -5 })))).toBe('LEDGER_INVALID_SIGN')
    expect(codeOf(() => buildTransferLegs(input({ amount: 2_000_000_001 })))).toBe(
      'LEDGER_AMOUNT_OUT_OF_RANGE',
    )
  })

  it('kind fora de TRANSFER/CARD_PAYMENT falha', () => {
    expect(codeOf(() => buildTransferLegs(input({ kind: 'EXPENSE' as never })))).toBe(
      'LEDGER_INVALID_KIND',
    )
  })

  it('datas fora de meio-dia UTC falham', () => {
    expect(
      codeOf(() => buildTransferLegs(input({ date: new Date('2026-10-05T00:00:00.000Z') }))),
    ).toBe('LEDGER_INVALID_DATE')
    expect(
      codeOf(() => buildTransferLegs(input({ postedDate: new Date('2026-10-05T03:00:00.000Z') }))),
    ).toBe('LEDGER_INVALID_DATE')
  })
})

describe('isTransferLeg / isTransferKind', () => {
  it('reconhece pernas de par', () => {
    expect(isTransferLeg({ kind: 'TRANSFER', transferId: 't' })).toBe(true)
    expect(isTransferLeg({ kind: 'CARD_PAYMENT', transferId: 't' })).toBe(true)
    expect(isTransferLeg({ kind: 'TRANSFER', transferId: null })).toBe(false)
    expect(isTransferLeg({ kind: 'EXPENSE', transferId: 't' })).toBe(false)
    expect(isTransferKind('INCOME')).toBe(false)
  })
})

describe('assertTransferPair', () => {
  const leg = (accountId: string, amount: number, transferId: string | null = 't') => ({
    accountId,
    amount,
    transferId,
    kind: 'TRANSFER' as const,
  })

  it('aceita um par íntegro', () => {
    expect(codeOf(() => assertTransferPair([leg('a', -100), leg('b', 100)]))).toBeUndefined()
  })

  it.each([
    ['uma perna só', [leg('a', -100)]],
    ['transferId diferente', [leg('a', -100), leg('b', 100, 'x')]],
    ['transferId nulo', [leg('a', -100, null), leg('b', 100, null)]],
    ['mesma conta', [leg('a', -100), leg('a', 100)]],
    ['soma diferente de zero', [leg('a', -100), leg('b', 90)]],
    ['kind misto', [leg('a', -100), { ...leg('b', 100), kind: 'CARD_PAYMENT' as const }]],
  ])('par quebrado (%s)', (_name, legs) => {
    expect(codeOf(() => assertTransferPair(legs))).toBe('LEDGER_TRANSFER_PAIR_BROKEN')
  })
})
