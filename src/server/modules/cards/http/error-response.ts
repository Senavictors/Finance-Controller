import { mapErrorToHttp as mapLedgerErrorToHttp } from '@/server/modules/ledger'
import { CardsError, type CardsErrorCategory } from '../domain/errors'

const STATUS_BY_CATEGORY: Record<CardsErrorCategory, number> = {
  INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
}

/** Falha ao ler o corpo JSON da requisição. */
export class InvalidJsonError extends Error {
  constructor() {
    super('Corpo da requisição não é um JSON válido')
    this.name = 'InvalidJsonError'
  }
}

/**
 * `CardsError` => 400/404/409 `{ error, code }` (inclui `details` quando houver, ex.: `open` no
 * `STATEMENT_OVERPAYMENT`); JSON inválido => 400; o resto (LedgerError, Zod, sessão) é
 * traduzido pelo mapeador público do ledger. Nunca vaza stack nem detalhes internos.
 */
export function mapErrorToHttp(error: unknown): {
  status: number
  body: { error: string; code: string; details?: unknown }
} {
  if (error instanceof CardsError) {
    return {
      status: STATUS_BY_CATEGORY[error.category],
      body: {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
    }
  }
  if (error instanceof InvalidJsonError) {
    return { status: 400, body: { error: error.message, code: 'INVALID_JSON' } }
  }
  return mapLedgerErrorToHttp(error)
}
