import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { createAccountSchema } from '@/server/modules/finance/http'
import {
  ANALYTICS_MUTATION_MODULES,
  invalidateAnalyticsSnapshots,
} from '@/server/modules/finance/application/analytics'

export async function GET() {
  try {
    const { userId } = await requireAuth()

    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ data: accounts })
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
    const parsed = createAccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const data =
      parsed.data.type === 'CREDIT_CARD'
        ? parsed.data
        : {
            ...parsed.data,
            creditLimit: null,
            statementClosingDay: null,
            statementDueDay: null,
            networkBrandKey: null,
          }

    const account = await prisma.account.create({
      data: { ...data, userId },
    })

    await invalidateAnalyticsSnapshots({
      userId,
      modules: ANALYTICS_MUTATION_MODULES.account,
      accountIds: [account.id],
    })

    return NextResponse.json({ data: account }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
