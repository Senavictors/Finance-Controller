import { NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { prisma } from '@/server/db'

export async function GET() {
  try {
    const { userId } = await requireAuth()

    const statements = await prisma.creditCardStatement.findMany({
      where: { userId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            color: true,
            creditLimit: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ data: statements })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
