import { NextRequest, NextResponse } from 'next/server'
import { getCardsService } from '@/server/modules/cards/infra/cards-service'
import { toCardTxnDto, toStatementDto } from '@/server/modules/cards/http/dto'
import { cardsRoute, readJsonBody } from '@/server/modules/cards/http/route'
import { moveStatementSchema } from '@/server/modules/cards/http/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  return cardsRoute(async ({ userId }) => {
    const { id } = await params
    const body = moveStatementSchema.parse(await readJsonBody(request))
    const result = await getCardsService().moveTransactionToStatement(
      { userId },
      { transactionId: id, ...body },
    )
    return NextResponse.json({
      transaction: toCardTxnDto(result.transaction),
      from: result.from ? toStatementDto(result.from) : null,
      to: toStatementDto(result.to),
    })
  })
}
