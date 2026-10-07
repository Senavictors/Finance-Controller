import { NextRequest, NextResponse } from 'next/server'
import { getIncomeService } from '@/server/modules/income/infra/income-service'
import { toProjectionDto } from '@/server/modules/income/http/dto'
import { incomeRoute } from '@/server/modules/income/http/route'
import { projectionQuerySchema } from '@/server/modules/income/http/schemas'

export async function GET(request: NextRequest) {
  return incomeRoute(async ({ userId }) => {
    const query = projectionQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const projection = await getIncomeService().projectIncome({ userId }, query)
    return NextResponse.json(toProjectionDto(projection))
  })
}
