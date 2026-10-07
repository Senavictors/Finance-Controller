import { NextRequest, NextResponse } from 'next/server'
import { getDebtSummary } from '@/server/modules/debts/application/list-debts'
import { debtsRoute } from '@/server/modules/debts/http/route'
import { listDebtsQuerySchema } from '@/server/modules/debts/http/schemas'
import { getDebtsDeps } from '@/server/modules/debts/infra/default-deps'

export async function GET(request: NextRequest) {
  return debtsRoute(async ({ userId, now }) => {
    const query = listDebtsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const summary = await getDebtSummary(
      userId,
      { now, includeIdle: query.includeIdle },
      getDebtsDeps(),
    )
    return NextResponse.json(summary)
  })
}
