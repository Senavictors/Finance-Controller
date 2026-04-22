import { NextResponse } from 'next/server'
import { requireAuth, AuthError } from '@/server/auth'
import { getCreditCardPurchaseDetail } from '@/server/modules/finance/application/credit-card-purchases'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const { userId } = await requireAuth()
    const { id } = await params

    const purchase = await getCreditCardPurchaseDetail(id, userId)

    return NextResponse.json({ data: purchase })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (error instanceof Error && error.message === 'Compra parcelada nao encontrada') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
