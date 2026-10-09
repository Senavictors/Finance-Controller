import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { AuthError, requireAuth } from '@/server/auth'
import { isLedgerError, mapErrorToHttp } from '@/server/modules/ledger'

import { ACCOUNT_ERROR_STATUS, AccountError } from '../domain/errors'

export interface HttpErrorBody {
  error: string
  code: string
  details?: Record<string, string[] | undefined>
}

/** Corpo da requisição ilegível (não é JSON). */
export class InvalidJsonError extends Error {
  constructor() {
    super('Corpo da requisição inválido.')
    this.name = 'InvalidJsonError'
  }
}

/**
 * Traduz qualquer erro em `{ status, body: { error, code } }` em pt-BR, sem vazar stack nem
 * dados internos: sessão ausente 401; Zod e `ACCOUNT_INVALID` 400 com `details` por campo;
 * regras de contas 404/409; erros do ledger (conta arquivada, valor fora da faixa...) pelo
 * mapeamento do próprio ledger; o resto 500 genérico.
 */
export function mapAccountError(error: unknown): { status: number; body: HttpErrorBody } {
  if (error instanceof AuthError) {
    return { status: 401, body: { error: 'Não autorizado', code: 'UNAUTHORIZED' } }
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: 'Dados inválidos',
        code: 'VALIDATION_FAILED',
        details: error.flatten().fieldErrors as Record<string, string[] | undefined>,
      },
    }
  }
  if (error instanceof InvalidJsonError) {
    return { status: 400, body: { error: error.message, code: 'INVALID_JSON' } }
  }
  if (error instanceof AccountError) {
    return {
      status: ACCOUNT_ERROR_STATUS[error.code],
      body: {
        error: error.message,
        code: error.code,
        ...(error.fields ? { details: error.fields } : {}),
      },
    }
  }
  if (isLedgerError(error)) {
    const { status, body } = mapErrorToHttp(error)
    return { status, body: { error: body.error, code: body.code } }
  }
  return { status: 500, body: { error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' } }
}

/**
 * Casca fina comum às rotas de contas: `requireAuth()` (defesa em profundidade além do proxy)
 * -> handler (Zod -> use-case -> JSON) -> erros mapeados para 400/401/404/409 `{ error, code }`.
 */
export async function accountRoute(
  handler: (ctx: { userId: string }) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const { userId } = await requireAuth()
    return await handler({ userId })
  } catch (error) {
    const { status, body } = mapAccountError(error)
    if (status === 500) {
      console.error('[accounts] erro inesperado:', error instanceof Error ? error.name : 'unknown')
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
