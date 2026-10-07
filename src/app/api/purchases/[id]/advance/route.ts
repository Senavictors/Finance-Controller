import { NextRequest, NextResponse } from 'next/server'
import { getCardsService } from '@/server/modules/cards/infra/cards-service'
import { toAdvanceResponse } from '@/server/modules/cards/http/dto'
import { cardsRoute, readJsonBody } from '@/server/modules/cards/http/route'
import { advanceSchema } from '@/server/modules/cards/http/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  return cardsRoute(async ({ userId }) => {
    const { id } = await params
    const body = advanceSchema.parse(await readJsonBody(request))
    const result = await getCardsService().advanceInstallments(
      { userId },
      { purchaseId: id, ...body },
    )
    return NextResponse.json(toAdvanceResponse(result), { status: 201 })
  })
}
