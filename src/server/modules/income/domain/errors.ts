/**
 * Erros do módulo de renda MEI (FC2-F1-06). Códigos estáveis: UI, bot e MCP dependem deles.
 * `domain/` não importa Next nem o ORM; a tradução para HTTP vive em `http/`.
 */
export const INCOME_ERROR_CODES = [
  'INCOME_INVALID_INPUT',
  'INCOME_INVALID_PERIOD',
  'INCOME_RULE_NOT_FOUND',
  'INCOME_ACCOUNT_NOT_FOUND',
  'INCOME_NOT_PLANNED_INCOME',
  'MEI_PROFILE_NOT_FOUND',
] as const

export type IncomeErrorCode = (typeof INCOME_ERROR_CODES)[number]

export type IncomeErrorCategory = 'INVALID' | 'NOT_FOUND' | 'CONFLICT'

const CATEGORY_BY_CODE: Record<IncomeErrorCode, IncomeErrorCategory> = {
  INCOME_INVALID_INPUT: 'INVALID',
  INCOME_INVALID_PERIOD: 'INVALID',
  INCOME_RULE_NOT_FOUND: 'NOT_FOUND',
  INCOME_ACCOUNT_NOT_FOUND: 'NOT_FOUND',
  INCOME_NOT_PLANNED_INCOME: 'CONFLICT',
  MEI_PROFILE_NOT_FOUND: 'NOT_FOUND',
}

export class IncomeError extends Error {
  readonly code: IncomeErrorCode
  readonly category: IncomeErrorCategory
  readonly details?: Record<string, unknown>

  constructor(code: IncomeErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'IncomeError'
    this.code = code
    this.category = CATEGORY_BY_CODE[code]
    this.details = details
  }
}

export function isIncomeError(error: unknown): error is IncomeError {
  return error instanceof IncomeError
}
