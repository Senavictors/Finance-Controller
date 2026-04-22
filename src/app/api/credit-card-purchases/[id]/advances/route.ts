import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { createCreditCardInstallmentAdvanceSchema } from '@/server/modules/finance/http'
import { advanceCreditCardPurchaseInstallments } from '@/server/modules/finance/application/credit-card-purchases'

type Params = { params: Promise<{ id: string }> }

const expectedErrors = [
  'Compra parcelada nao encontrada',
  'Parcela invalida para este adiantamento',
  'Uma ou mais parcelas selecionadas ja foram adiantadas',
  'So e possivel adiantar parcelas futuras',
] as const

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const parsed = createCreditCardInstallmentAdvanceSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const result = await advanceCreditCardPurchaseInstallments(id, parsed.data, userId)

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (
      error instanceof Error &&
      expectedErrors.includes(error.message as (typeof expectedErrors)[number])
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'Compra parcelada nao encontrada' ? 404 : 400 },
      )
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
