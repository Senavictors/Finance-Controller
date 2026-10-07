import { NextRequest, NextResponse } from 'next/server'
import { getIncomeService } from '@/server/modules/income/infra/income-service'
import { toProfileDto, toProfileResultDto } from '@/server/modules/income/http/dto'
import { incomeRoute, readJsonBody } from '@/server/modules/income/http/route'
import { meiProfileSchema } from '@/server/modules/income/http/schemas'

export async function GET() {
  return incomeRoute(async ({ userId }) => {
    const profile = await getIncomeService().getMeiProfile({ userId })
    return NextResponse.json({ profile: profile ? toProfileDto(profile) : null })
  })
}

export async function PUT(request: NextRequest) {
  return incomeRoute(async ({ userId }) => {
    const body = meiProfileSchema.parse(await readJsonBody(request))
    const result = await getIncomeService().upsertMeiProfile({ userId }, body)
    return NextResponse.json(toProfileResultDto(result))
  })
}
