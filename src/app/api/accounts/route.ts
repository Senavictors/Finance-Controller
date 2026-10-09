import { NextRequest, NextResponse } from 'next/server'

import { accountRoute, readJsonBody } from '@/server/modules/accounts/http/route'
import {
  createAccountSchema,
  listAccountsQuerySchema,
} from '@/server/modules/accounts/http/schemas'
import { getAccountsService } from '@/server/modules/accounts/service'

export async function GET(request: NextRequest) {
  return accountRoute(async ({ userId }) => {
    const query = listAccountsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const result = await getAccountsService().listAccounts(userId, query)
    return NextResponse.json(result)
  })
}

export async function POST(request: NextRequest) {
  return accountRoute(async ({ userId }) => {
    const body = createAccountSchema.parse(await readJsonBody(request))
    const result = await getAccountsService().createAccount(userId, body)
    return NextResponse.json(result, { status: 201 })
  })
}
