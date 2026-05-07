import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { createCategorySchema, categoryQuerySchema } from '@/server/modules/finance/http'
import {
  ANALYTICS_MUTATION_MODULES,
  invalidateAnalyticsSnapshots,
} from '@/server/modules/finance/application/analytics'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()

    const query = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = categoryQuerySchema.safeParse(query)
    const data = parsed.success ? parsed.data : null

    const hierarchyFilter = data?.rootOnly
      ? { parentId: null }
      : data?.parentId
        ? { parentId: data.parentId }
        : {}

    const typeFilter = data?.type ? { type: data.type } : {}

    const categories = await prisma.category.findMany({
      where: { userId, ...typeFilter, ...hierarchyFilter },
      include: {
        _count: { select: { children: true, transactions: true } },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ data: categories })
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
    const parsed = createCategorySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { parentId, ...data } = parsed.data

    if (parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parentId, userId },
      })
      if (!parent) {
        return NextResponse.json({ error: 'Categoria pai nao encontrada' }, { status: 400 })
      }
      if (parent.type !== data.type) {
        return NextResponse.json(
          { error: 'Subcategoria deve ter o mesmo tipo da categoria pai' },
          { status: 400 },
        )
      }
    }

    const category = await prisma.category.create({
      data: { ...data, parentId: parentId ?? null, userId },
    })

    await invalidateAnalyticsSnapshots({
      userId,
      modules: ANALYTICS_MUTATION_MODULES.category,
      categoryIds: [category.id],
    })

    return NextResponse.json({ data: category }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
