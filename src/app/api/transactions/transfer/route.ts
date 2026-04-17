import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { createTransferSchema } from '@/server/modules/finance/http'
import {
  ANALYTICS_MUTATION_MODULES,
  invalidateAnalyticsSnapshots,
} from '@/server/modules/finance/application/analytics'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const body = await request.json()
    const parsed = createTransferSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { sourceAccountId, destinationAccountId, amount, date, description, notes } = parsed.data

    const [sourceAccount, destAccount] = await Promise.all([
      prisma.account.findFirst({ where: { id: sourceAccountId, userId } }),
      prisma.account.findFirst({ where: { id: destinationAccountId, userId } }),
    ])

    if (!sourceAccount) {
      return NextResponse.json({ error: 'Conta de origem nao encontrada' }, { status: 400 })
    }
    if (!destAccount) {
      return NextResponse.json({ error: 'Conta de destino nao encontrada' }, { status: 400 })
    }

    const transferId = crypto.randomUUID()

    const [outgoing, incoming] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          accountId: sourceAccountId,
          type: 'TRANSFER',
          amount,
          date,
          description,
          notes,
          transferId,
        },
      }),
      prisma.transaction.create({
        data: {
          userId,
          accountId: destinationAccountId,
          type: 'TRANSFER',
          amount,
          date,
          description,
          notes,
          transferId,
        },
      }),
    ])

    await invalidateAnalyticsSnapshots({
      userId,
      modules: ANALYTICS_MUTATION_MODULES.transfer,
      dates: [outgoing.date, incoming.date],
      accountIds: [outgoing.accountId, incoming.accountId],
    })

    return NextResponse.json({ data: { outgoing, incoming, transferId } }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
