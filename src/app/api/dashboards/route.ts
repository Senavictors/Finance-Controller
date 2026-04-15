import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { DEFAULT_WIDGETS } from '@/app/(app)/dashboard/widgets/registry'

export async function GET() {
  try {
    const { userId } = await requireAuth()

    let dashboard = await prisma.dashboard.findUnique({
      where: { userId },
      include: { widgets: { orderBy: { createdAt: 'asc' } } },
    })

    if (!dashboard) {
      dashboard = await prisma.dashboard.create({
        data: {
          userId,
          widgets: {
            create: DEFAULT_WIDGETS.map((w) => ({
              type: w.type,
              x: w.x,
              y: w.y,
              w: w.w,
              h: w.h,
            })),
          },
        },
        include: { widgets: { orderBy: { createdAt: 'asc' } } },
      })
    }

    return NextResponse.json({ data: dashboard })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const body = await request.json()
    const { widgets } = body as {
      widgets: { id: string; x: number; y: number; w: number; h: number }[]
    }

    if (!Array.isArray(widgets)) {
      return NextResponse.json({ error: 'widgets deve ser um array' }, { status: 400 })
    }

    const dashboard = await prisma.dashboard.findUnique({ where: { userId } })
    if (!dashboard) {
      return NextResponse.json({ error: 'Dashboard nao encontrado' }, { status: 404 })
    }

    await Promise.all(
      widgets.map((w) =>
        prisma.dashboardWidget.update({
          where: { id: w.id },
          data: { x: w.x, y: w.y, w: w.w, h: w.h },
        }),
      ),
    )

    const updated = await prisma.dashboard.findUnique({
      where: { userId },
      include: { widgets: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
