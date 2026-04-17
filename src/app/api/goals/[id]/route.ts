import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { updateGoalSchema, goalQuerySchema } from '@/server/modules/finance/http/schemas'
import {
  updateGoal,
  archiveGoal,
  calculateGoalProgress,
} from '@/server/modules/finance/application/goals'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const query = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = goalQuerySchema.safeParse(query)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
    }

    const progress = await calculateGoalProgress(id, userId, parsed.data.month)
    return NextResponse.json({ data: progress })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Meta nao encontrada') {
      return NextResponse.json({ error: 'Meta nao encontrada' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = updateGoalSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const goal = await updateGoal(id, parsed.data, userId)
    return NextResponse.json({ data: goal })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Meta nao encontrada') {
      return NextResponse.json({ error: 'Meta nao encontrada' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params

    await archiveGoal(id, userId)
    return NextResponse.json({ data: { archived: true } })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Meta nao encontrada') {
      return NextResponse.json({ error: 'Meta nao encontrada' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
