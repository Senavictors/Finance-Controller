import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { refreshInsightSnapshots } from '@/server/modules/finance/application/insights'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const monthParam = request.nextUrl.searchParams.get('month')
    const insights = await refreshInsightSnapshots(userId, monthParam)

    return NextResponse.json({
      data: insights.map((i) => ({
        id: i.id,
        key: i.key,
        fingerprint: i.fingerprint,
        severity: i.severity,
        isDismissed: i.isDismissed,
      })),
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
