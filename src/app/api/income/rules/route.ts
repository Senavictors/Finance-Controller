import { NextRequest, NextResponse } from 'next/server'
import { getIncomeService } from '@/server/modules/income/infra/income-service'
import { toRuleDto } from '@/server/modules/income/http/dto'
import { incomeRoute, readJsonBody } from '@/server/modules/income/http/route'
import { createIncomeRuleSchema } from '@/server/modules/income/http/schemas'

export async function GET(request: NextRequest) {
  return incomeRoute(async ({ userId }) => {
    const activeOnly = request.nextUrl.searchParams.get('active') === 'true'
    const rules = await getIncomeService().listIncomeRules({ userId }, { activeOnly })
    return NextResponse.json({ items: rules.map(toRuleDto) })
  })
}

export async function POST(request: NextRequest) {
  return incomeRoute(async ({ userId }) => {
    const body = createIncomeRuleSchema.parse(await readJsonBody(request))
    const result = await getIncomeService().createIncomeRule({ userId }, body)
    return NextResponse.json(
      { rule: toRuleDto(result.rule), warnings: result.warnings, planned: result.planned },
      { status: 201 },
    )
  })
}
