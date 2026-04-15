import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { verifyPassword, createSession, checkRateLimit } from '@/server/auth'
import { loginSchema } from '@/server/auth/schemas'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const rateCheck = checkRateLimit(`login:${ip}`)

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas de login. Tente novamente mais tarde.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
        },
      )
    }

    const body = await request.json()
    const parsed = loginSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { email, password } = parsed.data

    const user = await prisma.user.findUnique({ where: { email } })
    const isValid = user ? await verifyPassword(password, user.password) : false

    if (!user || !isValid) {
      return NextResponse.json({ error: 'Email ou senha invalidos' }, { status: 401 })
    }

    await createSession(user.id)

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
