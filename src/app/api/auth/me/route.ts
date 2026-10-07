import { NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { getCurrentUser } from '@/server/auth/current-user'
import { prismaUserRepository } from '@/server/auth/prisma-repositories'

export async function GET() {
  try {
    const { userId } = await requireAuth()

    const user = await getCurrentUser(prismaUserRepository, userId)
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
