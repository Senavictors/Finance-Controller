import { NextRequest, NextResponse } from 'next/server'
import { getIncomeService } from '@/server/modules/income/infra/income-service'
import { toRuleDto } from '@/server/modules/income/http/dto'
import { incomeRoute, readJsonBody } from '@/server/modules/income/http/route'
import { attendanceSchema } from '@/server/modules/income/http/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  return incomeRoute(async ({ userId }) => {
    const { id } = await params
    const body = attendanceSchema.parse(await readJsonBody(request))
    const result = await getIncomeService().setAttendanceOverride(
      { userId },
      { ruleId: id, date: body.date, present: body.present },
    )
    return NextResponse.json({ rule: toRuleDto(result.rule), planned: result.planned })
  })
}
