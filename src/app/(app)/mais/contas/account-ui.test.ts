import { describe, expect, it } from 'vitest'

import {
  EMPTY_FORM,
  buildCreateBody,
  buildPatchBody,
  summarizeUsage,
  typeLabel,
  type AccountFormState,
} from './account-ui'

const nbsp = /[\s ]+/g
const norm = (text: string | null) => text?.replace(nbsp, ' ') ?? null

describe('summarizeUsage', () => {
  it('cheque especial dentro do limite usa o tom pend', () => {
    const summary = summarizeUsage({
      usage: { kind: 'OVERDRAFT', limit: 100000, used: 20000, available: 80000, excess: 0 },
    })
    expect(summary?.ratio).toBeCloseTo(0.2)
    expect(summary?.tone).toBe('pend')
    expect(norm(summary!.text)).toBe('Usando R$ 200,00 do cheque especial (limite R$ 1.000,00)')
    expect(summary?.excessText).toBeNull()
  })

  it('exatamente 80% ainda é pend; acima de 80% vira out', () => {
    const at = (used: number) =>
      summarizeUsage({
        usage: { kind: 'OVERDRAFT', limit: 100000, used, available: 100000 - used, excess: 0 },
      })
    expect(at(80000)?.tone).toBe('pend')
    expect(at(80001)?.tone).toBe('out')
  })

  it('excedente destaca em out e informa o valor', () => {
    const summary = summarizeUsage({
      usage: { kind: 'OVERDRAFT', limit: 100000, used: 100000, available: 0, excess: 5000 },
    })
    expect(summary?.tone).toBe('out')
    expect(summary?.ratio).toBe(1)
    expect(norm(summary!.excessText)).toBe('Excedeu o limite em R$ 50,00')
  })

  it('cartão: texto do limite do cartão', () => {
    const summary = summarizeUsage({
      usage: { kind: 'CREDIT', limit: 500000, used: 150000, available: 350000, excess: 0 },
    })
    expect(norm(summary!.text)).toBe('Usando R$ 1.500,00 do limite do cartão (limite R$ 5.000,00)')
  })

  it('sem limite a mostrar: null; saldo negativo sem limite: ratio cheio e aviso', () => {
    expect(
      summarizeUsage({ usage: { kind: 'NONE', limit: 0, used: 0, available: 0, excess: 0 } }),
    ).toBeNull()
    expect(
      summarizeUsage({ usage: { kind: 'OVERDRAFT', limit: 0, used: 0, available: 0, excess: 0 } }),
    ).toBeNull()
    const negative = summarizeUsage({
      usage: { kind: 'OVERDRAFT', limit: 0, used: 0, available: 0, excess: 3000 },
    })
    expect(negative?.ratio).toBe(1)
    expect(negative?.tone).toBe('out')
    expect(negative?.text).toContain('sem cheque especial')
  })
})

describe('corpos de requisição', () => {
  const form = (patch: Partial<AccountFormState>): AccountFormState => ({
    ...EMPTY_FORM,
    name: 'Conta Exemplo',
    ...patch,
  })

  it('conta corrente: limite de cheque especial e saldo inicial com o sinal escolhido', () => {
    expect(
      buildCreateBody(form({ overdraftCents: 100000, openingCents: 20000, openingNegative: true })),
    ).toEqual({
      name: 'Conta Exemplo',
      type: 'CHECKING',
      overdraftLimit: 100000,
      openingBalance: -20000,
    })
  })

  it('saldo inicial zero não é enviado; emissor só quando escolhido', () => {
    const body = buildCreateBody(form({ type: 'SAVINGS', issuerKey: 'nubank' }))
    expect(body).toEqual({ name: 'Conta Exemplo', type: 'SAVINGS', issuerKey: 'nubank' })
  })

  it('cartão: limite, dias, bandeira e dívida atual negativa; sem overdraft', () => {
    expect(
      buildCreateBody(
        form({
          name: 'Cartão Exemplo',
          type: 'CREDIT_CARD',
          creditCents: 500000,
          closingDay: '10',
          dueDay: '17',
          networkKey: 'visa',
          openingCents: 150000,
        }),
      ),
    ).toEqual({
      name: 'Cartão Exemplo',
      type: 'CREDIT_CARD',
      creditLimit: 500000,
      closingDay: 10,
      dueDay: 17,
      networkKey: 'visa',
      openingBalance: -150000,
    })
  })

  it('cartão com campos vazios deixa a API devolver os erros por campo', () => {
    const body = buildCreateBody(form({ type: 'CREDIT_CARD' }))
    expect(body).toEqual({ name: 'Conta Exemplo', type: 'CREDIT_CARD' })
  })

  it('dia inválido digitado segue como número para a API recusar', () => {
    const body = buildCreateBody(form({ type: 'CREDIT_CARD', dueDay: '32' }))
    expect(body.dueDay).toBe(32)
  })

  it('patch: só envia type se mudou e limpa emissor com null', () => {
    const same = buildPatchBody(form({ overdraftCents: 5000 }), { type: 'CHECKING' })
    expect(same).toEqual({ name: 'Conta Exemplo', issuerKey: null, overdraftLimit: 5000 })
    const changed = buildPatchBody(form({ type: 'SAVINGS' }), { type: 'CHECKING' })
    expect(changed).toMatchObject({ type: 'SAVINGS' })
    expect(changed).not.toHaveProperty('overdraftLimit')
  })

  it('typeLabel', () => {
    expect(typeLabel('BUSINESS')).toBe('Conta PJ')
  })
})
