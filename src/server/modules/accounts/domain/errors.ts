export const ACCOUNT_ERROR_CODES = [
  'ACCOUNT_INVALID',
  'ACCOUNT_NOT_FOUND',
  'ACCOUNT_NAME_TAKEN',
  'ACCOUNT_TYPE_LOCKED',
  'ACCOUNT_HAS_TRANSACTIONS',
  'ACCOUNT_IN_USE',
] as const
export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number]

export const ACCOUNT_ERROR_STATUS: Record<AccountErrorCode, number> = {
  ACCOUNT_INVALID: 400,
  ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_NAME_TAKEN: 409,
  ACCOUNT_TYPE_LOCKED: 409,
  ACCOUNT_HAS_TRANSACTIONS: 409,
  ACCOUNT_IN_USE: 409,
}

/** Erro de regra de negócio de contas; a camada HTTP mapeia `code` para o status. */
export class AccountError extends Error {
  readonly code: AccountErrorCode
  /** Mensagens por campo (só `ACCOUNT_INVALID`). */
  readonly fields?: Record<string, string[] | undefined>

  constructor(
    code: AccountErrorCode,
    message: string,
    fields?: Record<string, string[] | undefined>,
  ) {
    super(message)
    this.name = 'AccountError'
    this.code = code
    this.fields = fields
  }
}

export function isAccountError(error: unknown): error is AccountError {
  return error instanceof AccountError
}
