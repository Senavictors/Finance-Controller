import { NextRequest, NextResponse } from 'next/server'
import { getIncomeService } from '@/server/modules/income/infra/income-service'
import { toRuleDto } from '@/server/modules/income/http/dto'
import { incomeRoute, readJsonBody } from '@/server/modules/income/http/route'
import { updateIncomeRuleSchema } from '@/server/modules/income/http/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  return incomeRoute(async ({ userId }) => {
    const { id } = await params
    const rule = await getIncomeService().getIncomeRule({ userId }, id)
    return NextResponse.json({ rule: toRuleDto(rule) })
  })
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return incomeRoute(async ({ userId }) => {
    const { id } = await params
    const body = updateIncomeRuleSchema.parse(await readJsonBody(request))
    const result = await getIncomeService().updateIncomeRule({ userId }, id, body)
    return NextResponse.json({
      rule: toRuleDto(result.rule),
      warnings: result.warnings,
      planned: result.planned,
    })
  })
}

/** Arquiva a regra (`isActive = false`) e remove os previstos futuros; o histórico fica. */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  return incomeRoute(async ({ userId }) => {
    const { id } = await params
    const result = await getIncomeService().archiveIncomeRule({ userId }, id)
    return NextResponse.json({ rule: toRuleDto(result.rule), planned: result.planned })
  })
}
