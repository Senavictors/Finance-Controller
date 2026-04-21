import { NextRequest, NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/server/auth'
import { purchaseWishlistItemSchema } from '@/server/modules/finance/http'
import { purchaseWishlistItem } from '@/server/modules/finance/application/wishlist'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = purchaseWishlistItemSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const result = await purchaseWishlistItem(id, parsed.data, userId)
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    if (
      error instanceof Error &&
      [
        'Item da wishlist nao encontrado',
        'Conta nao encontrada',
        'Categoria financeira nao encontrada',
        'Item ja foi comprado',
        'Itens cancelados nao podem ser comprados',
      ].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status:
            error.message === 'Item da wishlist nao encontrado'
              ? 404
              : error.message === 'Item ja foi comprado'
                ? 409
                : 400,
        },
      )
    }

    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
