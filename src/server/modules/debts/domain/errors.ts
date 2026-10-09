/**
 * Códigos estáveis de erro do módulo de dívidas (contrato público: UI, bot e MCP dependem).
 * A categoria define o status HTTP (INVALID 400/422, NOT_FOUND 404, CONFLICT 409).
 */
export const DEBT_ERROR_CODES = [
  'DEBT_INVALID_INPUT',
  'DEBT_INCONSISTENT_CONTRACT',
  'DEBT_LOAN_NOT_FOUND',
  'DEBT_INSTALLMENT_NOT_FOUND',
  'DEBT_ACCOUNT_NOT_FOUND',
  'INSTALLMENT_ALREADY_PAID',
  'DEBT_INSTALLMENT_NOT_PAYABLE',
  'DEBT_PARTIAL_PAYMENT_UNSUPPORTED',
  'DEBT_LOAN_HAS_PAID_INSTALLMENTS',
  'DEBT_NOT_INSTALLMENT_LOAN',
  'DEBT_NOT_ACTIVE',
] as const

export type DebtErrorCode = (typeof DEBT_ERROR_CODES)[number]

export type DebtErrorCategory = 'INVALID' | 'NOT_FOUND' | 'CONFLICT'

const CATEGORY_BY_CODE: Record<DebtErrorCode, DebtErrorCategory> = {
  DEBT_INVALID_INPUT: 'INVALID',
  DEBT_INCONSISTENT_CONTRACT: 'INVALID',
  DEBT_LOAN_NOT_FOUND: 'NOT_FOUND',
  DEBT_INSTALLMENT_NOT_FOUND: 'NOT_FOUND',
  DEBT_ACCOUNT_NOT_FOUND: 'NOT_FOUND',
  INSTALLMENT_ALREADY_PAID: 'CONFLICT',
  DEBT_INSTALLMENT_NOT_PAYABLE: 'CONFLICT',
  DEBT_PARTIAL_PAYMENT_UNSUPPORTED: 'INVALID',
  DEBT_LOAN_HAS_PAID_INSTALLMENTS: 'CONFLICT',
  DEBT_NOT_INSTALLMENT_LOAN: 'INVALID',
  DEBT_NOT_ACTIVE: 'CONFLICT',
}

/** Erro de regra de negócio de dívidas; a camada HTTP traduz `code` para o status. */
export class DebtError extends Error {
  readonly code: DebtErrorCode
  readonly category: DebtErrorCategory
  readonly details?: Record<string, unknown>

  constructor(code: DebtErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'DebtError'
    this.code = code
    this.category = CATEGORY_BY_CODE[code]
    this.details = details
  }
}

export function isDebtError(error: unknown): error is DebtError {
  return error instanceof DebtError
}
