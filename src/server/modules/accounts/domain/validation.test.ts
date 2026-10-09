import { describe, expect, it } from 'vitest'

import { ACCOUNT_TYPES, type AccountFields, type AccountType } from './types'
import {
  hasErrors,
  nameKey,
  normalizeAccountFields,
  normalizeName,
  validateAccountFields,
  validateOpeningBalance,
} from './validation'

const card: AccountFields = {
  name: 'Cartão Exemplo',
  type: 'CREDIT_CARD',
  creditLimit: 500000,
  closingDay: 10,
  dueDay: 17,
}

describe('normalizeName / nameKey (RN-02)', () => {
  it('apara e colapsa espaços internos', () => {
    expect(normalizeName('  Conta   Exemplo ')).toBe('Conta Exemplo')
  })

  it('compara sem diferenciar maiúsculas nem espaços nas pontas', () => {
    expect(nameKey('Conta Exemplo')).toBe(nameKey('conta exemplo '))
    expect(nameKey('CONTA ÁGIL')).toBe(nameKey('conta ágil'))
    expect(nameKey('Conta A')).not.toBe(nameKey('Conta B'))
  })
})

describe('validateAccountFields: matriz tipo x campos', () => {
  it.each(ACCOUNT_TYPES.filter((t) => t !== 'CREDIT_CARD'))(
    '%s válida só com nome e tipo',
    (type) => {
      expect(validateAccountFields({ name: 'Conta Exemplo', type })).toEqual({})
    },
  )

  it('cartão válido com limite, fechamento e vencimento', () => {
    expect(validateAccountFields(card)).toEqual({})
    expect(validateAccountFields({ ...card, networkKey: 'visa', issuerKey: 'nubank' })).toEqual({})
  })

  it('cartão sem limite, sem fechamento e sem vencimento acusa os três campos', () => {
    const errors = validateAccountFields({ name: 'Cartão Exemplo', type: 'CREDIT_CARD' })
    expect(Object.keys(errors).sort()).toEqual(['closingDay', 'creditLimit', 'dueDay'])
  })

  it.each([
    ['creditLimit 0', { creditLimit: 0 }, 'creditLimit'],
    ['creditLimit negativo', { creditLimit: -100 }, 'creditLimit'],
    ['creditLimit fracionado', { creditLimit: 100.5 }, 'creditLimit'],
    ['closingDay 0', { closingDay: 0 }, 'closingDay'],
    ['closingDay 32', { closingDay: 32 }, 'closingDay'],
    ['dueDay 0', { dueDay: 0 }, 'dueDay'],
    ['dueDay 32', { dueDay: 32 }, 'dueDay'],
    ['dueDay fracionado', { dueDay: 5.5 }, 'dueDay'],
  ])('cartão com %s é inválido', (_label, patch, field) => {
    expect(validateAccountFields({ ...card, ...patch })[field]).toBeDefined()
  })

  it('dias 1 e 31 são aceitos no cartão', () => {
    expect(validateAccountFields({ ...card, closingDay: 1, dueDay: 31 })).toEqual({})
  })

  it.each(['CHECKING', 'SAVINGS', 'WALLET', 'INVESTMENT', 'BUSINESS'] as const)(
    '%s com campos de cartão é inválida',
    (type) => {
      const errors = validateAccountFields({
        name: 'Conta Exemplo',
        type,
        creditLimit: 100000,
        closingDay: 5,
        dueDay: 12,
      })
      expect(Object.keys(errors).sort()).toEqual(['closingDay', 'creditLimit', 'dueDay'])
    },
  )

  it.each(['CHECKING', 'BUSINESS'] as const)('%s aceita cheque especial', (type) => {
    expect(validateAccountFields({ name: 'Conta Exemplo', type, overdraftLimit: 100000 })).toEqual(
      {},
    )
  })

  it.each(['SAVINGS', 'WALLET', 'INVESTMENT', 'CREDIT_CARD'] as const)(
    '%s não aceita cheque especial > 0, mas aceita 0',
    (type) => {
      const base: AccountFields = type === 'CREDIT_CARD' ? card : { name: 'Conta Exemplo', type }
      expect(validateAccountFields({ ...base, overdraftLimit: 5000 }).overdraftLimit).toBeDefined()
      expect(validateAccountFields({ ...base, overdraftLimit: 0 })).toEqual({})
      expect(validateAccountFields({ ...base, overdraftLimit: null })).toEqual({})
    },
  )

  it('cheque especial negativo ou fracionado é inválido', () => {
    const base: AccountFields = { name: 'Conta Exemplo', type: 'CHECKING' }
    expect(validateAccountFields({ ...base, overdraftLimit: -1 }).overdraftLimit).toBeDefined()
    expect(validateAccountFields({ ...base, overdraftLimit: 10.5 }).overdraftLimit).toBeDefined()
  })

  it('bandeira só em cartão e só do tipo network', () => {
    const checking: AccountFields = { name: 'Conta Exemplo', type: 'CHECKING' }
    expect(validateAccountFields({ ...checking, networkKey: 'visa' }).networkKey).toBeDefined()
    expect(validateAccountFields({ ...card, networkKey: 'nubank' }).networkKey).toBeDefined()
    expect(validateAccountFields({ ...card, networkKey: 'inexistente' }).networkKey).toBeDefined()
  })

  it('emissor precisa existir no registry (banco ou pagamento)', () => {
    const checking: AccountFields = { name: 'Conta Exemplo', type: 'CHECKING' }
    expect(validateAccountFields({ ...checking, issuerKey: 'inexistente' }).issuerKey).toBeDefined()
    expect(validateAccountFields({ ...checking, issuerKey: 'netflix' }).issuerKey).toBeDefined()
    expect(validateAccountFields({ ...checking, issuerKey: 'visa' }).issuerKey).toBeDefined()
    expect(validateAccountFields({ ...checking, issuerKey: 'nubank' })).toEqual({})
    expect(validateAccountFields({ ...checking, issuerKey: 'pix' })).toEqual({})
  })

  it('cor cat-1..cat-10 e ícone kebab-case', () => {
    const checking: AccountFields = { name: 'Conta Exemplo', type: 'CHECKING' }
    expect(validateAccountFields({ ...checking, colorKey: 'cat-10' })).toEqual({})
    expect(validateAccountFields({ ...checking, colorKey: 'cat-11' }).colorKey).toBeDefined()
    expect(validateAccountFields({ ...checking, colorKey: '#fff' }).colorKey).toBeDefined()
    expect(validateAccountFields({ ...checking, icon: 'piggy-bank' })).toEqual({})
    expect(validateAccountFields({ ...checking, icon: 'Piggy Bank' }).icon).toBeDefined()
    expect(validateAccountFields({ ...checking, icon: 'a'.repeat(41) }).icon).toBeDefined()
  })

  it('nome vazio, só espaços e com 61 caracteres são inválidos; 60 é aceito', () => {
    const type: AccountType = 'WALLET'
    expect(validateAccountFields({ name: '', type }).name).toBeDefined()
    expect(validateAccountFields({ name: '   ', type }).name).toBeDefined()
    expect(validateAccountFields({ name: 'a'.repeat(61), type }).name).toBeDefined()
    expect(validateAccountFields({ name: 'a'.repeat(60), type })).toEqual({})
  })

  it('tipo desconhecido é inválido', () => {
    expect(
      validateAccountFields({ name: 'Conta Exemplo', type: 'POUPANCA' as AccountType }).type,
    ).toBeDefined()
  })
})

describe('validateOpeningBalance', () => {
  it('omitido e zero são válidos', () => {
    expect(validateOpeningBalance('CHECKING', undefined)).toEqual({})
    expect(validateOpeningBalance('CHECKING', 0)).toEqual({})
  })

  it('aceita saldo assinado em conta não-cartão', () => {
    expect(validateOpeningBalance('CHECKING', -20000)).toEqual({})
    expect(validateOpeningBalance('SAVINGS', 150000)).toEqual({})
  })

  it('rejeita fracionado e acima do teto', () => {
    expect(validateOpeningBalance('CHECKING', 10.5).openingBalance).toBeDefined()
    expect(validateOpeningBalance('CHECKING', 2_000_000_001).openingBalance).toBeDefined()
    expect(validateOpeningBalance('CHECKING', Number.NaN).openingBalance).toBeDefined()
  })

  it('cartão só aceita dívida (valor <= 0)', () => {
    expect(validateOpeningBalance('CREDIT_CARD', -50000)).toEqual({})
    expect(validateOpeningBalance('CREDIT_CARD', 50000).openingBalance).toBeDefined()
  })
})

describe('normalizeAccountFields', () => {
  it('grava null/0 para o que o tipo não usa e normaliza o nome', () => {
    expect(
      normalizeAccountFields({ name: '  Conta  Exemplo ', type: 'SAVINGS', overdraftLimit: null }),
    ).toEqual({
      name: 'Conta Exemplo',
      type: 'SAVINGS',
      issuerKey: null,
      networkKey: null,
      colorKey: null,
      icon: null,
      overdraftLimit: 0,
      creditLimit: null,
      closingDay: null,
      dueDay: null,
    })
  })

  it('cartão mantém limite, dias e bandeira; corrente mantém cheque especial', () => {
    expect(normalizeAccountFields({ ...card, networkKey: 'visa' })).toMatchObject({
      creditLimit: 500000,
      closingDay: 10,
      dueDay: 17,
      networkKey: 'visa',
      overdraftLimit: 0,
    })
    expect(
      normalizeAccountFields({ name: 'Conta Exemplo', type: 'CHECKING', overdraftLimit: 100000 }),
    ).toMatchObject({ overdraftLimit: 100000, creditLimit: null })
  })

  it('hasErrors', () => {
    expect(hasErrors({})).toBe(false)
    expect(hasErrors({ name: ['x'] })).toBe(true)
  })
})
