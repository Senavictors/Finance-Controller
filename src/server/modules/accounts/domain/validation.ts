import { getBrand } from '@/lib/brands/registry'

import {
  ACCOUNT_COLOR_KEYS,
  ACCOUNT_NAME_MAX,
  ACCOUNT_TYPES,
  MAX_CENTS,
  OVERDRAFT_TYPES,
  type AccountFieldErrors,
  type AccountFields,
  type AccountType,
  type NormalizedAccountFields,
} from './types'

const ICON_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ICON_MAX = 40

/** Nome como é gravado: sem espaços nas pontas e com espaços internos colapsados. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Chave de comparação de nomes (RN-02): normalizada e sem diferenciar maiúsculas. */
export function nameKey(raw: string): string {
  return normalizeName(raw).toLocaleLowerCase('pt-BR')
}

export function isOverdraftType(type: AccountType): boolean {
  return (OVERDRAFT_TYPES as readonly string[]).includes(type)
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function addError(errors: AccountFieldErrors, field: string, message: string): void {
  ;(errors[field] ??= []).push(message)
}

/**
 * Valida os campos de uma conta contra as regras por tipo (RN-02, RN-03) e devolve os erros
 * por campo (vazio = válido). Puro: não consulta o banco (unicidade de nome é do use-case).
 */
export function validateAccountFields(input: AccountFields): AccountFieldErrors {
  const errors: AccountFieldErrors = {}

  const name = typeof input.name === 'string' ? normalizeName(input.name) : ''
  if (name.length === 0) addError(errors, 'name', 'Informe o nome da conta.')
  else if (name.length > ACCOUNT_NAME_MAX) {
    addError(errors, 'name', `O nome pode ter no máximo ${ACCOUNT_NAME_MAX} caracteres.`)
  }

  const type = input.type
  if (!(ACCOUNT_TYPES as readonly string[]).includes(type)) {
    addError(errors, 'type', 'Tipo de conta inválido.')
    return errors
  }

  const issuer = input.issuerKey
  if (issuer != null) {
    const brand = getBrand(issuer)
    if (!brand || (brand.category !== 'bank' && brand.category !== 'payment')) {
      addError(errors, 'issuerKey', 'Emissor desconhecido: escolha um banco da lista.')
    }
  }

  const network = input.networkKey
  if (network != null) {
    if (type !== 'CREDIT_CARD') {
      addError(errors, 'networkKey', 'Bandeira só se aplica a cartão de crédito.')
    } else if (getBrand(network)?.category !== 'network') {
      addError(errors, 'networkKey', 'Bandeira desconhecida: escolha uma bandeira da lista.')
    }
  }

  const color = input.colorKey
  if (color != null && !(ACCOUNT_COLOR_KEYS as readonly string[]).includes(color)) {
    addError(errors, 'colorKey', 'Cor inválida: use cat-1 a cat-10.')
  }

  const icon = input.icon
  if (icon != null && (icon.length > ICON_MAX || !ICON_PATTERN.test(icon))) {
    addError(errors, 'icon', 'Ícone inválido.')
  }

  const overdraft = input.overdraftLimit
  if (overdraft != null) {
    if (!isInt(overdraft) || overdraft < 0 || overdraft > MAX_CENTS) {
      addError(
        errors,
        'overdraftLimit',
        'O cheque especial deve ser um valor em centavos, maior ou igual a zero.',
      )
    } else if (overdraft > 0 && !(OVERDRAFT_TYPES as readonly string[]).includes(type)) {
      addError(errors, 'overdraftLimit', 'Cheque especial só se aplica a conta corrente ou PJ.')
    }
  }

  const isCard = type === 'CREDIT_CARD'
  const credit = input.creditLimit
  if (isCard) {
    if (credit == null) addError(errors, 'creditLimit', 'Informe o limite do cartão.')
    else if (!isInt(credit) || credit <= 0 || credit > MAX_CENTS) {
      addError(errors, 'creditLimit', 'O limite do cartão deve ser maior que zero (centavos).')
    }
  } else if (credit != null) {
    addError(errors, 'creditLimit', 'Limite de crédito só se aplica a cartão de crédito.')
  }

  for (const [field, label, value] of [
    ['closingDay', 'fechamento', input.closingDay],
    ['dueDay', 'vencimento', input.dueDay],
  ] as const) {
    if (isCard) {
      if (value == null) addError(errors, field, `Informe o dia de ${label} da fatura.`)
      else if (!isInt(value) || value < 1 || value > 31) {
        addError(errors, field, `O dia de ${label} deve estar entre 1 e 31.`)
      }
    } else if (value != null) {
      addError(errors, field, `O dia de ${label} só se aplica a cartão de crédito.`)
    }
  }

  return errors
}

/** Valida o saldo inicial (assinado, centavos). Cartão só aceita dívida (valor <= 0). */
export function validateOpeningBalance(
  type: AccountType,
  openingBalance: number | undefined,
): AccountFieldErrors {
  const errors: AccountFieldErrors = {}
  if (openingBalance === undefined) return errors
  if (!isInt(openingBalance) || Math.abs(openingBalance) > MAX_CENTS) {
    addError(errors, 'openingBalance', 'O saldo inicial deve ser um valor inteiro em centavos.')
  } else if (type === 'CREDIT_CARD' && openingBalance > 0) {
    addError(
      errors,
      'openingBalance',
      'Em cartão, o saldo inicial representa a dívida já existente (valor negativo).',
    )
  }
  return errors
}

/** Campos prontos para gravar: nome normalizado, `undefined` vira `null`/0 (por tipo). */
export function normalizeAccountFields(input: AccountFields): NormalizedAccountFields {
  const isCard = input.type === 'CREDIT_CARD'
  return {
    name: normalizeName(input.name),
    type: input.type,
    issuerKey: input.issuerKey ?? null,
    networkKey: isCard ? (input.networkKey ?? null) : null,
    colorKey: input.colorKey ?? null,
    icon: input.icon ?? null,
    overdraftLimit: (OVERDRAFT_TYPES as readonly string[]).includes(input.type)
      ? (input.overdraftLimit ?? 0)
      : 0,
    creditLimit: isCard ? (input.creditLimit ?? null) : null,
    closingDay: isCard ? (input.closingDay ?? null) : null,
    dueDay: isCard ? (input.dueDay ?? null) : null,
  }
}

export function hasErrors(errors: AccountFieldErrors): boolean {
  return Object.keys(errors).length > 0
}
