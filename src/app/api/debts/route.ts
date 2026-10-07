import { NextRequest, NextResponse } from 'next/server'
import { createLoan } from '@/server/modules/debts/application/create-loan'
import { listDebts } from '@/server/modules/debts/application/list-debts'
import { toLoanDto } from '@/server/modules/debts/http/dto'
import { debtsRoute, readJsonBody } from '@/server/modules/debts/http/route'
import { createLoanSchema, listDebtsQuerySchema } from '@/server/modules/debts/http/schemas'
import { getDebtsDeps } from '@/server/modules/debts/infra/default-deps'

export async function GET(request: NextRequest) {
  return debtsRoute(async ({ userId, now }) => {
    const query = listDebtsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const result = await listDebts(userId, { now, includeIdle: query.includeIdle }, getDebtsDeps())
    return NextResponse.json(result)
  })
}

export async function POST(request: NextRequest) {
  return debtsRoute(async ({ userId }) => {
    const body = createLoanSchema.parse(await readJsonBody(request))
    const result = await createLoan(userId, body, getDebtsDeps())
    return NextResponse.json(
      {
        loan: toLoanDto(result.loan),
        rateInferred: result.rateInferred,
        installmentCount: result.installmentCount,
      },
      { status: 201 },
    )
  })
}
