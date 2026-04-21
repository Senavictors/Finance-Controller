import { NextRequest, NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/server/auth'
import { createWishlistCategorySchema } from '@/server/modules/finance/http'
import {
  createWishlistCategory,
  listWishlistCategories,
} from '@/server/modules/finance/application/wishlist'

export async function GET() {
  try {
    const { userId } = await requireAuth()
    const categories = await listWishlistCategories(userId)

    return NextResponse.json({ data: categories })
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
    const parsed = createWishlistCategorySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const category = await createWishlistCategory(parsed.data, userId)

    return NextResponse.json({ data: category }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    if (error instanceof Error && error.message === 'Categoria de desejos ja existe') {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
