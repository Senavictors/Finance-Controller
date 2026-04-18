import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { calculateFinancialScore } from '@/server/modules/finance/application/score'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const monthParam = request.nextUrl.searchParams.get('month')
    const result = await calculateFinancialScore(userId, monthParam)

    return NextResponse.json({
      data: {
        periodStart: result.periodStart.toISOString(),
        periodEnd: result.periodEnd.toISOString(),
        score: result.score,
        status: result.status,
        factors: result.factors,
        insights: result.insights,
        previousScore: result.previousScore,
        delta: result.delta,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
