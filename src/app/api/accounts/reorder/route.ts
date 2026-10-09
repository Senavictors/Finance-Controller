import { NextRequest, NextResponse } from 'next/server'

import { accountRoute, readJsonBody } from '@/server/modules/accounts/http/route'
import { reorderAccountsSchema } from '@/server/modules/accounts/http/schemas'
import { getAccountsService } from '@/server/modules/accounts/service'

export async function POST(request: NextRequest) {
  return accountRoute(async ({ userId }) => {
    const body = reorderAccountsSchema.parse(await readJsonBody(request))
    await getAccountsService().reorderAccounts(userId, body.ids)
    return NextResponse.json({ ok: true })
  })
}
