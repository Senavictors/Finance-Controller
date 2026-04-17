import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { createGoalSchema, goalQuerySchema } from '@/server/modules/finance/http/schemas'
import { createGoal, listGoalsWithProgress } from '@/server/modules/finance/application/goals'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth()
    const query = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = goalQuerySchema.safeParse(query)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
    }

    const goals = await listGoalsWithProgress(userId, parsed.data.month)
    return NextResponse.json({ data: goals })
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
    const parsed = createGoalSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const goal = await createGoal(parsed.data, userId)
    return NextResponse.json({ data: goal }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
