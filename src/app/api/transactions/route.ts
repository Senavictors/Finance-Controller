import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { createTransactionSchema, transactionQuerySchema } from '@/server/modules/finance/http'
import { syncCreditCardTransactionStatement } from '@/server/modules/finance/application/credit-card/billing'

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

    const { accountId, categoryId, ...data } = parsed.data

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } })
    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 400 })
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, userId } })
      if (!category) {
        return NextResponse.json({ error: 'Categoria nao encontrada' }, { status: 400 })
      }
    }

    const transaction = await prisma.transaction.create({
      data: { ...data, accountId, categoryId: categoryId ?? null, userId },
    })

    await syncCreditCardTransactionStatement(transaction.id)

    return NextResponse.json({ data: transaction }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
