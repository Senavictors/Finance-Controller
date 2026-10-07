import { NextRequest, NextResponse } from 'next/server'
import { getLedgerService } from '@/server/modules/ledger/infra/ledger-service'
import { toTransactionDto } from '@/server/modules/ledger/http/dto'
import { ledgerRoute, readJsonBody } from '@/server/modules/ledger/http/route'
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
} from '@/server/modules/ledger/http/schemas'

export async function GET(request: NextRequest) {
  return ledgerRoute(async ({ userId }) => {
    const query = listTransactionsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    )
    const page = await getLedgerService().listTransactions({ userId }, query)
    return NextResponse.json({
      items: page.items.map(toTransactionDto),
      nextCursor: page.nextCursor,
    })
  })
}

export async function POST(request: NextRequest) {
  return ledgerRoute(async ({ userId }) => {
    const body = createTransactionSchema.parse(await readJsonBody(request))
    const result = await getLedgerService().createTransaction({ userId }, body)
    return NextResponse.json(
      {
        transaction: toTransactionDto(result.transaction),
        position: result.position,
        warnings: result.warnings,
      },
      { status: 201 },
    )
  })
}
