import { NextRequest, NextResponse } from 'next/server'
import { loginWithCookie } from '@/server/auth'
import { loginSchema } from '@/server/auth/schemas'

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip') || 'unknown'
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  try {
    const result = await loginWithCookie({
      ...parsed.data,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    })

    if (result.ok) {
      return NextResponse.json({ user: result.user })
    }

    if (result.reason === 'rate-limited') {
      return NextResponse.json(
        { error: 'Muitas tentativas de login. Tente novamente mais tarde.' },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
      )
    }

    return NextResponse.json({ error: 'E-mail ou senha inválidos' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
