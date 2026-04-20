import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import {
  requireAuth,
  AuthError,
  verifyPassword,
  hashPassword,
  invalidateOtherSessions,
} from '@/server/auth'
import { changePasswordSchema } from '@/server/auth/schemas'

export async function POST(request: NextRequest) {
  try {
    const { userId, sessionId } = await requireAuth()
    const body = await request.json()
    const parsed = changePasswordSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const valid = await verifyPassword(parsed.data.currentPassword, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 401 })
    }

    const newHash = await hashPassword(parsed.data.newPassword)
    await prisma.user.update({
      where: { id: userId },
      data: { password: newHash },
    })

    await invalidateOtherSessions(userId, sessionId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
