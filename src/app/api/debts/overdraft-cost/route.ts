import { NextRequest, NextResponse } from 'next/server'
import { estimateOverdraftCost } from '@/server/modules/debts/application/estimate-overdraft-cost'
import { debtsRoute } from '@/server/modules/debts/http/route'
import { overdraftCostQuerySchema } from '@/server/modules/debts/http/schemas'
import { getDebtsDeps } from '@/server/modules/debts/infra/default-deps'

export async function GET(request: NextRequest) {
  return debtsRoute(async ({ userId, now }) => {
    const query = overdraftCostQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const estimate = await estimateOverdraftCost(
      userId,
      query.accountId,
      { month: query.month, now },
      getDebtsDeps(),
    )
    return NextResponse.json({ estimate })
  })
}
