import { NextRequest, NextResponse } from 'next/server'
import { getCardsService } from '@/server/modules/cards/infra/cards-service'
import { toStatementDto } from '@/server/modules/cards/http/dto'
import { cardsRoute } from '@/server/modules/cards/http/route'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  return cardsRoute(async ({ userId }) => {
    const { id } = await params
    const result = await getCardsService().deleteCardPurchase({ userId }, id)
    return NextResponse.json({
      purchaseId: result.purchaseId,
      deletedTransactionIds: result.deletedTransactionIds,
      statements: result.statements.map(toStatementDto),
    })
  })
}
