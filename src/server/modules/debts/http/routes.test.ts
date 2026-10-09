import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDebtsEnv, seedBalance, type DebtsEnv } from '../application/test-helpers'
import { createLoanSchema, payInstallmentSchema, updateLoanSchema } from './schemas'

// Sessão e wiring Prisma são mockados: as rotas rodam de verdade (Zod -> use-case -> JSON) sobre
// o ledger e o repositório de dívidas em memória, sem banco.
const state: { env: DebtsEnv; userId: string | null } = {
  env: undefined as unknown as DebtsEnv,
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

vi.mock('@/server/modules/debts/infra/default-deps', () => ({
  getDebtsDeps: () => state.env.deps,
}))

const collection = await import('@/app/api/debts/route')
const summaryRoute = await import('@/app/api/debts/summary/route')
const overdraftRoute = await import('@/app/api/debts/overdraft-cost/route')
const itemRoute = await import('@/app/api/debts/[id]/route')
const simulateRoute = await import('@/app/api/debts/[id]/simulate/route')
const payRoute = await import('@/app/api/debts/[id]/installments/[number]/pay/route')

const BASE = 'http://localhost/api/debts'
const req = (method: string, path = '', body?: unknown) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  })
const ctx = <T extends object>(params: T) => ({ params: Promise.resolve(params) })

const consignado = {
  kind: 'CONSIGNADO',
  name: 'Consignado fictício',
  accountId: 'acc-a',
  principalCents: 1_000_000,
  installmentAmountCents: 94_560,
  installmentCount: 12,
  firstDueDate: '2026-10-01',
}

beforeEach(() => {
  state.env = makeDebtsEnv()
  state.userId = 'user-1'
})

describe('autenticação e validação', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    state.userId = null
    expect((await collection.GET(req('GET'))).status).toBe(401)
    expect((await collection.POST(req('POST', '', consignado))).status).toBe(401)
    expect((await summaryRoute.GET(req('GET', '/summary'))).status).toBe(401)
    expect((await itemRoute.GET(req('GET', '/x'), ctx({ id: 'x' }))).status).toBe(401)
    expect((await itemRoute.DELETE(req('DELETE', '/x'), ctx({ id: 'x' }))).status).toBe(401)
    expect(
      (await payRoute.POST(req('POST', '/x/installments/1/pay', {}), ctx({ id: 'x', number: '1' })))
        .status,
    ).toBe(401)
  })

  it('corpo inválido: JSON quebrado e campos fora do contrato viram 400', async () => {
    const broken = new NextRequest(BASE, {
      method: 'POST',
      body: '{nope',
      headers: { 'content-type': 'application/json' },
    })
    const brokenResponse = await collection.POST(broken)
    expect(brokenResponse.status).toBe(400)
    expect((await brokenResponse.json()).code).toBe('DEBT_INVALID_INPUT')

    const extra = await collection.POST(req('POST', '', { ...consignado, userId: 'outro' }))
    expect(extra.status).toBe(400)
    expect((await extra.json()).code).toBe('VALIDATION_FAILED')
  })

  it('schemas: taxa fora da faixa, centavos fracionados, data inexistente e documento no nome', () => {
    const ok = createLoanSchema.safeParse(consignado)
    expect(ok.success).toBe(true)
    expect(createLoanSchema.safeParse({ ...consignado, monthlyRate: 0.5 }).success).toBe(false)
    expect(createLoanSchema.safeParse({ ...consignado, principalCents: 10.5 }).success).toBe(false)
    expect(createLoanSchema.safeParse({ ...consignado, firstDueDate: '2026-02-30' }).success).toBe(
      false,
    )
    expect(createLoanSchema.safeParse({ ...consignado, kind: 'FINANCIAMENTO' }).success).toBe(false)
    expect(
      createLoanSchema.safeParse({ ...consignado, lenderName: 'Credor 1.1.1.1.1.1.1.1.1.1.1' })
        .success,
    ).toBe(false)
    expect(createLoanSchema.safeParse({ ...consignado, lenderName: 'Credor 12345' }).success).toBe(
      true,
    )
    expect(
      payInstallmentSchema.safeParse({ payDate: '2026-10-11', accountId: 'a', amountPaid: 0 })
        .success,
    ).toBe(false)
    expect(updateLoanSchema.safeParse({ status: 'PAID_OFF' }).success).toBe(false)
    expect(updateLoanSchema.safeParse({ archive: true }).success).toBe(true)
  })
})

describe('fluxo completo pela API', () => {
  it('cadastra, lista, detalha, paga, simula, resume e apaga', async () => {
    await seedBalance(state.env, 'acc-a', 500_000)

    const created = await collection.POST(req('POST', '', consignado))
    expect(created.status).toBe(201)
    const createdBody = await created.json()
    expect(createdBody.rateInferred).toBe(true)
    expect(createdBody.installmentCount).toBe(12)
    expect(createdBody.loan.userId).toBeUndefined()
    const id = createdBody.loan.id as string

    const cheque = await collection.POST(
      req('POST', '', {
        kind: 'OVERDRAFT',
        name: 'Cheque especial',
        accountId: 'acc-b',
        monthlyRate: 0.08,
      }),
    )
    expect(cheque.status).toBe(201)

    const list = await (await collection.GET(req('GET'))).json()
    expect(list.debts).toHaveLength(1)
    expect(list.debts[0]).toMatchObject({ kind: 'CONSIGNADO', outstanding: 1_000_000 })
    const withIdle = await (await collection.GET(req('GET', '?includeIdle=true'))).json()
    expect(withIdle.debts).toHaveLength(2)
    expect((await collection.GET(req('GET', '?includeIdle=talvez'))).status).toBe(400)

    const detail = await (await itemRoute.GET(req('GET', `/${id}`), ctx({ id }))).json()
    expect(detail.installments).toHaveLength(12)
    expect(detail.summary.id).toBe(id)

    const pay = await payRoute.POST(
      req('POST', `/${id}/installments/1/pay`, { payDate: '2026-10-11', accountId: 'acc-a' }),
      ctx({ id, number: '1' }),
    )
    expect(pay.status).toBe(201)
    const payment = (await pay.json()).payment
    expect(payment).toMatchObject({
      paidAmountCents: 96_766,
      lateChargesCents: 2206,
      outOfOrder: false,
    })

    const again = await payRoute.POST(
      req('POST', `/${id}/installments/1/pay`, { payDate: '2026-10-11', accountId: 'acc-a' }),
      ctx({ id, number: '1' }),
    )
    expect(again.status).toBe(409)
    expect((await again.json()).code).toBe('INSTALLMENT_ALREADY_PAID')

    const sim = await simulateRoute.GET(
      req('GET', `/${id}/simulate?extraMonthlyPayment=50000`),
      ctx({ id }),
    )
    expect(sim.status).toBe(200)
    const simulation = (await sim.json()).simulation
    expect(simulation.monthsSaved).toBeGreaterThan(0)
    expect(simulation.scenario.months).toBeLessThan(simulation.baseline.months)

    const patched = await itemRoute.PATCH(
      req('PATCH', `/${id}`, { name: 'Renomeado' }),
      ctx({ id }),
    )
    expect((await patched.json()).loan.name).toBe('Renomeado')

    const summary = await (await summaryRoute.GET(req('GET', '/summary'))).json()
    expect(summary).toMatchObject({ debtCount: 1 })
    expect(summary.totalOutstanding).toBeGreaterThan(0)

    const blocked = await itemRoute.DELETE(req('DELETE', `/${id}`), ctx({ id }))
    expect(blocked.status).toBe(409)
    expect((await blocked.json()).code).toBe('DEBT_LOAN_HAS_PAID_INSTALLMENTS')

    const archived = await itemRoute.PATCH(req('PATCH', `/${id}`, { archive: true }), ctx({ id }))
    expect((await archived.json()).loan.status).toBe('PAID_OFF')

    const closed = await payRoute.POST(
      req('POST', `/${id}/installments/2/pay`, { payDate: '2026-10-11', accountId: 'acc-a' }),
      ctx({ id, number: '2' }),
    )
    expect(closed.status).toBe(409)
    expect((await closed.json()).code).toBe('DEBT_NOT_ACTIVE')
  })

  it('simulação "nunca quita" serializa months como null', async () => {
    const created = await (
      await collection.POST(
        req('POST', '', {
          kind: 'PERSONAL',
          name: 'Pessoal',
          principalCents: 1_000_000,
          monthlyRate: 0.1,
          installmentCount: 12,
          firstDueDate: '2026-11-05',
        }),
      )
    ).json()
    const id = created.loan.id as string
    // Taxa de 10% a.m. e parcela de R$ 1.466,... : o cenário normal quita; um loan sem parcela cobrindo os juros não.
    const loan = state.env.loans.loans.get(id)!
    state.env.loans.loans.set(id, { ...loan, installmentAmountCents: 1000 })
    const sim = (await (await simulateRoute.GET(req('GET', `/${id}/simulate`), ctx({ id }))).json())
      .simulation
    expect(sim.baseline.neverPaysOff).toBe(true)
    expect(sim.baseline.months).toBeNull()
    expect(sim.baseline.payoffDate).toBeNull()
  })

  it('custo do cheque especial no mês pela API', async () => {
    await seedBalance(state.env, 'acc-a', -50_000, '2026-01-10')
    await collection.POST(
      req('POST', '', {
        kind: 'OVERDRAFT',
        name: 'Cheque especial',
        accountId: 'acc-a',
        monthlyRate: 0.08,
      }),
    )
    const ok = await overdraftRoute.GET(req('GET', '/overdraft-cost?accountId=acc-a&month=2026-01'))
    expect(ok.status).toBe(200)
    expect((await ok.json()).estimate).toMatchObject({
      accountId: 'acc-a',
      month: '2026-01',
      isEstimate: true,
    })
    expect(
      (await overdraftRoute.GET(req('GET', '/overdraft-cost?accountId=acc-a&month=janeiro')))
        .status,
    ).toBe(400)
  })

  it('id de outro usuário ou inexistente: 404; parcela inexistente: 404', async () => {
    const created = await (await collection.POST(req('POST', '', consignado))).json()
    const id = created.loan.id as string
    state.userId = 'user-2'
    expect((await itemRoute.GET(req('GET', `/${id}`), ctx({ id }))).status).toBe(404)
    expect((await itemRoute.DELETE(req('DELETE', `/${id}`), ctx({ id }))).status).toBe(404)
    expect((await simulateRoute.GET(req('GET', `/${id}/simulate`), ctx({ id }))).status).toBe(404)
    expect((await (await collection.GET(req('GET'))).json()).debts).toEqual([])
    state.userId = 'user-1'
    const missing = await payRoute.POST(
      req('POST', `/${id}/installments/99/pay`, { payDate: '2026-10-11', accountId: 'acc-a' }),
      ctx({ id, number: '99' }),
    )
    expect(missing.status).toBe(404)
    const invalidNumber = await payRoute.POST(
      req('POST', `/${id}/installments/abc/pay`, { payDate: '2026-10-11', accountId: 'acc-a' }),
      ctx({ id, number: 'abc' }),
    )
    expect(invalidNumber.status).toBe(400)
  })

  it('erro do ledger propaga com o código dele (conta de outro usuário: 404)', async () => {
    const created = await (await collection.POST(req('POST', '', consignado))).json()
    const id = created.loan.id as string
    const response = await payRoute.POST(
      req('POST', `/${id}/installments/1/pay`, { payDate: '2026-10-11', accountId: 'acc-other' }),
      ctx({ id, number: '1' }),
    )
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('DEBT_ACCOUNT_NOT_FOUND')
  })
})
