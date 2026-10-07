import { NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth'
import { InvalidJsonError, mapErrorToHttp } from './error-response'

/**
 * Casca fina comum às rotas de cartões: `requireAuth()` (defesa em profundidade além do proxy)
 * -> handler (Zod -> use-case -> JSON) -> erros mapeados para 400/401/404/409 `{ error, code }`.
 */
export async function cardsRoute(
  handler: (ctx: { userId: string }) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const { userId } = await requireAuth()
    return await handler({ userId })
  } catch (error) {
    const { status, body } = mapErrorToHttp(error)
    if (status === 500) {
      console.error('[cards] erro inesperado:', error instanceof Error ? error.name : 'unknown')
    }
    return NextResponse.json(body, { status })
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new InvalidJsonError()
  }
}
