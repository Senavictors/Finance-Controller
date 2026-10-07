import { NextResponse } from 'next/server'

import { AuthError } from '@/server/auth/errors'

import { CategoryError, type CategoryErrorCode } from '../domain/errors'

export const CATEGORY_ERROR_STATUS: Record<CategoryErrorCode, number> = {
  CATEGORY_SYSTEM_LOCKED: 409,
  CATEGORY_NOT_FOUND: 404,
  CATEGORY_INVALID: 422,
  CATEGORY_MAX_DEPTH: 422,
}

/** Converte erros conhecidos em resposta JSON; o resto vira 500 genérico (sem vazar detalhes). */
export function categoryErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (error instanceof CategoryError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: CATEGORY_ERROR_STATUS[error.code] },
    )
  }
  return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
}
