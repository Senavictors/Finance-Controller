import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError, verifyPassword, destroySession } from '@/server/auth'
import { updateProfileSchema, deleteAccountSchema } from '@/server/auth/schemas'

export async function GET() {
  try {
    const { userId } = await requireAuth()

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, image: true, createdAt: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const body = await request.json()
    const parsed = updateProfileSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { name, email, image } = parsed.data

    const emailOwner = await prisma.user.findUnique({ where: { email } })
    if (emailOwner && emailOwner.id !== userId) {
      return NextResponse.json({ error: 'Email ja cadastrado' }, { status: 409 })
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        ...(image !== undefined ? { image } : {}),
      },
      select: { id: true, name: true, email: true, image: true, createdAt: true },
    })

    return NextResponse.json({ user: updated })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const body = await request.json()
    const parsed = deleteAccountSchema.safeParse(body)

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

    const valid = await verifyPassword(parsed.data.password, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
    }

    await prisma.user.delete({ where: { id: userId } })
    await destroySession()

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
