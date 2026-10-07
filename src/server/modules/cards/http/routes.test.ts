import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCardsService } from '../application/cards-service'
import { makeCardsEnv, type CardsEnv } from '../application/test-helpers'

// Sessão e wiring Prisma são mockados: as rotas rodam de verdade (Zod -> use-case -> JSON)
// sobre os repositórios em memória, sem banco.
const state: { env: CardsEnv; userId: string | null } = {
  env: undefined as unknown as CardsEnv,
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

vi.mock('@/server/modules/cards/infra/cards-service', () => ({
  getCardsService: () => createCardsService(state.env.deps),
}))

const purchases = await import('@/app/api/cards/[accountId]/purchases/route')
const cardStatements = await import('@/app/api/cards/[accountId]/statements/route')
const cardSummary = await import('@/app/api/cards/[accountId]/summary/route')
const statementDetail = await import('@/app/api/statements/[id]/route')
const statementPayments = await import('@/app/api/statements/[id]/payments/route')
const moveStatement = await import('@/app/api/transactions/[id]/move-statement/route')
const refund = await import('@/app/api/transactions/[id]/refund/route')
const advance = await import('@/app/api/purchases/[id]/advance/route')
const purchaseById = await import('@/app/api/purchases/[id]/route')

function json(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })

beforeEach(() => {
  state.env = makeCardsEnv()
  state.userId = 'user-1'
})

async function buy(amount = 60_000, installmentCount = 3) {
  const response = await purchases.POST(
    json('/api/cards/card/purchases', 'POST', {
      amount,
      installmentCount,
      date: '2026-10-05',
      description: 'Compra sintetica',
    }),
    params({ accountId: 'card' }),
  )
  return { response, body: await response.json() }
}

describe('rotas de cartões', () => {
  it('sem sessão => 401 em todas as rotas', async () => {
    state.userId = null
    const responses = [
      await purchases.POST(json('/x', 'POST', {}), params({ accountId: 'card' })),
      await cardStatements.GET(json('/x', 'GET'), params({ accountId: 'card' })),
      await cardSummary.GET(json('/x', 'GET'), params({ accountId: 'card' })),
      await statementDetail.GET(json('/x', 'GET'), params({ id: 's' })),
      await statementPayments.POST(json('/x', 'POST', {}), params({ id: 's' })),
      await moveStatement.POST(json('/x', 'POST', {}), params({ id: 't' })),
      await refund.POST(json('/x', 'POST', {}), params({ id: 't' })),
      await advance.POST(json('/x', 'POST', {}), params({ id: 'p' })),
      await purchaseById.DELETE(json('/x', 'DELETE'), params({ id: 'p' })),
    ]
    for (const response of responses) {
      expect(response.status).toBe(401)
      expect((await response.json()).code).toBe('UNAUTHORIZED')
    }
  })

  it('POST purchases: 201 com parcelas, faturas e posição; datas YYYY-MM-DD', async () => {
    const { response, body } = await buy()
    expect(response.status).toBe(201)
    expect(body.purchase).toMatchObject({
      totalAmount: 60_000,
      installmentCount: 3,
      purchaseDate: '2026-10-05',
    })
    expect(body.installments.map((i: { date: string }) => i.date)).toEqual([
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
    ])
    expect(body.statements.map((s: { statementKey: string }) => s.statementKey)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ])
    expect(body.transactions[0]).not.toHaveProperty('userId')
    expect(body.position.usage.used).toBe(60_000)
  })

  it('POST purchases: validação 400, cartão inexistente 404, corpo inválido 400', async () => {
    const bad = await purchases.POST(
      json('/x', 'POST', { amount: 0, date: '2026-10-05', description: 'x' }),
      params({ accountId: 'card' }),
    )
    expect(bad.status).toBe(400)
    expect((await bad.json()).code).toBe('VALIDATION_FAILED')

    const missing = await purchases.POST(
      json('/x', 'POST', { amount: 100, date: '2026-10-05', description: 'x' }),
      params({ accountId: 'nao-existe' }),
    )
    expect(missing.status).toBe(404)
    expect((await missing.json()).code).toBe('CARD_NOT_FOUND')

    const notJson = await purchases.POST(
      new NextRequest('http://localhost/x', { method: 'POST', body: '{nope' }),
      params({ accountId: 'card' }),
    )
    expect(notJson.status).toBe(400)
    expect((await notJson.json()).code).toBe('INVALID_JSON')

    const tooSmall = await purchases.POST(
      json('/x', 'POST', { amount: 2, installmentCount: 3, date: '2026-10-05', description: 'x' }),
      params({ accountId: 'card' }),
    )
    expect(tooSmall.status).toBe(400)
    expect((await tooSmall.json()).code).toBe('INSTALLMENT_TOO_SMALL')
  })

  it('GET statements e summary', async () => {
    await buy()
    const list = await cardStatements.GET(json('/x', 'GET'), params({ accountId: 'card' }))
    expect(list.status).toBe(200)
    expect(
      (await list.json()).statements.map((s: { statementKey: string }) => s.statementKey),
    ).toEqual(['2026-12', '2026-11', '2026-10'])

    const summary = await cardSummary.GET(json('/x', 'GET'), params({ accountId: 'card' }))
    expect(summary.status).toBe(200)
    expect(await summary.json()).toMatchObject({
      limit: 500_000,
      used: 60_000,
      currentStatementKey: '2026-10',
    })
  })

  it('GET statements/[id]: detalhe; de outro usuário => 404', async () => {
    const { body } = await buy()
    const statementId = body.statements[0].id
    const detail = await statementDetail.GET(json('/x', 'GET'), params({ id: statementId }))
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({
      statement: { statementKey: '2026-10', open: 20_000 },
      totals: { charges: 20_000, open: 20_000 },
      card: { id: 'card' },
    })
    state.userId = 'user-2'
    const other = await statementDetail.GET(json('/x', 'GET'), params({ id: statementId }))
    expect(other.status).toBe(404)
  })

  it('POST payments: 201; acima do aberto => 409 com details.open; origem cartão => 400', async () => {
    await state.env.fund('chk', 100_000)
    const { body } = await buy()
    const statementId = body.statements[0].id
    state.env.setNow('2026-10-12')

    const over = await statementPayments.POST(
      json('/x', 'POST', { sourceAccountId: 'chk', amount: 20_001, date: '2026-10-12' }),
      params({ id: statementId }),
    )
    expect(over.status).toBe(409)
    expect(await over.json()).toMatchObject({
      code: 'STATEMENT_OVERPAYMENT',
      details: { open: 20_000 },
    })

    const fromCard = await statementPayments.POST(
      json('/x', 'POST', { sourceAccountId: 'card2', amount: 100, date: '2026-10-12' }),
      params({ id: statementId }),
    )
    expect(fromCard.status).toBe(400)
    expect((await fromCard.json()).code).toBe('INVALID_PAYMENT_SOURCE')

    const ok = await statementPayments.POST(
      json('/x', 'POST', { sourceAccountId: 'chk', amount: 20_000, date: '2026-10-12' }),
      params({ id: statementId }),
    )
    expect(ok.status).toBe(201)
    expect(await ok.json()).toMatchObject({
      statement: { status: 'PAID', open: 0, paid: 20_000 },
      overdraftWarning: { willUseOverdraft: false },
    })

    const again = await statementPayments.POST(
      json('/x', 'POST', { sourceAccountId: 'chk', amount: 100, date: '2026-10-12' }),
      params({ id: statementId }),
    )
    expect(again.status).toBe(409)
    expect((await again.json()).code).toBe('STATEMENT_ALREADY_PAID')
  })

  it('POST refund: 201 e abate a fatura; acima do estornável => 400', async () => {
    const { body } = await buy(50_000, 1)
    const txnId = body.transactions[0].id
    const ok = await refund.POST(
      json('/x', 'POST', { amount: 12_000, date: '2026-10-05' }),
      params({ id: txnId }),
    )
    expect(ok.status).toBe(201)
    expect(await ok.json()).toMatchObject({
      transaction: { kind: 'INCOME', amount: 12_000, refundOfId: txnId },
      statement: { total: 38_000, open: 38_000 },
      refundableRemaining: 38_000,
    })
    const over = await refund.POST(
      json('/x', 'POST', { amount: 38_001, date: '2026-10-05' }),
      params({ id: txnId }),
    )
    expect(over.status).toBe(400)
    expect((await over.json()).code).toBe('REFUND_EXCEEDS_ORIGINAL')
  })

  it('POST move-statement: 200 e trava o vínculo; fatura fora da janela => 400', async () => {
    const { body } = await buy(30_000, 1)
    const txnId = body.transactions[0].id
    const ok = await moveStatement.POST(
      json('/x', 'POST', { targetStatementKey: '2026-11' }),
      params({ id: txnId }),
    )
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({
      transaction: { statementKey: '2026-11', date: '2026-10-05', userLocked: { statement: true } },
      from: { statementKey: '2026-10', total: 0 },
      to: { statementKey: '2026-11', total: 30_000 },
    })
    const far = await moveStatement.POST(
      json('/x', 'POST', { targetStatementKey: '2027-09' }),
      params({ id: txnId }),
    )
    expect(far.status).toBe(400)
    expect((await far.json()).code).toBe('STATEMENT_TARGET_OUT_OF_RANGE')
    const invalid = await moveStatement.POST(json('/x', 'POST', {}), params({ id: txnId }))
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).code).toBe('VALIDATION_FAILED')
  })

  it('POST advance e DELETE purchases', async () => {
    const { body } = await buy()
    state.env.setNow('2026-10-06')
    const advanced = await advance.POST(
      json('/x', 'POST', { installmentNumbers: [2, 3], date: '2026-10-06', discountAmount: 2_000 }),
      params({ id: body.purchase.id }),
    )
    expect(advanced.status).toBe(201)
    expect(await advanced.json()).toMatchObject({
      advance: {
        totalOriginalAmount: 40_000,
        totalPaidAmount: 38_000,
        totalDiscountAmount: 2_000,
        advancedAt: '2026-10-06',
      },
      discountTransaction: { kind: 'INCOME', amount: 2_000 },
    })

    const removed = await purchaseById.DELETE(
      json('/x', 'DELETE'),
      params({ id: body.purchase.id }),
    )
    expect(removed.status).toBe(200)
    expect((await removed.json()).deletedTransactionIds).toHaveLength(4)
    const gone = await purchaseById.DELETE(json('/x', 'DELETE'), params({ id: body.purchase.id }))
    expect(gone.status).toBe(404)
    expect((await gone.json()).code).toBe('PURCHASE_NOT_FOUND')
  })
})
