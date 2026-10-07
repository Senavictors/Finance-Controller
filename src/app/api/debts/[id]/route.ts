import { NextRequest, NextResponse } from 'next/server'
import { getDebtDetail } from '@/server/modules/debts/application/list-debts'
import { archiveLoan, deleteLoan, updateLoan } from '@/server/modules/debts/application/manage-loan'
import { toLoanDto } from '@/server/modules/debts/http/dto'
import { debtsRoute, readJsonBody } from '@/server/modules/debts/http/route'
import { updateLoanSchema } from '@/server/modules/debts/http/schemas'
import { getDebtsDeps } from '@/server/modules/debts/infra/default-deps'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  return debtsRoute(async ({ userId, now }) => {
    const { id } = await params
    const detail = await getDebtDetail(userId, id, { now }, getDebtsDeps())
    return NextResponse.json({
      loan: toLoanDto(detail.loan),
      summary: detail.summary,
      installments: detail.installments,
    })
  })
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return debtsRoute(async ({ userId }) => {
    const { id } = await params
    const { archive, ...patch } = updateLoanSchema.parse(await readJsonBody(request))
    const deps = getDebtsDeps()
    let loan = await updateLoan(userId, id, patch, deps)
    if (archive) loan = await archiveLoan(userId, id, deps)
    return NextResponse.json({ loan: toLoanDto(loan) })
  })
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  return debtsRoute(async ({ userId }) => {
    const { id } = await params
    await deleteLoan(userId, id, getDebtsDeps())
    return NextResponse.json({ deleted: true })
  })
}
