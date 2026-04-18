import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { listInsights } from '@/server/modules/finance/application/insights'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const monthParam = request.nextUrl.searchParams.get('month')
    const insights = await listInsights(userId, monthParam)

    return NextResponse.json({
      data: insights
        .filter((i) => !i.isDismissed)
        .map((i) => ({
          id: i.id || null,
          key: i.key,
          title: i.title,
          body: i.body,
          severity: i.severity,
          scopeType: i.scopeType,
          scopeId: i.scopeId ?? null,
          cta: i.cta ?? null,
          fingerprint: i.fingerprint,
          priority: i.priority,
          periodStart: i.periodStart.toISOString(),
          periodEnd: i.periodEnd.toISOString(),
        })),
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
