import { NextRequest, NextResponse } from 'next/server'

import { accountRoute } from '@/server/modules/accounts/http/route'
import { getAccountsService } from '@/server/modules/accounts/service'

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return accountRoute(async ({ userId }) => {
    const { id } = await context.params
    const result = await getAccountsService().archiveAccount(userId, id)
    return NextResponse.json(result)
  })
}
