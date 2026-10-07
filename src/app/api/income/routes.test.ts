import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeIncomeEnv, type IncomeEnv } from '@/server/modules/income/application/test-helpers'

// Sessão e wiring Prisma mockados: as rotas rodam de verdade (Zod -> use-case -> JSON) sobre
// os repositórios em memória, sem banco.
const state: { env: IncomeEnv; userId: string | null } = {
  env: undefined as unknown as IncomeEnv,
  userId: 'user-1',
}

vi.mock('@/server/auth', () => {
  class AuthError extends Error {
    constructor() {
      super('Unauthorized')
      this.name = 'AuthError'
    }
  }
  return {
    AuthError,
    requireAuth: async () => {
      if (!state.userId) throw new AuthError()
      return { userId: state.userId, sessionId: 's1' }
    },
  }
})

vi.mock('@/server/modules/income/infra/income-service', () => ({
  getIncomeService: () => state.env.income,
}))

const rules = await import('./rules/route')
const ruleById = await import('./rules/[id]/route')
const attendance = await import('./rules/[id]/attendance/route')
const projection = await import('./projection/route')
const materialize = await import('./materialize/route')
const confirm = await import('../transactions/[id]/confirm-income/route')
const meiProfile = await import('../mei/profile/route')
const meiStatus = await import('../mei/status/route')

function req(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}
const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

const RULE_BODY = {
  name: 'Renda mensal',
  baseCents: 300_000,
  perDayCents: 4_000,
  weekdays: [2, 3, 4],
  payDay: 15,
  destinationAccountId: 'pj',
  startDate: '2026-01-01',
}

beforeEach(() => {
  state.env = makeIncomeEnv()
  state.userId = 'user-1'
})

async function createRule(over: Record<string, unknown> = {}) {
  const res = await rules.POST(req('/api/income/rules', 'POST', { ...RULE_BODY, ...over }))
  return { res, body: await res.json() }
}

describe('autenticação', () => {
  it('sem sessão => 401 em todas as rotas', async () => {
    state.userId = null
    expect((await rules.GET(req('/api/income/rules', 'GET'))).status).toBe(401)
    expect((await rules.POST(req('/api/income/rules', 'POST', RULE_BODY))).status).toBe(401)
    expect((await meiProfile.GET()).status).toBe(401)
    expect((await meiStatus.GET(req('/api/mei/status', 'GET'))).status).toBe(401)
    expect((await materialize.POST(req('/api/income/materialize', 'POST', {}))).status).toBe(401)
  })
})

describe('POST /api/income/rules (CA-14)', () => {
  it('cria a regra (201) e já devolve o resumo dos previstos', async () => {
    const { res, body } = await createRule()
    expect(res.status).toBe(201)
    expect(body.rule).toMatchObject({
      name: 'Renda mensal',
      baseCents: 300_000,
      weekdays: [2, 3, 4],
      startDate: '2026-01-01',
      endDate: null,
      isActive: true,
    })
    expect(body.planned.created).toBe(3)
    expect(body.warnings).toEqual([])
  })

  it.each([
    ['weekdays=[7]', { weekdays: [7] }],
    ['payDay=0', { payDay: 0 }],
    ['payDay=32', { payDay: 32 }],
    ['baseCents negativo', { baseCents: -1 }],
    ['data inexistente', { startDate: '2026-02-30' }],
    ['campo desconhecido', { owner: 'x' }],
  ])('%s => 400', async (_label, patch) => {
    const { res, body } = await createRule(patch)
    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION_FAILED')
  })

  it('conta de outro usuário => 404; conta não-BUSINESS => 201 com aviso', async () => {
    const other = await createRule({ destinationAccountId: 'other' })
    expect(other.res.status).toBe(404)
    expect(other.body.code).toBe('INCOME_ACCOUNT_NOT_FOUND')

    const pf = await createRule({ destinationAccountId: 'pf' })
    expect(pf.res.status).toBe(201)
    expect(pf.body.warnings.map((w: { code: string }) => w.code)).toEqual([
      'INCOME_ACCOUNT_NOT_BUSINESS',
    ])
  })

  it('JSON inválido => 400 INVALID_JSON', async () => {
    const request = new NextRequest('http://localhost/api/income/rules', {
      method: 'POST',
      body: '{nao-json',
    })
    const res = await rules.POST(request)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_JSON')
  })

  it('erro do ledger propaga com o código (conta arquivada => 409)', async () => {
    const { res, body } = await createRule({ destinationAccountId: 'old' })
    expect(res.status).toBe(409)
    expect(body.code).toBe('LEDGER_ACCOUNT_ARCHIVED')
  })
})

describe('regras: GET, PATCH, DELETE, attendance', () => {
  it('ciclo completo', async () => {
    const { body: created } = await createRule()
    const id = created.rule.id as string

    const list = await (await rules.GET(req('/api/income/rules', 'GET'))).json()
    expect(list.items).toHaveLength(1)

    const patched = await ruleById.PATCH(
      req(`/api/income/rules/${id}`, 'PATCH', { perDayCents: 5_000 }),
      idParams(id),
    )
    expect(patched.status).toBe(200)
    expect((await patched.json()).planned.updated).toBe(3)

    const empty = await ruleById.PATCH(req(`/api/income/rules/${id}`, 'PATCH', {}), idParams(id))
    expect(empty.status).toBe(400)

    const att = await attendance.POST(
      req(`/api/income/rules/${id}/attendance`, 'POST', { date: '2026-10-13', present: false }),
      idParams(id),
    )
    expect(att.status).toBe(200)
    expect((await att.json()).rule.attendanceOverrides).toEqual({ '2026-10-13': false })

    const got = await ruleById.GET(req(`/api/income/rules/${id}`, 'GET'), idParams(id))
    expect((await got.json()).rule.perDayCents).toBe(5_000)

    const del = await ruleById.DELETE(req(`/api/income/rules/${id}`, 'DELETE'), idParams(id))
    expect(del.status).toBe(200)
    const after = await (await del.json()).rule
    expect(after.isActive).toBe(false)
  })

  it('regra inexistente => 404', async () => {
    const res = await ruleById.PATCH(
      req('/api/income/rules/nada', 'PATCH', { baseCents: 1 }),
      idParams('nada'),
    )
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('INCOME_RULE_NOT_FOUND')
  })
})

describe('projeção, materialização e confirmação', () => {
  it('projeção por período com componentes', async () => {
    await createRule()
    const res = await projection.GET(
      req('/api/income/projection?from=2026-10-01&to=2026-12-31', 'GET'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events).toHaveLength(3)
    expect(body.events[1]).toMatchObject({
      paymentDate: '2026-11-16',
      baseCents: 300_000,
      additionalCents: 52_000,
      presentialDays: 13,
      totalCents: 352_000,
    })
    expect(body.expectedCents).toBe(356_000 + 352_000 + 348_000)
    const invalid = await projection.GET(req('/api/income/projection?from=2026-10-01', 'GET'))
    expect(invalid.status).toBe(400)
  })

  it('materialize é idempotente e inclui o DAS quando há perfil', async () => {
    await createRule()
    const noProfile = await (
      await materialize.POST(req('/api/income/materialize', 'POST', {}))
    ).json()
    expect(noProfile.income).toMatchObject({ created: 0, unchanged: 3 })
    expect(noProfile.das).toBeNull()

    await meiProfile.PUT(
      req('/api/mei/profile', 'PUT', { dasAmountCents: 8_000, dasAccountId: 'pj' }),
    )
    const withProfile = await (
      await materialize.POST(req('/api/income/materialize', 'POST', { until: '2027-01-31' }))
    ).json()
    expect(withProfile.das.created).toBe(1) // 20/01/2027 (os de out-dez já existiam)
    expect(withProfile.income.until).toBe('2027-01-31')
  })

  it('confirm-income: "Recebi" com valor real; reconfirmar => 409', async () => {
    await createRule()
    await meiProfile.PUT(
      req('/api/mei/profile', 'PUT', {
        openedAt: '2026-03-10',
        dasAmountCents: 8_000,
        dasAccountId: 'pj',
      }),
    )
    const [first] = (
      await state.env.svc.listTransactions(state.env.ctx, {
        occurrenceKeyPrefix: 'income:',
      })
    ).items.sort((a, b) => a.date.getTime() - b.date.getTime())
    const res = await confirm.POST(
      req(`/api/transactions/${first!.id}/confirm-income`, 'POST', {
        receivedAmount: 340_000,
        receivedDate: '2026-10-16',
      }),
      idParams(first!.id),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transaction).toMatchObject({ status: 'CLEARED' })
    expect(body.planned).toEqual({ amountCents: 356_000, date: '2026-10-15' })
    expect(body.differenceCents).toBe(-16_000)

    const again = await confirm.POST(
      req(`/api/transactions/${first!.id}/confirm-income`, 'POST', {}),
      idParams(first!.id),
    )
    expect(again.status).toBe(409)
    expect((await again.json()).code).toBe('INCOME_NOT_PLANNED_INCOME')

    const status = await (await meiStatus.GET(req('/api/mei/status', 'GET'))).json()
    expect(status).toMatchObject({
      year: 2026,
      ceilingCents: 6_750_000,
      accumulatedCents: 340_000,
      level: 'OK',
      message: null,
    })
  })
})

describe('MEI: perfil e status', () => {
  it('sem perfil: GET devolve null; status => 404', async () => {
    const profile = await (await meiProfile.GET()).json()
    expect(profile.profile).toBeNull()
    const res = await meiStatus.GET(req('/api/mei/status', 'GET'))
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('MEI_PROFILE_NOT_FOUND')
  })

  it('PUT grava com padrões; valida o corpo e as contas; status por ano', async () => {
    const put = await meiProfile.PUT(
      req('/api/mei/profile', 'PUT', {
        openedAt: '2026-10-31',
        dasAmountCents: 8_000,
        dasAccountId: 'pf',
      }),
    )
    expect(put.status).toBe(200)
    expect((await put.json()).profile).toEqual({
      openedAt: '2026-10-31',
      annualCeilingCents: 8_100_000,
      dasAmountCents: 8_000,
      dasDueDay: 20,
      dasAccountId: 'pf',
      businessAccountId: null,
    })

    const invalid = await meiProfile.PUT(req('/api/mei/profile', 'PUT', { dasAmountCents: -5 }))
    expect(invalid.status).toBe(400)
    const foreign = await meiProfile.PUT(
      req('/api/mei/profile', 'PUT', { dasAmountCents: 1, dasAccountId: 'other' }),
    )
    expect(foreign.status).toBe(404)

    const status = await (await meiStatus.GET(req('/api/mei/status?year=2026', 'GET'))).json()
    expect(status.ceilingCents).toBe(2_025_000) // aberto em outubro: 3 meses
    const badYear = await meiStatus.GET(req('/api/mei/status?year=abc', 'GET'))
    expect(badYear.status).toBe(400)
  })
})
