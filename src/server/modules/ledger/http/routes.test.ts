import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError, z } from 'zod'
import { LedgerError } from '../domain/types'
import { createLedgerService } from '../application/ledger-service'
import { makeLedgerEnv, type LedgerEnv } from '../application/test-helpers'
import { mapErrorToHttp } from './error-response'

// Sessão e wiring Prisma são mockados: as rotas rodam de verdade (Zod -> use-case -> JSON)
// sobre o repositório em memória, sem banco.
const state: { env: LedgerEnv; userId: string | null } = {
  env: undefined as unknown as LedgerEnv,
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

vi.mock('@/server/modules/ledger/infra/ledger-service', () => ({
  getLedgerService: () => createLedgerService(state.env.deps),
}))

const transactions = await import('@/app/api/transactions/route')
const transactionById = await import('@/app/api/transactions/[id]/route')
const transactionStatus = await import('@/app/api/transactions/[id]/status/route')
const transfers = await import('@/app/api/transfers/route')

function json(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}
const idParams = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  state.env = makeLedgerEnv()
  state.userId = 'user-1'
})

describe('rotas do ledger', () => {
  it('sem sessão => 401 em todas as rotas', async () => {
    state.userId = null
    const responses = [
      await transactions.GET(json('/api/transactions', 'GET')),
      await transactions.POST(json('/api/transactions', 'POST', {})),
      await transactionById.PATCH(json('/api/transactions/x', 'PATCH', {}), idParams('x')),
      await transactionById.DELETE(json('/api/transactions/x', 'DELETE'), idParams('x')),
      await transactionStatus.POST(json('/api/transactions/x/status', 'POST', {}), idParams('x')),
      await transfers.POST(json('/api/transfers', 'POST', {})),
    ]
    for (const response of responses) {
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    }
  })

  it('POST /api/transactions: cria despesa em módulo, devolve sinal aplicado, posição e aviso', async () => {
    const response = await transactions.POST(
      json('/api/transactions', 'POST', {
        accountId: 'acc-a',
        kind: 'EXPENSE',
        amount: 30000,
        date: '2026-10-05',
        description: 'Compra',
      }),
    )
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.transaction).toMatchObject({ amount: -30000, date: '2026-10-05', kind: 'EXPENSE' })
    expect(body.transaction).not.toHaveProperty('userId')
    expect(body.position.current).toBe(-30000)
    expect(body.warnings).toEqual([{ code: 'OVERDRAFT_USED', accountId: 'acc-a' }])
  })

  it('400 de validação com detalhes; JSON inválido => 400 INVALID_JSON', async () => {
    const invalid = await transactions.POST(json('/api/transactions', 'POST', { amount: -5 }))
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).code).toBe('VALIDATION_FAILED')

    const broken = await transactions.POST(
      new NextRequest('http://localhost/api/transactions', { method: 'POST', body: '{nope' }),
    )
    expect(broken.status).toBe(400)
    expect((await broken.json()).code).toBe('INVALID_JSON')
  })

  it('404 para conta de outro usuário e para lançamento inexistente', async () => {
    const account = await transactions.POST(
      json('/api/transactions', 'POST', {
        accountId: 'acc-other',
        kind: 'EXPENSE',
        amount: 100,
        date: '2026-10-05',
        description: 'x',
      }),
    )
    expect(account.status).toBe(404)
    expect((await account.json()).code).toBe('LEDGER_ACCOUNT_NOT_FOUND')

    const missing = await transactionById.DELETE(
      json('/api/transactions/nope', 'DELETE'),
      idParams('nope'),
    )
    expect(missing.status).toBe(404)
    expect((await missing.json()).code).toBe('LEDGER_TXN_NOT_FOUND')
  })

  it('fluxo: transferir, editar valor (PATCH), mudar status e apagar; 409 em conciliado', async () => {
    const created = await transfers.POST(
      json('/api/transfers', 'POST', {
        sourceAccountId: 'acc-a',
        destinationAccountId: 'acc-b',
        amount: 10000,
        date: '2026-10-05',
        description: 'Entre contas',
      }),
    )
    expect(created.status).toBe(201)
    const transfer = await created.json()
    expect(transfer.outgoing.amount).toBe(-10000)
    expect(transfer.incoming.amount).toBe(10000)
    expect(transfer.outgoing.transferId).toBe(transfer.incoming.transferId)

    const patched = await transactionById.PATCH(
      json(`/api/transactions/${transfer.incoming.id}`, 'PATCH', { amount: 15000 }),
      idParams(transfer.incoming.id),
    )
    expect(patched.status).toBe(200)
    const patchedBody = await patched.json()
    expect(patchedBody.transaction.amount).toBe(15000)
    expect(patchedBody.counterpart.amount).toBe(-15000)

    const accountChange = await transactionById.PATCH(
      json(`/api/transactions/${transfer.outgoing.id}`, 'PATCH', { accountId: 'acc-sav' }),
      idParams(transfer.outgoing.id),
    )
    expect(accountChange.status).toBe(409)
    expect((await accountChange.json()).code).toBe('LEDGER_TRANSFER_ACCOUNT_IMMUTABLE')

    const reconcile = await transactionStatus.POST(
      json(`/api/transactions/${transfer.outgoing.id}/status`, 'POST', { status: 'RECONCILED' }),
      idParams(transfer.outgoing.id),
    )
    expect(reconcile.status).toBe(200)
    const locked = await transactionStatus.POST(
      json(`/api/transactions/${transfer.outgoing.id}/status`, 'POST', { status: 'CLEARED' }),
      idParams(transfer.outgoing.id),
    )
    expect(locked.status).toBe(409)
    expect((await locked.json()).code).toBe('LEDGER_RECONCILED_LOCKED')

    const remove = await transactionById.DELETE(
      json(`/api/transactions/${transfer.incoming.id}`, 'DELETE'),
      idParams(transfer.incoming.id),
    )
    expect(remove.status).toBe(409)
  })

  it('GET /api/transactions: filtros, paginação por cursor e isolamento por usuário', async () => {
    for (let i = 1; i <= 3; i++) {
      await transactions.POST(
        json('/api/transactions', 'POST', {
          accountId: 'acc-a',
          kind: 'EXPENSE',
          amount: i * 100,
          date: `2026-10-0${i}`,
          description: `Item ${i}`,
        }),
      )
    }
    const first = await (await transactions.GET(json('/api/transactions?limit=2', 'GET'))).json()
    expect(first.items.map((t: { description: string }) => t.description)).toEqual([
      'Item 3',
      'Item 2',
    ])
    const second = await (
      await transactions.GET(json(`/api/transactions?limit=2&cursor=${first.nextCursor}`, 'GET'))
    ).json()
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeNull()

    const bad = await transactions.GET(json('/api/transactions?limit=abc', 'GET'))
    expect(bad.status).toBe(400)

    state.userId = 'user-2'
    const other = await (await transactions.GET(json('/api/transactions', 'GET'))).json()
    expect(other.items).toEqual([])
  })
})

describe('mapErrorToHttp', () => {
  it('mapeia categorias para 400/404/409 e esconde erros desconhecidos', () => {
    expect(mapErrorToHttp(new LedgerError('LEDGER_INVALID_SIGN', 'x')).status).toBe(400)
    expect(mapErrorToHttp(new LedgerError('LEDGER_TXN_NOT_FOUND', 'x')).status).toBe(404)
    expect(mapErrorToHttp(new LedgerError('LEDGER_RECONCILED_LOCKED', 'x')).status).toBe(409)
    expect(mapErrorToHttp(new LedgerError('LEDGER_CONCURRENT_UPDATE', 'x'))).toEqual({
      status: 409,
      body: { error: 'x', code: 'LEDGER_CONCURRENT_UPDATE' },
    })
    const unknown = mapErrorToHttp(new Error('segredo do banco: postgres://...'))
    expect(unknown).toEqual({
      status: 500,
      body: { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    })
  })

  it('Zod vira 400 com detalhes por campo', () => {
    const result = z.object({ a: z.number() }).safeParse({ a: 'x' })
    const mapped = mapErrorToHttp(result.error as ZodError)
    expect(mapped.status).toBe(400)
    expect(mapped.body.details?.a).toBeDefined()
  })
})
