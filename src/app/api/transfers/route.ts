import { NextRequest, NextResponse } from 'next/server'
import { getLedgerService } from '@/server/modules/ledger/infra/ledger-service'
import { toTransactionDto } from '@/server/modules/ledger/http/dto'
import { ledgerRoute, readJsonBody } from '@/server/modules/ledger/http/route'
import { createTransferSchema } from '@/server/modules/ledger/http/schemas'

export async function POST(request: NextRequest) {
  return ledgerRoute(async ({ userId }) => {
    const body = createTransferSchema.parse(await readJsonBody(request))
    const result = await getLedgerService().createTransfer({ userId }, body)
    return NextResponse.json(
      {
        transferId: result.transferId,
        outgoing: toTransactionDto(result.outgoing),
        incoming: toTransactionDto(result.incoming),
        positions: result.positions,
        warnings: result.warnings,
      },
      { status: 201 },
    )
  })
}
