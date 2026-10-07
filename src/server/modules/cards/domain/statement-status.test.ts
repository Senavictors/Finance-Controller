import { describe, expect, it } from 'vitest'
import { getStatementStatus } from './statement-status'

const closingDate = new Date('2026-10-10T12:00:00.000Z')
const dueDate = new Date('2026-10-17T12:00:00.000Z')
// meio-dia em Sao Paulo (UTC-3) = 15:00Z
const at = (iso: string) => new Date(`${iso}T15:00:00.000Z`)

const base = { closingDate, dueDate }

describe('cards/domain/statement-status', () => {
  it('OPEN antes do fechamento', () => {
    expect(
      getStatementStatus({ ...base, totalAmount: 10_000, paidAmount: 0, now: at('2026-10-05') }),
    ).toBe('OPEN')
  })

  it('no dia do fechamento ainda é OPEN; no dia seguinte é CLOSED', () => {
    expect(
      getStatementStatus({ ...base, totalAmount: 10_000, paidAmount: 0, now: at('2026-10-10') }),
    ).toBe('OPEN')
    expect(
      getStatementStatus({ ...base, totalAmount: 10_000, paidAmount: 0, now: at('2026-10-11') }),
    ).toBe('CLOSED')
  })

  it('CLOSED entre fechar e vencer, inclusive com pagamento parcial (CA-05)', () => {
    expect(
      getStatementStatus({
        ...base,
        totalAmount: 38_000,
        paidAmount: 20_000,
        now: at('2026-10-12'),
      }),
    ).toBe('CLOSED')
  })

  it('no dia do vencimento ainda é CLOSED; depois vira OVERDUE se há aberto', () => {
    expect(
      getStatementStatus({
        ...base,
        totalAmount: 10_000,
        paidAmount: 4_000,
        now: at('2026-10-17'),
      }),
    ).toBe('CLOSED')
    expect(
      getStatementStatus({
        ...base,
        totalAmount: 10_000,
        paidAmount: 4_000,
        now: at('2026-10-18'),
      }),
    ).toBe('OVERDUE')
  })

  it('PAID quando há total e nada em aberto (inclusive pagamento acima do total)', () => {
    expect(
      getStatementStatus({
        ...base,
        totalAmount: 10_000,
        paidAmount: 10_000,
        now: at('2026-10-20'),
      }),
    ).toBe('PAID')
    expect(
      getStatementStatus({
        ...base,
        totalAmount: 10_000,
        paidAmount: 12_000,
        now: at('2026-10-20'),
      }),
    ).toBe('PAID')
    // pagou adiantado, ainda aberta para compras
    expect(
      getStatementStatus({
        ...base,
        totalAmount: 10_000,
        paidAmount: 10_000,
        now: at('2026-10-05'),
      }),
    ).toBe('PAID')
  })

  it('total <= 0 (estorno maior que a fatura): PAID se fechada, OPEN se aberta', () => {
    expect(
      getStatementStatus({ ...base, totalAmount: -10_000, paidAmount: 0, now: at('2026-10-05') }),
    ).toBe('OPEN')
    expect(
      getStatementStatus({ ...base, totalAmount: -10_000, paidAmount: 0, now: at('2026-10-12') }),
    ).toBe('PAID')
  })

  it('fatura vazia: OPEN aberta, PAID fechada (nada a pagar)', () => {
    expect(
      getStatementStatus({ ...base, totalAmount: 0, paidAmount: 0, now: at('2026-10-05') }),
    ).toBe('OPEN')
    expect(
      getStatementStatus({ ...base, totalAmount: 0, paidAmount: 0, now: at('2026-10-20') }),
    ).toBe('PAID')
  })

  it('usa o dia de São Paulo: 01:00Z do dia 11 ainda é dia 10 no Brasil (OPEN)', () => {
    expect(
      getStatementStatus({
        ...base,
        totalAmount: 10_000,
        paidAmount: 0,
        now: new Date('2026-10-11T01:00:00.000Z'),
      }),
    ).toBe('OPEN')
    expect(
      getStatementStatus({
        ...base,
        totalAmount: 10_000,
        paidAmount: 0,
        now: new Date('2026-10-11T03:00:00.000Z'),
      }),
    ).toBe('CLOSED')
  })

  it('aceita outro fuso explícito', () => {
    expect(
      getStatementStatus({
        ...base,
        totalAmount: 10_000,
        paidAmount: 0,
        now: new Date('2026-10-11T01:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe('CLOSED')
  })
})
