import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { updateAccountSchema } from '@/server/modules/finance/http'
import { syncCreditCardStatementsForAccount } from '@/server/modules/finance/application/credit-card/billing'
import { isCreditCardBillingConfigured } from '@/server/modules/finance/application/credit-card/statement-cycle'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params

    const account = await prisma.account.findFirst({
      where: { id, userId },
    })

    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 404 })
    }

    return NextResponse.json({ data: account })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = updateAccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const existing = await prisma.account.findFirst({ where: { id, userId } })
    if (!existing) {
      return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 404 })
    }

    const nextType = parsed.data.type ?? existing.type
    const nextCreditLimit =
      parsed.data.creditLimit !== undefined ? parsed.data.creditLimit : existing.creditLimit
    const nextClosingDay =
      parsed.data.statementClosingDay !== undefined
        ? parsed.data.statementClosingDay
        : existing.statementClosingDay
    const nextDueDay =
      parsed.data.statementDueDay !== undefined
        ? parsed.data.statementDueDay
        : existing.statementDueDay

    if (
      nextType === 'CREDIT_CARD' &&
      (nextCreditLimit == null || nextClosingDay == null || nextDueDay == null)
    ) {
      return NextResponse.json(
        {
          error:
            'Cartao de credito precisa de limite, dia de fechamento e dia de vencimento configurados',
        },
        { status: 400 },
      )
    }

    const data =
      nextType === 'CREDIT_CARD'
        ? parsed.data
        : {
            ...parsed.data,
            creditLimit: null,
            statementClosingDay: null,
            statementDueDay: null,
          }

    const account = await prisma.account.update({
      where: { id },
      data,
    })

    if (account.type !== 'CREDIT_CARD' && existing.type === 'CREDIT_CARD') {
      await prisma.transaction.updateMany({
        where: { accountId: account.id },
        data: { creditCardStatementId: null },
      })
      await prisma.creditCardStatement.deleteMany({
        where: { accountId: account.id },
      })
    } else if (isCreditCardBillingConfigured(account)) {
      await syncCreditCardStatementsForAccount(account.id)
    }

    return NextResponse.json({ data: account })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params

    const existing = await prisma.account.findFirst({ where: { id, userId } })
    if (!existing) {
      return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 404 })
    }

    await prisma.account.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
