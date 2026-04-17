import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { prisma } from '@/server/db'
import { refreshCreditCardStatement } from '@/server/modules/finance/application/credit-card/billing'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params

    await refreshCreditCardStatement(id)

    const statement = await prisma.creditCardStatement.findFirst({
      where: { id, userId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            color: true,
            creditLimit: true,
            statementClosingDay: true,
            statementDueDay: true,
          },
        },
        transactions: {
          include: {
            category: { select: { name: true, color: true } },
          },
          orderBy: { date: 'desc' },
        },
      },
    })

    if (!statement) {
      return NextResponse.json({ error: 'Fatura nao encontrada' }, { status: 404 })
    }

    return NextResponse.json({ data: statement })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
