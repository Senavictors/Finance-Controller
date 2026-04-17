import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { calculateForecast } from '@/server/modules/finance/application/forecast'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const monthParam = request.nextUrl.searchParams.get('month')
    const forecast = await calculateForecast(userId, monthParam)

    return NextResponse.json({
      data: {
        periodStart: forecast.periodStart.toISOString(),
        periodEnd: forecast.periodEnd.toISOString(),
        referenceDate: forecast.referenceDate.toISOString(),
        actualIncome: forecast.actualIncome,
        actualExpenses: forecast.actualExpenses,
        projectedRecurringIncome: forecast.projectedRecurringIncome,
        projectedRecurringExpenses: forecast.projectedRecurringExpenses,
        projectedVariableIncome: forecast.projectedVariableIncome,
        projectedVariableExpenses: forecast.projectedVariableExpenses,
        predictedBalance: forecast.predictedBalance,
        riskLevel: forecast.riskLevel,
        assumptions: forecast.assumptions,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
