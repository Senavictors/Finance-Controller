import { describe, expect, it } from 'vitest'

import {
  OPENING_DESCRIPTION,
  canChangeType,
  computeTotals,
  countBeyondOpening,
  isOpeningTxn,
  mergeAccountPatch,
  todayNoonUtc,
  type AccountView,
} from './rules'
import type { AccountRecord } from './types'

const opening = { kind: 'ADJUSTMENT', description: OPENING_DESCRIPTION, excludeFromBudget: true }
const expense = { kind: 'EXPENSE', description: 'Mercado Exemplo', excludeFromBudget: false }

describe('saldo inicial e tipo imutável (RN-05)', () => {
  it('reconhece o lançamento de saldo inicial', () => {
    expect(isOpeningTxn(opening)).toBe(true)
    expect(isOpeningTxn({ ...opening, excludeFromBudget: false })).toBe(false)
    expect(isOpeningTxn({ ...opening, description: 'Ajuste de conciliação' })).toBe(false)
    expect(isOpeningTxn({ ...opening, kind: 'INCOME' })).toBe(false)
  })

  it('countBeyondOpening: o saldo inicial não conta; qualquer outro lançamento sim', () => {
    expect(countBeyondOpening([])).toBe(0)
    expect(countBeyondOpening([opening])).toBe(0)
    expect(countBeyondOpening([opening, expense])).toBe(1)
    expect(countBeyondOpening([expense])).toBe(1)
  })

  it('um segundo "saldo inicial" é movimentação', () => {
    expect(countBeyondOpening([opening, opening])).toBe(1)
  })

  it('canChangeType só sem lançamentos além do saldo inicial', () => {
    expect(canChangeType(0)).toBe(true)
    expect(canChangeType(1)).toBe(false)
  })
})

describe('todayNoonUtc (ADR-002)', () => {
  it('usa o dia de calendário de São Paulo, ao meio-dia UTC', () => {
    // 02:00 UTC de 06/10 ainda é 05/10 em São Paulo (UTC-3)
    expect(todayNoonUtc(new Date('2026-10-06T02:00:00.000Z')).toISOString()).toBe(
      '2026-10-05T12:00:00.000Z',
    )
    expect(todayNoonUtc(new Date('2026-10-06T15:00:00.000Z')).toISOString()).toBe(
      '2026-10-06T12:00:00.000Z',
    )
  })
})

const checking: AccountRecord = {
  id: 'acc-1',
  userId: 'user-1',
  name: 'Conta Exemplo',
  type: 'CHECKING',
  issuerKey: null,
  networkKey: null,
  colorKey: null,
  icon: null,
  overdraftLimit: 100000,
  creditLimit: null,
  closingDay: null,
  dueDay: null,
  isArchived: false,
  sortOrder: 0,
}
const card: AccountRecord = {
  ...checking,
  id: 'acc-2',
  name: 'Cartão Exemplo',
  type: 'CREDIT_CARD',
  overdraftLimit: 0,
  creditLimit: 500000,
  closingDay: 10,
  dueDay: 17,
  networkKey: 'visa',
}

describe('mergeAccountPatch', () => {
  it('só devolve o que mudou', () => {
    const merged = mergeAccountPatch(checking, { name: '  Conta  Principal ', icon: 'wallet' })
    expect(merged.changes).toEqual({ name: 'Conta Principal', icon: 'wallet' })
    expect(merged.typeChanged).toBe(false)
  })

  it('valor igual ao atual não gera mudança', () => {
    expect(
      mergeAccountPatch(checking, { name: 'Conta Exemplo', overdraftLimit: 100000 }).changes,
    ).toEqual({})
  })

  it('null limpa campo opcional', () => {
    const withIssuer = { ...checking, issuerKey: 'nubank' }
    expect(mergeAccountPatch(withIssuer, { issuerKey: null }).changes).toEqual({ issuerKey: null })
  })

  it('troca de tipo zera o que o novo tipo não usa (cartão -> corrente)', () => {
    const merged = mergeAccountPatch(card, { type: 'CHECKING' })
    expect(merged.typeChanged).toBe(true)
    expect(merged.fields).toMatchObject({
      type: 'CHECKING',
      creditLimit: null,
      closingDay: null,
      dueDay: null,
      networkKey: null,
      overdraftLimit: 0,
    })
    expect(merged.changes).toMatchObject({
      type: 'CHECKING',
      creditLimit: null,
      closingDay: null,
      dueDay: null,
      networkKey: null,
    })
  })

  it('troca para cartão sem informar os campos deixa-os nulos (a validação acusa)', () => {
    const merged = mergeAccountPatch(checking, { type: 'CREDIT_CARD' })
    expect(merged.fields).toMatchObject({ creditLimit: null, closingDay: null, dueDay: null })
  })

  it('corrente -> PJ mantém o cheque especial', () => {
    expect(mergeAccountPatch(checking, { type: 'BUSINESS' }).fields.overdraftLimit).toBe(100000)
  })

  it('corrente -> poupança zera o cheque especial', () => {
    expect(mergeAccountPatch(checking, { type: 'SAVINGS' }).fields.overdraftLimit).toBe(0)
  })
})

function view(
  partial: Partial<AccountView> & Pick<AccountView, 'type'>,
  current: number,
): AccountView {
  return {
    id: `v-${partial.type}-${current}`,
    name: 'x',
    issuerKey: null,
    networkKey: null,
    colorKey: null,
    icon: null,
    overdraftLimit: 0,
    creditLimit: null,
    closingDay: null,
    dueDay: null,
    isArchived: false,
    sortOrder: 0,
    balance: { cleared: current, pending: 0, planned: 0, current, projected: current },
    usage: { kind: 'NONE', limit: 0, used: 0, available: 0, excess: 0 },
    ...partial,
  }
}

describe('computeTotals', () => {
  const views = [
    view({ type: 'CHECKING' }, 10000),
    view({ type: 'SAVINGS' }, 50000),
    view({ type: 'WALLET' }, 2000),
    view({ type: 'BUSINESS' }, 30000),
    view({ type: 'INVESTMENT' }, 100000),
    view({ type: 'CREDIT_CARD' }, -45000),
    view({ type: 'CREDIT_CARD' }, 1000),
    view({ type: 'CHECKING', isArchived: true }, 999999),
  ]

  it('caixa soma CHECKING, SAVINGS, WALLET e BUSINESS ativas', () => {
    expect(computeTotals(views)).toEqual({ cash: 92000, investments: 100000, cardDebt: 45000 })
  })

  it('excludeBusiness tira a conta PJ do caixa (RN-07)', () => {
    expect(computeTotals(views, { excludeBusiness: true }).cash).toBe(62000)
  })
})
