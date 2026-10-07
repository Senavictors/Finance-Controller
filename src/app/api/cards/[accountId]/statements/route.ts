import { NextRequest, NextResponse } from 'next/server'
import { getCardsService } from '@/server/modules/cards/infra/cards-service'
import { toStatementDto } from '@/server/modules/cards/http/dto'
import { cardsRoute } from '@/server/modules/cards/http/route'

type RouteContext = { params: Promise<{ accountId: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  return cardsRoute(async ({ userId }) => {
    const { accountId } = await params
    const statements = await getCardsService().listStatements({ userId }, accountId)
    return NextResponse.json({ statements: statements.map(toStatementDto) })
  })
}
