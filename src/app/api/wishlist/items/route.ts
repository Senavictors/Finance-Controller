import { NextRequest, NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/server/auth'
import { createWishlistItemSchema, wishlistItemQuerySchema } from '@/server/modules/finance/http'
import {
  createWishlistItem,
  listWishlistItems,
} from '@/server/modules/finance/application/wishlist'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const query = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = wishlistItemQuerySchema.safeParse(query)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
    }

    const items = await listWishlistItems(userId, parsed.data)
    return NextResponse.json({ data: items })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const body = await request.json()
    const parsed = createWishlistItemSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const item = await createWishlistItem(parsed.data, userId)
    return NextResponse.json({ data: item }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    if (error instanceof Error && error.message === 'Categoria de desejos nao encontrada') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
