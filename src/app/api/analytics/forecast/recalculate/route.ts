import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { refreshForecastSnapshot } from '@/server/modules/finance/application/forecast'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const monthParam = request.nextUrl.searchParams.get('month')
    const forecast = await refreshForecastSnapshot(userId, monthParam)

    return NextResponse.json({
      data: {
        periodStart: forecast.periodStart.toISOString(),
        periodEnd: forecast.periodEnd.toISOString(),
        referenceDate: forecast.referenceDate.toISOString(),
        predictedBalance: forecast.predictedBalance,
        riskLevel: forecast.riskLevel,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
