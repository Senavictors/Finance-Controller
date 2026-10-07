import { NextRequest, NextResponse } from 'next/server'
import { getLedgerService } from '@/server/modules/ledger/infra/ledger-service'
import { toTransactionDto } from '@/server/modules/ledger/http/dto'
import { ledgerRoute, readJsonBody } from '@/server/modules/ledger/http/route'
import { changeStatusSchema } from '@/server/modules/ledger/http/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  return ledgerRoute(async ({ userId }) => {
    const { id } = await params
    const { status } = changeStatusSchema.parse(await readJsonBody(request))
    const result = await getLedgerService().changeTransactionStatus({ userId }, id, status)
    return NextResponse.json({
      transaction: toTransactionDto(result.transaction),
      counterpart: result.counterpart ? toTransactionDto(result.counterpart) : null,
      positions: result.positions,
      warnings: result.warnings,
    })
  })
}
