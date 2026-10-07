import { ZodError } from 'zod'
import { LedgerError, type LedgerErrorCategory } from '../domain/types'

export interface HttpErrorBody {
  error: string
  code: string
  details?: Record<string, string[] | undefined>
}

export interface HttpErrorMapping {
  status: number
  body: HttpErrorBody
}

const STATUS_BY_CATEGORY: Record<LedgerErrorCategory, number> = {
  INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
}

/** Sinal de falha de leitura do corpo JSON (ver `readJsonBody`). */
export class InvalidJsonError extends Error {
  constructor() {
    super('Corpo da requisição não é um JSON válido')
    this.name = 'InvalidJsonError'
  }
}

/**
 * Traduz erros em `{ status, body: { error, code } }` sem vazar stack nem detalhes internos:
 * `LedgerError` => 400/404/409 conforme a categoria; Zod => 400; sessão ausente => 401;
 * qualquer outro => 500 genérico. Sessão é detectada por nome para manter este módulo
 * livre de dependências de infraestrutura (cookies/banco) e testável.
 */
export function mapErrorToHttp(error: unknown): HttpErrorMapping {
  if (error instanceof LedgerError) {
    return {
      status: STATUS_BY_CATEGORY[error.category],
      body: { error: error.message, code: error.code },
    }
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: 'Validation failed',
        code: 'VALIDATION_FAILED',
        details: error.flatten().fieldErrors as Record<string, string[] | undefined>,
      },
    }
  }
  if (error instanceof InvalidJsonError) {
    return { status: 400, body: { error: error.message, code: 'INVALID_JSON' } }
  }
  if (error instanceof Error && error.name === 'AuthError') {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } }
  }
  return { status: 500, body: { error: 'Internal server error', code: 'INTERNAL_ERROR' } }
}
