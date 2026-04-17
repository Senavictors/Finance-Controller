import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { getMonthlyAnalyticsSummary } from '@/server/modules/finance/application/analytics'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const monthParam = request.nextUrl.searchParams.get('month')
    const summary = await getMonthlyAnalyticsSummary({ userId, monthParam })

    return NextResponse.json({
      data: {
        totalIncome: summary.totalIncome,
        totalExpenses: summary.totalExpenses,
        balance: summary.balance,
        incomeVariation: summary.incomeVariation,
        expenseVariation: summary.expenseVariation,
        transactionCount: summary.transactionCount,
        balanceByAccount: summary.balanceByAccount,
        expensesByCategory: summary.expensesByCategory,
        recentTransactions: summary.recentTransactions,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
