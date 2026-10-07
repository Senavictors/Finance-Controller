import { NextRequest, NextResponse } from 'next/server'
import { simulatePayoff } from '@/server/modules/debts/application/simulate-payoff'
import { toSimulationDto } from '@/server/modules/debts/http/dto'
import { debtsRoute } from '@/server/modules/debts/http/route'
import { simulateQuerySchema } from '@/server/modules/debts/http/schemas'
import { getDebtsDeps } from '@/server/modules/debts/infra/default-deps'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  return debtsRoute(async ({ userId, now }) => {
    const { id } = await params
    const query = simulateQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const result = await simulatePayoff(userId, { loanId: id, now, ...query }, getDebtsDeps())
    return NextResponse.json({ simulation: toSimulationDto(result) })
  })
}
