import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { createTransactionSchema, transactionQuerySchema } from '@/server/modules/finance/http'
import { syncCreditCardTransactionStatement } from '@/server/modules/finance/application/credit-card/billing'
import { createCreditCardPurchase } from '@/server/modules/finance/application/credit-card-purchases'
import {
  ANALYTICS_MUTATION_MODULES,
  invalidateAnalyticsSnapshots,
} from '@/server/modules/finance/application/analytics'

const expectedErrors = [
  'Conta nao encontrada',
  'Categoria financeira nao encontrada',
  'Parcelamento so pode ser usado em contas de cartao de credito',
  'Quantidade de parcelas invalida',
  'Valor da compra deve ser maior que zero',
] as const

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()

    const query = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = transactionQuerySchema.safeParse(query)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { from, to, accountId, categoryId, q, page, limit } = parsed.data

    const where = {
      userId,
      ...(from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(accountId ? { accountId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q ? { description: { contains: q, mode: 'insensitive' as const } } : {}),
    }

    const [data, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          account: { select: { name: true, color: true } },
          category: { select: { name: true, color: true } },
          creditCardStatement: { select: { id: true, dueDate: true } },
          creditCardPurchaseInstallment: {
            select: {
              id: true,
              installmentNumber: true,
              advanceId: true,
              purchase: {
                select: {
                  id: true,
                  installmentCount: true,
                },
              },
            },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])

    return NextResponse.json({
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const body = await request.json()
    const parsed = createTransactionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { accountId, categoryId, paymentMode, installmentCount, ...data } = parsed.data

    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true, type: true },
    })
    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 400 })
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, userId } })
      if (!category) {
        return NextResponse.json({ error: 'Categoria nao encontrada' }, { status: 400 })
      }
    }

    if (account.type === 'CREDIT_CARD' && data.type === 'EXPENSE') {
      const result = await createCreditCardPurchase({
        userId,
        accountId,
        categoryId: categoryId ?? null,
        description: data.description,
        notes: data.notes,
        date: data.date,
        amount: data.amount,
        installmentCount: paymentMode === 'INSTALLMENT' ? installmentCount! : 1,
      })

      return NextResponse.json(
        {
          data: result.primaryTransaction,
          purchase: {
            id: result.purchase.id,
            installmentCount: result.purchase.installmentCount,
          },
        },
        { status: 201 },
      )
    }

    const transaction = await prisma.transaction.create({
      data: { ...data, accountId, categoryId: categoryId ?? null, userId },
    })

    const statement = await syncCreditCardTransactionStatement(transaction.id)

    await invalidateAnalyticsSnapshots({
      userId,
      modules: ANALYTICS_MUTATION_MODULES.transaction,
      dates: [transaction.date],
      accountIds: [transaction.accountId],
      categoryIds: [transaction.categoryId],
      statementIds: [statement?.id],
    })

    return NextResponse.json({ data: transaction }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (
      error instanceof Error &&
      expectedErrors.includes(error.message as (typeof expectedErrors)[number])
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
