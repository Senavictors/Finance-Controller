import { NextRequest, NextResponse } from 'next/server'
import { getLedgerService } from '@/server/modules/ledger/infra/ledger-service'
import { toTransactionDto } from '@/server/modules/ledger/http/dto'
import { ledgerRoute, readJsonBody } from '@/server/modules/ledger/http/route'
import { updateTransactionSchema } from '@/server/modules/ledger/http/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return ledgerRoute(async ({ userId }) => {
    const { id } = await params
    const body = updateTransactionSchema.parse(await readJsonBody(request))
    const result = await getLedgerService().updateTransaction({ userId }, id, body)
    return NextResponse.json({
      transaction: toTransactionDto(result.transaction),
      counterpart: result.counterpart ? toTransactionDto(result.counterpart) : null,
      positions: result.positions,
      warnings: result.warnings,
    })
  })
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  return ledgerRoute(async ({ userId }) => {
    const { id } = await params
    const result = await getLedgerService().deleteTransaction({ userId }, id)
    return NextResponse.json(result)
  })
}
