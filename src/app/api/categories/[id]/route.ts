import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/server/auth'
import { updateCategory } from '@/server/modules/categories/application/update-category'
import { categoryErrorResponse } from '@/server/modules/categories/http/error-response'
import { updateCategorySchema } from '@/server/modules/categories/http/schemas'
import { prismaCategoryRepository } from '@/server/modules/categories/infra/default-repository'

const deps = { categories: prismaCategoryRepository }

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAuth()
    const { id } = await context.params

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const parsed = updateCategorySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const category = await updateCategory(userId, id, parsed.data, deps)
    return NextResponse.json({ category })
  } catch (error) {
    return categoryErrorResponse(error)
  }
}
