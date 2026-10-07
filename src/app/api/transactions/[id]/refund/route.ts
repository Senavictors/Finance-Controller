import { NextRequest, NextResponse } from 'next/server'
import { getCardsService } from '@/server/modules/cards/infra/cards-service'
import { toCardTxnDto, toStatementDto } from '@/server/modules/cards/http/dto'
import { cardsRoute, readJsonBody } from '@/server/modules/cards/http/route'
import { refundSchema } from '@/server/modules/cards/http/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  return cardsRoute(async ({ userId }) => {
    const { id } = await params
    const body = refundSchema.parse(await readJsonBody(request))
    const result = await getCardsService().refundCardTransaction(
      { userId },
      { originalTransactionId: id, ...body },
    )
    return NextResponse.json(
      {
        transaction: toCardTxnDto(result.transaction),
        statement: toStatementDto(result.statement),
        refundableRemaining: result.refundableRemaining,
      },
      { status: 201 },
    )
  })
}
