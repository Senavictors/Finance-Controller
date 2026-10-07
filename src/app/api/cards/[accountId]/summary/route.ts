import { NextRequest, NextResponse } from 'next/server'
import { getCardsService } from '@/server/modules/cards/infra/cards-service'
import { toCardSummaryResponse } from '@/server/modules/cards/http/dto'
import { cardsRoute } from '@/server/modules/cards/http/route'

type RouteContext = { params: Promise<{ accountId: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  return cardsRoute(async ({ userId }) => {
    const { accountId } = await params
    const summary = await getCardsService().getCardSummary({ userId }, accountId)
    return NextResponse.json(toCardSummaryResponse(summary))
  })
}
