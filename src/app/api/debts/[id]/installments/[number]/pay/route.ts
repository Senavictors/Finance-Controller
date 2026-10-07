import { NextRequest, NextResponse } from 'next/server'
import { registerInstallmentPayment } from '@/server/modules/debts/application/register-installment-payment'
import { debtsRoute, readJsonBody } from '@/server/modules/debts/http/route'
import { installmentParamsSchema, payInstallmentSchema } from '@/server/modules/debts/http/schemas'
import { getDebtsDeps } from '@/server/modules/debts/infra/default-deps'

type RouteContext = { params: Promise<{ id: string; number: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  return debtsRoute(async ({ userId }) => {
    const { id, number } = installmentParamsSchema.parse(await params)
    const body = payInstallmentSchema.parse(await readJsonBody(request))
    const result = await registerInstallmentPayment(
      userId,
      { loanId: id, number, ...body },
      getDebtsDeps(),
    )
    return NextResponse.json({ payment: result }, { status: 201 })
  })
}
