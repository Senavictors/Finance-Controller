import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { prisma } from '@/server/db'
import { createCreditCardPaymentSchema } from '@/server/modules/finance/http'
import { refreshCreditCardStatement } from '@/server/modules/finance/application/credit-card/billing'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = createCreditCardPaymentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const statement = await prisma.creditCardStatement.findFirst({
      where: { id, userId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!statement) {
      return NextResponse.json({ error: 'Fatura nao encontrada' }, { status: 404 })
    }

    const sourceAccount = await prisma.account.findFirst({
      where: { id: parsed.data.sourceAccountId, userId },
      select: { id: true, name: true },
    })

    if (!sourceAccount) {
      return NextResponse.json({ error: 'Conta de origem nao encontrada' }, { status: 400 })
    }

    if (sourceAccount.id === statement.account.id) {
      return NextResponse.json(
        { error: 'A conta de origem deve ser diferente do cartao de credito' },
        { status: 400 },
      )
    }

    const openAmount = Math.max(statement.totalAmount - statement.paidAmount, 0)
    if (openAmount <= 0) {
      return NextResponse.json({ error: 'Esta fatura ja esta quitada' }, { status: 400 })
    }

    if (parsed.data.amount > openAmount) {
      return NextResponse.json(
        { error: 'O valor do pagamento nao pode exceder o saldo em aberto da fatura' },
        { status: 400 },
      )
    }

    const transferId = crypto.randomUUID()

    const [outgoing, incoming] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          accountId: sourceAccount.id,
          type: 'TRANSFER',
          amount: parsed.data.amount,
          date: parsed.data.date,
          description: parsed.data.description,
          notes: parsed.data.notes,
          transferId,
        },
      }),
      prisma.transaction.create({
        data: {
          userId,
          accountId: statement.account.id,
          creditCardStatementId: statement.id,
          type: 'TRANSFER',
          amount: parsed.data.amount,
          date: parsed.data.date,
          description: parsed.data.description,
          notes: parsed.data.notes,
          transferId,
        },
      }),
    ])

    await refreshCreditCardStatement(statement.id)

    return NextResponse.json({ data: { outgoing, incoming, transferId } }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
