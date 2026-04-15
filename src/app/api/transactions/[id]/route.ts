import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { requireAuth, AuthError } from '@/server/auth'
import { updateTransactionSchema } from '@/server/modules/finance/http'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = updateTransactionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const existing = await prisma.transaction.findFirst({ where: { id, userId } })
    if (!existing) {
      return NextResponse.json({ error: 'Transacao nao encontrada' }, { status: 404 })
    }

    if (existing.transferId) {
      return NextResponse.json(
        { error: 'Transferencias nao podem ser editadas diretamente' },
        { status: 400 },
      )
    }

    const { accountId, categoryId, ...data } = parsed.data

    if (accountId) {
      const account = await prisma.account.findFirst({ where: { id: accountId, userId } })
      if (!account) {
        return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 400 })
      }
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, userId } })
      if (!category) {
        return NextResponse.json({ error: 'Categoria nao encontrada' }, { status: 400 })
      }
    }

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...data,
        ...(accountId ? { accountId } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
      },
    })

    return NextResponse.json({ data: transaction })
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

    const existing = await prisma.transaction.findFirst({ where: { id, userId } })
    if (!existing) {
      return NextResponse.json({ error: 'Transacao nao encontrada' }, { status: 404 })
    }

    if (existing.transferId) {
      await prisma.transaction.deleteMany({
        where: { transferId: existing.transferId, userId },
      })
    } else {
      await prisma.transaction.delete({ where: { id } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
