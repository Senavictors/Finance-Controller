import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/server/auth'
import { createCategory } from '@/server/modules/categories/application/create-category'
import { listCategoryTree } from '@/server/modules/categories/application/list-category-tree'
import { categoryErrorResponse } from '@/server/modules/categories/http/error-response'
import {
  createCategorySchema,
  listCategoriesQuerySchema,
} from '@/server/modules/categories/http/schemas'
import { prismaCategoryRepository } from '@/server/modules/categories/infra/default-repository'

const deps = { categories: prismaCategoryRepository }

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()

    const query = listCategoriesQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    )
    if (!query.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const categories = await listCategoryTree(userId, query.data, deps)
    return NextResponse.json({ categories })
  } catch (error) {
    return categoryErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const parsed = createCategorySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const category = await createCategory(userId, parsed.data, deps)
    return NextResponse.json({ category }, { status: 201 })
  } catch (error) {
    return categoryErrorResponse(error)
  }
}
