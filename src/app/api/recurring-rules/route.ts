import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { createRecurringRuleSchema } from '@/server/modules/finance/http'

export async function GET() {
  try {
    const { userId } = await requireAuth()

    const rules = await prisma.recurringRule.findMany({
      where: { userId },
      include: {
        account: { select: { name: true, color: true } },
        category: { select: { name: true, color: true } },
        _count: { select: { logs: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ data: rules })
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
    const parsed = createRecurringRuleSchema.safeParse(body)

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

    const rule = await prisma.recurringRule.create({
      data: { ...data, accountId, categoryId: categoryId ?? null, userId },
    })

    return NextResponse.json({ data: rule }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
