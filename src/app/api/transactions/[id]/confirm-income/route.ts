import { NextRequest, NextResponse } from 'next/server'
import { getIncomeService } from '@/server/modules/income/infra/income-service'
import { toTransactionDto } from '@/server/modules/ledger/http/dto'
import { incomeRoute, readOptionalJsonBody } from '@/server/modules/income/http/route'
import { confirmIncomeSchema } from '@/server/modules/income/http/schemas'
import { toConfirmDto } from '@/server/modules/income/http/dto'

type RouteContext = { params: Promise<{ id: string }> }

/** "Recebi": confirma o previsto de renda com valor/data reais opcionais. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return incomeRoute(async ({ userId }) => {
    const { id } = await params
    const body = confirmIncomeSchema.parse(await readOptionalJsonBody(request))
    const result = await getIncomeService().confirmIncomeReceipt(
      { userId },
      { transactionId: id, ...body },
    )
    return NextResponse.json({
      transaction: toTransactionDto(result.transaction),
      ...toConfirmDto(result),
    })
  })
}
