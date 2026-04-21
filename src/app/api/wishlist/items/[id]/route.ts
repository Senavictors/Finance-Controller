import { NextRequest, NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/server/auth'
import { updateWishlistItemSchema } from '@/server/modules/finance/http'
import {
  deleteWishlistItem,
  updateWishlistItem,
} from '@/server/modules/finance/application/wishlist'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = updateWishlistItemSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const item = await updateWishlistItem(id, parsed.data, userId)
    return NextResponse.json({ data: item })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    if (
      error instanceof Error &&
      ['Item da wishlist nao encontrado', 'Categoria de desejos nao encontrada'].includes(
        error.message,
      )
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'Item da wishlist nao encontrado' ? 404 : 400 },
      )
    }

    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params

    await deleteWishlistItem(id, userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    if (error instanceof Error && error.message === 'Item da wishlist nao encontrado') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
