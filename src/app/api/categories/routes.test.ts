import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthError } from '@/server/auth/errors'
import { fakeCategoryRepository } from '../../../../tests/helpers/category-fakes'
import { ensureDefaultCategories } from '@/server/modules/categories/application/ensure-default-categories'

// Sem banco nem sessão real: `requireAuth` e o repositório da aplicação são substituídos.
const state = vi.hoisted(() => ({
  userId: null as string | null,
  repo: null as unknown,
}))

vi.mock('@/server/auth', () => ({
  requireAuth: async () => {
    if (!state.userId) throw new (await import('@/server/auth/errors')).AuthError()
    return { userId: state.userId, sessionId: 's1' }
  },
  AuthError,
}))
vi.mock('@/server/modules/categories/infra/default-repository', () => ({
  get prismaCategoryRepository() {
    return state.repo
  },
}))

// O repositório é lido na importação das rotas: uma única instância, limpa a cada teste.
const repo = fakeCategoryRepository()
state.repo = repo

const { GET, POST } = await import('./route')
const { PATCH } = await import('./[id]/route')

const url = 'http://localhost/api/categories'
const json = (body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
const patch = (body: unknown) =>
  new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

beforeEach(async () => {
  repo.rows.length = 0
  state.userId = 'u1'
  await ensureDefaultCategories('u1', { categories: repo })
  await ensureDefaultCategories('u2', { categories: repo })
})

const idOf = (userId: string, key: string) =>
  repo.rows.find((row) => row.userId === userId && row.key === key)!.id

describe('GET /api/categories (CA-09)', () => {
  it('sem sessão -> 401', async () => {
    state.userId = null
    const response = await GET(new NextRequest(url))
    expect(response.status).toBe(401)
  })

  it('com sessão devolve a árvore com effectiveNature, só do usuário', async () => {
    const response = await GET(new NextRequest(url))
    expect(response.status).toBe(200)
    const { categories } = (await response.json()) as {
      categories: Array<{
        key: string
        effectiveNature: string | null
        children: Array<{ key: string; effectiveNature: string | null }>
      }>
    }
    expect(categories).toHaveLength(20)
    const mercado = categories.find((node) => node.key === 'mercado')!
    expect(mercado.effectiveNature).toBe('NEED')
    expect(mercado.children.find((child) => child.key === 'supermercado')?.effectiveNature).toBe(
      'NEED',
    )
    const flatIds = categories.flatMap((node) => [node, ...node.children]) as unknown as Array<{
      id: string
    }>
    const mine = new Set(repo.rows.filter((row) => row.userId === 'u1').map((row) => row.id))
    expect(flatIds.every((node) => mine.has(node.id))).toBe(true)
    expect(JSON.stringify(categories)).not.toContain('userId')
  })

  it('includeArchived inválido -> 400', async () => {
    const response = await GET(new NextRequest(`${url}?includeArchived=talvez`))
    expect(response.status).toBe(400)
  })
})

describe('PATCH /api/categories/[id]', () => {
  const call = (id: string, body: unknown) =>
    PATCH(patch(body), { params: Promise.resolve({ id }) })

  it('CA-06: arquivar categoria de sistema -> 409 CATEGORY_SYSTEM_LOCKED', async () => {
    const response = await call(idOf('u1', 'iof'), { isArchived: true })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'CATEGORY_SYSTEM_LOCKED' })
  })

  it('arquivar lazer -> 200 e some da árvore padrão', async () => {
    const response = await call(idOf('u1', 'lazer'), { isArchived: true })
    expect(response.status).toBe(200)
    const tree = (await (await GET(new NextRequest(url))).json()) as {
      categories: Array<{ key: string }>
    }
    expect(tree.categories.some((node) => node.key === 'lazer')).toBe(false)
  })

  it('sem sessão -> 401; id de outro usuário -> 404; corpo inválido -> 400', async () => {
    state.userId = null
    expect((await call(idOf('u1', 'lazer'), { name: 'X' })).status).toBe(401)
    state.userId = 'u1'
    expect((await call(idOf('u2', 'lazer'), { name: 'X' })).status).toBe(404)
    expect((await call(idOf('u1', 'lazer'), {})).status).toBe(400)
    expect((await call(idOf('u1', 'lazer'), { colorKey: '#ff0000' })).status).toBe(400)
    expect((await call(idOf('u1', 'lazer'), { userId: 'u2' })).status).toBe(400)
  })
})

describe('POST /api/categories', () => {
  it('cria e devolve 201; sem sessão 401; pai que é filho 422', async () => {
    const created = await POST(json({ name: 'Jogos de tabuleiro', parentId: idOf('u1', 'lazer') }))
    expect(created.status).toBe(201)
    expect(((await created.json()) as { category: { key: string } }).category.key).toBe(
      'custom-jogos-de-tabuleiro',
    )

    const deep = await POST(json({ name: 'Neto', parentId: idOf('u1', 'hobbies') }))
    expect(deep.status).toBe(422)
    expect(await deep.json()).toMatchObject({ code: 'CATEGORY_MAX_DEPTH' })

    state.userId = null
    expect((await POST(json({ name: 'X', type: 'INCOME' }))).status).toBe(401)
  })

  it('corpo inválido -> 400', async () => {
    expect((await POST(json({ name: '' }))).status).toBe(400)
    expect((await POST(json({ name: 'X', isSystem: true }))).status).toBe(400)
  })
})
