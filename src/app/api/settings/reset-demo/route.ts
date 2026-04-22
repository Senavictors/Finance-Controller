import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { AuthError, requireAuth } from '@/server/auth'
import {
  ANALYTICS_MUTATION_MODULES,
  invalidateAnalyticsSnapshots,
} from '@/server/modules/finance/application/analytics'
import { createDemoFinanceData } from '@/server/modules/finance/application/demo/create-demo-finance-data'

export async function POST() {
  try {
    const { userId } = await requireAuth()

    await prisma.dashboard.deleteMany({ where: { userId } })
    await prisma.recurringRule.deleteMany({ where: { userId } })
    await prisma.goal.deleteMany({ where: { userId } })
    await prisma.forecastSnapshot.deleteMany({ where: { userId } })
    await prisma.financialScoreSnapshot.deleteMany({ where: { userId } })
    await prisma.insightSnapshot.deleteMany({ where: { userId } })
    await prisma.wishlistItem.deleteMany({ where: { userId } })
    await prisma.wishlistCategory.deleteMany({ where: { userId } })
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.creditCardStatement.deleteMany({ where: { userId } })
    await prisma.category.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await createDemoFinanceData(userId)

    await invalidateAnalyticsSnapshots({
      userId,
      modules: ANALYTICS_MUTATION_MODULES.fullRebuild,
    })

    return NextResponse.json({ success: true, message: 'Dados demo recriados com sucesso' })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
