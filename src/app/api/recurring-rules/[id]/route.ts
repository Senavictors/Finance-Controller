import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { updateRecurringRuleSchema } from '@/server/modules/finance/http'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = updateRecurringRuleSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const existing = await prisma.recurringRule.findFirst({ where: { id, userId } })
    if (!existing) {
      return NextResponse.json({ error: 'Regra nao encontrada' }, { status: 404 })
    }

    const rule = await prisma.recurringRule.update({
      where: { id },
      data: parsed.data,
    })

    return NextResponse.json({ data: rule })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params

    const existing = await prisma.recurringRule.findFirst({ where: { id, userId } })
    if (!existing) {
      return NextResponse.json({ error: 'Regra nao encontrada' }, { status: 404 })
    }

    await prisma.recurringRule.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
