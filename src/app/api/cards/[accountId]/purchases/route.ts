import { NextRequest, NextResponse } from 'next/server'
import { getCardsService } from '@/server/modules/cards/infra/cards-service'
import { toCreatePurchaseResponse } from '@/server/modules/cards/http/dto'
import { cardsRoute, readJsonBody } from '@/server/modules/cards/http/route'
import { createPurchaseSchema } from '@/server/modules/cards/http/schemas'

type RouteContext = { params: Promise<{ accountId: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  return cardsRoute(async ({ userId }) => {
    const { accountId } = await params
    const body = createPurchaseSchema.parse(await readJsonBody(request))
    const result = await getCardsService().createCardPurchase({ userId }, { accountId, ...body })
    return NextResponse.json(toCreatePurchaseResponse(result), { status: 201 })
  })
}
