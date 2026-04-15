import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params

    const widget = await prisma.dashboardWidget.findUnique({
      where: { id },
      include: { dashboard: { select: { userId: true } } },
    })

    if (!widget || widget.dashboard.userId !== userId) {
      return NextResponse.json({ error: 'Widget nao encontrado' }, { status: 404 })
    }

    await prisma.dashboardWidget.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
