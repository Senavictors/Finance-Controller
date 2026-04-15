import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const body = await request.json()
    const { type, x, y, w, h } = body as {
      type: string
      x: number
      y: number
      w: number
      h: number
    }

    const dashboard = await prisma.dashboard.upsert({
      where: { userId },
      update: {},
      create: { userId },
    })

    const widget = await prisma.dashboardWidget.create({
      data: {
        dashboardId: dashboard.id,
        type,
        x: x ?? 0,
        y: y ?? 0,
        w: w ?? 6,
        h: h ?? 4,
      },
    })

    return NextResponse.json({ data: widget }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
