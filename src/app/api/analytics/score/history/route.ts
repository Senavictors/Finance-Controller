import { NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { getFinancialScoreHistory } from '@/server/modules/finance/application/score'

export async function GET() {
  try {
    const { userId } = await requireAuth()
    const snapshots = await getFinancialScoreHistory(userId)

    return NextResponse.json({
      data: snapshots.map((s) => ({
        periodStart: s.periodStart.toISOString(),
        periodEnd: s.periodEnd.toISOString(),
        score: s.score,
        status: s.status,
        calculatedAt: s.calculatedAt.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
