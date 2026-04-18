import { NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { dismissInsight } from '@/server/modules/finance/application/insights'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(_: Request, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    await dismissInsight(id, userId)
    return NextResponse.json({ data: { id, isDismissed: true } })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Insight nao encontrado') {
      return NextResponse.json({ error: 'Insight nao encontrado' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
