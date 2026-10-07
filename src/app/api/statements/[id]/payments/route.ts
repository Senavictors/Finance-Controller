import { NextRequest, NextResponse } from 'next/server'
import { getCardsService } from '@/server/modules/cards/infra/cards-service'
import { toStatementDto } from '@/server/modules/cards/http/dto'
import { cardsRoute, readJsonBody } from '@/server/modules/cards/http/route'
import { payStatementSchema } from '@/server/modules/cards/http/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  return cardsRoute(async ({ userId }) => {
    const { id } = await params
    const body = payStatementSchema.parse(await readJsonBody(request))
    const result = await getCardsService().payStatement({ userId }, { statementId: id, ...body })
    return NextResponse.json(
      {
        transferId: result.transferId,
        sourceTransactionId: result.sourceTransactionId,
        cardTransactionId: result.cardTransactionId,
        statement: toStatementDto(result.statement),
        overdraftWarning: result.overdraftWarning,
        positions: result.positions,
        warnings: result.warnings,
      },
      { status: 201 },
    )
  })
}
