import { NextRequest, NextResponse } from 'next/server'

import { accountRoute, readJsonBody } from '@/server/modules/accounts/http/route'
import { updateAccountSchema } from '@/server/modules/accounts/http/schemas'
import { getAccountsService } from '@/server/modules/accounts/service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  return accountRoute(async ({ userId }) => {
    const { id } = await context.params
    const account = await getAccountsService().getAccount(userId, id)
    return NextResponse.json({ account })
  })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return accountRoute(async ({ userId }) => {
    const { id } = await context.params
    const body = updateAccountSchema.parse(await readJsonBody(request))
    const result = await getAccountsService().updateAccount(userId, id, body)
    return NextResponse.json(result)
  })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return accountRoute(async ({ userId }) => {
    const { id } = await context.params
    await getAccountsService().deleteAccount(userId, id)
    return NextResponse.json({ ok: true })
  })
}
