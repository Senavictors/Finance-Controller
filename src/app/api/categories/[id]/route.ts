import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { updateCategorySchema } from '@/server/modules/finance/http'
import {
  ANALYTICS_MUTATION_MODULES,
  invalidateAnalyticsSnapshots,
} from '@/server/modules/finance/application/analytics'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = updateCategorySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const existing = await prisma.category.findFirst({ where: { id, userId } })
    if (!existing) {
      return NextResponse.json({ error: 'Categoria nao encontrada' }, { status: 404 })
    }

    if (parsed.data.parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: parsed.data.parentId, userId },
      })
      if (!parent) {
        return NextResponse.json({ error: 'Categoria pai nao encontrada' }, { status: 400 })
      }
      if (parent.type !== existing.type) {
        return NextResponse.json(
          { error: 'Subcategoria deve ter o mesmo tipo da categoria pai' },
          { status: 400 },
        )
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: parsed.data,
    })

    await invalidateAnalyticsSnapshots({
      userId,
      modules: ANALYTICS_MUTATION_MODULES.category,
      categoryIds: [existing.id, category.id],
    })

    return NextResponse.json({ data: category })
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

    const existing = await prisma.category.findFirst({
      where: { id, userId },
      include: { _count: { select: { transactions: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Categoria nao encontrada' }, { status: 404 })
    }

    if (existing._count.transactions > 0) {
      return NextResponse.json(
        {
          error:
            'Categoria possui transacoes vinculadas. Remova ou reatribua as transacoes primeiro.',
        },
        { status: 409 },
      )
    }

    await prisma.category.delete({ where: { id } })

    await invalidateAnalyticsSnapshots({
      userId,
      modules: ANALYTICS_MUTATION_MODULES.category,
      categoryIds: [existing.id],
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
