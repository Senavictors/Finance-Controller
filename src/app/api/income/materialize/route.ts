import { NextRequest, NextResponse } from 'next/server'
import { getIncomeService } from '@/server/modules/income/infra/income-service'
import { incomeRoute, readOptionalJsonBody } from '@/server/modules/income/http/route'
import { materializeSchema } from '@/server/modules/income/http/schemas'
import { toMaterializeDto } from '@/server/modules/income/http/dto'

/**
 * Materializa os previstos de renda (e do DAS, se houver perfil do MEI) até `until` (padrão:
 * hoje + 90 dias). Idempotente. O job diário chamará os mesmos use-cases (`docs/domain/renda-mei.md`).
 */
export async function POST(request: NextRequest) {
  return incomeRoute(async ({ userId }) => {
    const body = materializeSchema.parse(await readOptionalJsonBody(request))
    const service = getIncomeService()
    const income = await service.materializeIncome({ userId }, { until: body.until })
    const profile = await service.getMeiProfile({ userId })
    const das = profile ? await service.materializeDas({ userId }, { until: body.until }) : null
    return NextResponse.json(toMaterializeDto(income, das))
  })
}
