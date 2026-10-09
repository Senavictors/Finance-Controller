import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthError } from '@/server/auth/errors'
import {
  OTHER_USER,
  USER,
  makeAccountsEnv,
  type AccountsEnv,
} from '@/server/modules/accounts/application/test-helpers'

// Sem banco nem sessão real: `requireAuth` e os serviços ligados ao Prisma são substituídos
// por versões em memória (ledger e contas compartilham o mesmo repositório do ledger).
const state = vi.hoisted(() => ({ userId: null as string | null, env: null as unknown }))
const env = () => state.env as AccountsEnv

vi.mock('@/server/auth', () => ({
  requireAuth: async () => {
    if (!state.userId) throw new (await import('@/server/auth/errors')).AuthError()
    return { userId: state.userId, sessionId: 's1' }
  },
  AuthError,
}))
vi.mock('@/server/modules/accounts/service', () => ({
  getAccountsService: () => env().svc,
}))
vi.mock('@/server/modules/ledger/infra/ledger-service', () => ({
  getLedgerService: () => env().ledgerSvc,
}))

const { GET, POST } = await import('./route')
const { GET: GET_ONE, PATCH, DELETE } = await import('./[id]/route')
const { POST: ARCHIVE } = await import('./[id]/archive/route')
const { POST: UNARCHIVE } = await import('./[id]/unarchive/route')
const { POST: REORDER } = await import('./reorder/route')
const { POST: POST_TXN } = await import('../transactions/route')

const base = 'http://localhost/api/accounts'
const req = (method: string, body?: unknown, url = base) =>
  new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
// Corpo JSON das respostas, acessado por caminho nos asserts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const checking = { name: 'Conta Exemplo', type: 'CHECKING' as const, overdraftLimit: 100000 }

async function create(body: Record<string, unknown> = checking) {
  const response = await POST(req('POST', body))
  return { response, json: (await response.json()) as Json }
}

beforeEach(() => {
  state.env = makeAccountsEnv()
  state.userId = USER
})

describe('autenticação (CA-09)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    state.userId = null
    const responses = await Promise.all([
      GET(req('GET')),
      POST(req('POST', checking)),
      GET_ONE(req('GET'), ctx('x')),
      PATCH(req('PATCH', { name: 'x' }), ctx('x')),
      DELETE(req('DELETE'), ctx('x')),
      ARCHIVE(req('POST'), ctx('x')),
      UNARCHIVE(req('POST'), ctx('x')),
      REORDER(req('POST', { ids: ['x'] })),
    ])
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(401))
    expect(await responses[0]!.json()).toEqual({ error: 'Não autorizado', code: 'UNAUTHORIZED' })
  })
})

describe('POST /api/accounts', () => {
  it('CA-01: cria com saldo inicial e GET devolve o uso do cheque especial', async () => {
    const { response, json } = await create({ ...checking, openingBalance: -20000 })
    expect(response.status).toBe(201)
    expect(json.account.balance.cleared).toBe(-20000)

    const list = (await (await GET(req('GET'))).json()) as Json
    expect(list.accounts[0].usage).toEqual({
      kind: 'OVERDRAFT',
      limit: 100000,
      used: 20000,
      available: 80000,
      excess: 0,
    })
    expect(list.totals).toEqual({ cash: -20000, investments: 0, cardDebt: 0 })
    const txns = env().repo.txnsOf(json.account.id)
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({ kind: 'ADJUSTMENT', amount: -20000, status: 'CLEARED' })
  })

  it('CA-02: cartão sem limite/fechamento e com vencimento 32 -> 400 com mensagens por campo', async () => {
    const { response, json } = await create({
      name: 'Cartão Exemplo',
      type: 'CREDIT_CARD',
      dueDay: 32,
    })
    expect(response.status).toBe(400)
    expect(json.code).toBe('VALIDATION_FAILED')
    expect(Object.keys(json.details).sort()).toEqual(['closingDay', 'creditLimit', 'dueDay'])
    expect(json.details.creditLimit[0]).toMatch(/limite/i)
    expect(env().accounts.rows.size).toBe(0)
  })

  it('CA-02: conta corrente com creditLimit -> 400', async () => {
    const { response, json } = await create({ ...checking, creditLimit: 100000 })
    expect(response.status).toBe(400)
    expect(json.details.creditLimit).toBeDefined()
  })

  it('CA-03: emissor inexistente -> 400; emissor do registry é aceito', async () => {
    expect((await create({ ...checking, issuerKey: 'inexistente' })).response.status).toBe(400)
    const { response, json } = await create({ ...checking, issuerKey: 'nubank' })
    expect(response.status).toBe(201)
    expect(json.account.issuerKey).toBe('nubank')
  })

  it('CA-04: nome repetido (caixa e espaços) -> 409 ACCOUNT_NAME_TAKEN', async () => {
    await create()
    const { response, json } = await create({ ...checking, name: 'conta exemplo ' })
    expect(response.status).toBe(409)
    expect(json).toEqual({
      error: 'Já existe uma conta com esse nome.',
      code: 'ACCOUNT_NAME_TAKEN',
    })
  })

  it('corpo inválido: 400 sem vazar detalhes; campo desconhecido é recusado', async () => {
    const bad = new NextRequest(base, { method: 'POST', body: '{nope' })
    const response = await POST(bad)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_JSON' })
    expect((await create({ ...checking, initialBalance: 1000 })).response.status).toBe(400)
  })

  it('openingDate aceita YYYY-MM-DD estrito', async () => {
    expect(
      (await create({ ...checking, openingBalance: 100, openingDate: '2026-02-30' })).response
        .status,
    ).toBe(400)
    const { response } = await create({
      ...checking,
      openingBalance: 100,
      openingDate: '2026-09-30',
    })
    expect(response.status).toBe(201)
  })
})

describe('GET/PATCH/DELETE /api/accounts/[id]', () => {
  it('CA-09: id de outro usuário -> 404 em todas as rotas', async () => {
    const theirs = (await env().svc.createAccount(OTHER_USER, checking)).account
    const responses = await Promise.all([
      GET_ONE(req('GET'), ctx(theirs.id)),
      PATCH(req('PATCH', { name: 'Invadida' }), ctx(theirs.id)),
      DELETE(req('DELETE'), ctx(theirs.id)),
      ARCHIVE(req('POST'), ctx(theirs.id)),
      UNARCHIVE(req('POST'), ctx(theirs.id)),
    ])
    expect(responses.map((r) => r.status)).toEqual(Array(5).fill(404))
    expect(await responses[0]!.json()).toEqual({
      error: 'Conta não encontrada.',
      code: 'ACCOUNT_NOT_FOUND',
    })
    expect((await (await GET(req('GET'))).json()).accounts).toEqual([])
  })

  it('PATCH renomeia; patch vazio é 400', async () => {
    const { json } = await create()
    const id = json.account.id as string
    const ok = await PATCH(req('PATCH', { name: 'Conta Principal' }), ctx(id))
    expect(ok.status).toBe(200)
    expect((await ok.json()).account.name).toBe('Conta Principal')
    expect((await PATCH(req('PATCH', {}), ctx(id))).status).toBe(400)
  })

  it('CA-07: PATCH trocando o tipo de conta com lançamentos -> 409 ACCOUNT_TYPE_LOCKED', async () => {
    const { json } = await create({ ...checking, openingBalance: 10000 })
    const id = json.account.id as string
    await env().ledgerSvc.createTransaction(env().ctx, {
      accountId: id,
      kind: 'EXPENSE',
      amount: 1000,
      date: new Date('2026-10-03T12:00:00.000Z'),
      description: 'Mercado Exemplo',
    })
    const response = await PATCH(req('PATCH', { type: 'SAVINGS' }), ctx(id))
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('ACCOUNT_TYPE_LOCKED')
  })

  it('CA-06: DELETE com lançamentos -> 409; recém-criada -> 200 e some tudo', async () => {
    const used = (await create({ ...checking, openingBalance: 10000 })).json.account.id as string
    await env().ledgerSvc.createTransaction(env().ctx, {
      accountId: used,
      kind: 'EXPENSE',
      amount: 1000,
      date: new Date('2026-10-03T12:00:00.000Z'),
      description: 'Mercado Exemplo',
    })
    const blocked = await DELETE(req('DELETE'), ctx(used))
    expect(blocked.status).toBe(409)
    expect((await blocked.json()).code).toBe('ACCOUNT_HAS_TRANSACTIONS')

    const fresh = (await create({ ...checking, name: 'Conta Nova', openingBalance: 5000 })).json
      .account.id as string
    const deleted = await DELETE(req('DELETE'), ctx(fresh))
    expect(deleted.status).toBe(200)
    expect(env().repo.txnsOf(fresh)).toEqual([])
    expect(env().repo.balances.has(fresh)).toBe(false)
    expect(env().accounts.rows.has(fresh)).toBe(false)
  })
})

describe('arquivar (CA-05)', () => {
  it('avisa saldo, some da lista, aparece com includeArchived e o ledger recusa lançamento comum', async () => {
    const id = (await create({ ...checking, openingBalance: 12345 })).json.account.id as string
    const archived = await ARCHIVE(req('POST'), ctx(id))
    expect(archived.status).toBe(200)
    expect((await archived.json()).warnings).toEqual(['ARCHIVED_WITH_BALANCE'])

    expect((await (await GET(req('GET'))).json()).accounts).toEqual([])
    const all = await GET(req('GET', undefined, `${base}?includeArchived=true`))
    expect((await all.json()).accounts.map((a: { id: string }) => a.id)).toEqual([id])

    const txn = await POST_TXN(
      req(
        'POST',
        {
          accountId: id,
          kind: 'EXPENSE',
          amount: 100,
          date: '2026-10-03',
          description: 'Mercado Exemplo',
        },
        'http://localhost/api/transactions',
      ),
    )
    expect(txn.status).toBe(409)
    expect((await txn.json()).code).toBe('LEDGER_ACCOUNT_ARCHIVED')

    const reopened = await UNARCHIVE(req('POST'), ctx(id))
    expect((await reopened.json()).account.isArchived).toBe(false)
  })

  it('query inválida em GET /api/accounts -> 400', async () => {
    const response = await GET(req('GET', undefined, `${base}?includeArchived=talvez`))
    expect(response.status).toBe(400)
  })
})

describe('POST /api/accounts/reorder', () => {
  it('reordena e rejeita ids de outro usuário', async () => {
    const a = (await create({ ...checking, name: 'A' })).json.account.id as string
    const b = (await create({ ...checking, name: 'B' })).json.account.id as string
    expect((await REORDER(req('POST', { ids: [b, a] }))).status).toBe(200)
    const list = await (await GET(req('GET'))).json()
    expect(list.accounts.map((x: { id: string }) => x.id)).toEqual([b, a])

    const theirs = (await env().svc.createAccount(OTHER_USER, { ...checking, name: 'Alheia' }))
      .account
    expect((await REORDER(req('POST', { ids: [theirs.id] }))).status).toBe(404)
    expect((await REORDER(req('POST', { ids: [] }))).status).toBe(400)
  })
})

describe('erros inesperados', () => {
  it('500 genérico, sem stack nem mensagem interna', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(env().accounts, 'listByUser').mockRejectedValue(new Error('segredo interno do banco'))
    const response = await GET(req('GET'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    })
  })
})
