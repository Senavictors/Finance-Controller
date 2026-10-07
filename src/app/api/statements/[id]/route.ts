import { NextRequest, NextResponse } from 'next/server'
import { getCardsService } from '@/server/modules/cards/infra/cards-service'
import { toStatementDetailResponse } from '@/server/modules/cards/http/dto'
import { cardsRoute } from '@/server/modules/cards/http/route'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  return cardsRoute(async ({ userId }) => {
    const { id } = await params
    const detail = await getCardsService().getStatementDetail({ userId }, id)
    return NextResponse.json(toStatementDetailResponse(detail))
  })
}
