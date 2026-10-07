import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createOwner,
  parseOwnerCommand,
  resetOwnerPassword,
  validateOwnerPassword,
  type OwnerRepository,
} from './owner'

const PASSWORD = 'uma-senha-longa-123'

function fakeRepo(initialUsers = 0) {
  const state = { users: initialUsers, created: [] as Array<{ email: string; name: string }> }
  const repo: OwnerRepository & { revoked: string[] } = {
    revoked: [],
    countUsers: async () => state.users,
    createUserWithSettings: async (data) => {
      state.users++
      state.created.push({ email: data.email, name: data.name })
      return { id: 'u1' }
    },
    findOnlyUser: async () => (state.users > 0 ? { id: 'u1', email: 'dono@example.com' } : null),
    replacePasswordAndRevokeAccess: async (userId) => {
      repo.revoked.push(userId)
    },
  }
  return { repo, state }
}

describe('owner (lógica do script)', () => {
  let hashPassword: ReturnType<typeof vi.fn<(plain: string) => Promise<string>>>

  beforeEach(() => {
    // restoreMocks (vitest.config) zera implementações: cria o mock a cada teste.
    hashPassword = vi.fn(async (plain: string) => `hash:${plain.length}`)
  })

  it('parseOwnerCommand', () => {
    expect(parseOwnerCommand([])).toBe('create')
    expect(parseOwnerCommand(['--reset-password'])).toBe('reset-password')
  })

  it('valida tamanho mínimo, máximo em bytes e confirmação', () => {
    expect(validateOwnerPassword('curta', 'curta')).toHaveLength(1)
    expect(validateOwnerPassword('a'.repeat(11), 'a'.repeat(11))).toHaveLength(1)
    expect(validateOwnerPassword('a'.repeat(12), 'a'.repeat(12))).toEqual([])
    expect(validateOwnerPassword('a'.repeat(72), 'a'.repeat(72))).toEqual([])
    expect(validateOwnerPassword('a'.repeat(73), 'a'.repeat(73))).toHaveLength(1)
    // 40 caracteres de 2 bytes = 80 bytes
    expect(validateOwnerPassword('é'.repeat(40), 'é'.repeat(40))).toHaveLength(1)
    expect(validateOwnerPassword(PASSWORD, 'outra-coisa-123')).toHaveLength(1)
  })

  it('cria o primeiro usuário (e-mail normalizado) com hash', async () => {
    const { repo, state } = fakeRepo()
    const result = await createOwner(
      { repo, hashPassword },
      { email: ' Dono@Example.com ', name: ' Dono ', password: PASSWORD, confirmation: PASSWORD },
    )
    expect(result).toEqual({ ok: true, email: 'dono@example.com' })
    expect(state.created).toEqual([{ email: 'dono@example.com', name: 'Dono' }])
    expect(hashPassword).toHaveBeenCalledWith(PASSWORD)
  })

  it('recusa o segundo usuário com mensagem clara', async () => {
    const { repo, state } = fakeRepo(1)
    const result = await createOwner(
      { repo, hashPassword },
      { email: 'outro@example.com', name: 'Outro', password: PASSWORD, confirmation: PASSWORD },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain('Já existe um usuário')
    expect(state.created).toHaveLength(0)
    expect(hashPassword).not.toHaveBeenCalled()
  })

  it('recusa senha curta e e-mail inválido sem tocar no banco', async () => {
    const { repo, state } = fakeRepo()
    const result = await createOwner(
      { repo, hashPassword },
      { email: 'invalido', name: '', password: 'curta', confirmation: 'curta' },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(3)
    expect(state.created).toHaveLength(0)
    expect(hashPassword).not.toHaveBeenCalled()
  })

  it('--reset-password troca a senha e encerra o acesso do único usuário', async () => {
    const { repo } = fakeRepo(1)
    const result = await resetOwnerPassword(
      { repo, hashPassword },
      { password: PASSWORD, confirmation: PASSWORD },
    )
    expect(result).toEqual({ ok: true, email: 'dono@example.com' })
    expect(repo.revoked).toEqual(['u1'])
  })

  it('--reset-password valida a senha e exige usuário existente', async () => {
    const empty = fakeRepo(0)
    const noUser = await resetOwnerPassword(
      { repo: empty.repo, hashPassword },
      { password: PASSWORD, confirmation: PASSWORD },
    )
    expect(noUser.ok).toBe(false)

    const withUser = fakeRepo(1)
    const weak = await resetOwnerPassword(
      { repo: withUser.repo, hashPassword },
      { password: 'curta', confirmation: 'curta' },
    )
    expect(weak.ok).toBe(false)
    expect(withUser.repo.revoked).toEqual([])
  })
})
