import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth'
import { mapErrorToHttp } from '@/server/modules/ledger'
import { isIncomeError, type IncomeErrorCategory } from '../domain/errors'

const STATUS_BY_CATEGORY: Record<IncomeErrorCategory, number> = {
  INVALID: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
}

/** Corpo da requisição que não é JSON. */
class InvalidJsonBodyError extends Error {
  constructor() {
    super('Corpo da requisição não é um JSON válido')
    this.name = 'InvalidJsonBodyError'
  }
}

/**
 * Casca fina comum às rotas de renda: `requireAuth()` (defesa em profundidade além do proxy)
 * -> handler (Zod -> use-case -> JSON) -> erros mapeados para `{ error, code }`. `IncomeError`
 * vira 400/404/409; o resto (ledger, Zod, sessão, 500 genérico) usa o mapeamento do ledger.
 */
export async function incomeRoute(
  handler: (ctx: { userId: string }) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const { userId } = await requireAuth()
    return await handler({ userId })
  } catch (error) {
    if (isIncomeError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: STATUS_BY_CATEGORY[error.category] },
      )
    }
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ error: error.message, code: 'INVALID_JSON' }, { status: 400 })
    }
    const { status, body } = mapErrorToHttp(error)
    if (status === 500) {
      console.error('[income] erro inesperado:', error instanceof Error ? error.name : 'unknown')
    }
    return NextResponse.json(body, { status })
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new InvalidJsonBodyError()
  }
}

/** Corpo opcional (rotas que aceitam `{}` ou nada): vazio vira `{}`; JSON inválido é 400. */
export async function readOptionalJsonBody(request: Request): Promise<unknown> {
  const text = await request.text()
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new InvalidJsonBodyError()
  }
}
