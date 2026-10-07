import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth'
import { mapErrorToHttp } from '@/server/modules/ledger'
import { DebtError, isDebtError, type DebtErrorCategory } from '../domain/errors'

/** Lê o corpo JSON; inválido vira `DEBT_INVALID_INPUT` (400). */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new DebtError('DEBT_INVALID_INPUT', 'Corpo da requisição não é um JSON válido.')
  }
}

const STATUS_BY_CATEGORY: Record<DebtErrorCategory, number> = {
  INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
}

/** `{ status, body: { error, code, details? } }` de um erro de dívidas, ledger, Zod ou sessão. */
export function mapDebtErrorToHttp(error: unknown): {
  status: number
  body: { error: string; code: string; details?: unknown }
} {
  if (isDebtError(error)) {
    return {
      status: STATUS_BY_CATEGORY[error.category],
      body: { error: error.message, code: error.code, details: error.details },
    }
  }
  return mapErrorToHttp(error)
}

/**
 * Casca fina das rotas de dívidas: `requireAuth()` -> handler (Zod -> use-case -> JSON) ->
 * erros mapeados (`DebtError` 400/404/409, `LedgerError` 400/404/409, Zod 400, sessão 401).
 */
export async function debtsRoute(
  handler: (ctx: { userId: string; now: Date }) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const { userId } = await requireAuth()
    return await handler({ userId, now: new Date() })
  } catch (error) {
    const { status, body } = mapDebtErrorToHttp(error)
    if (status === 500) {
      console.error('[debts] erro inesperado:', error instanceof Error ? error.name : 'unknown')
    }
    return NextResponse.json(body, { status })
  }
}
