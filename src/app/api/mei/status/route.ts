import { NextRequest, NextResponse } from 'next/server'
import { getIncomeService } from '@/server/modules/income/infra/income-service'
import { toMeiStatusDto } from '@/server/modules/income/http/dto'
import { incomeRoute } from '@/server/modules/income/http/route'
import { meiStatusQuerySchema } from '@/server/modules/income/http/schemas'

/** Teto anual do MEI: informativo, não substitui contador. */
export async function GET(request: NextRequest) {
  return incomeRoute(async ({ userId }) => {
    const query = meiStatusQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const status = await getIncomeService().getMeiStatus({ userId }, { year: query.year })
    return NextResponse.json(toMeiStatusDto(status))
  })
}
