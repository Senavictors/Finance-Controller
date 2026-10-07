import { describe, expect, it, vi } from 'vitest'

import { fakeCategoryRepository } from '../../../tests/helpers/category-fakes'
import { ensureDefaultCategories } from '../modules/categories/application/ensure-default-categories'
import { createOwner, type OwnerRepository } from './owner'

const PASSWORD = 'uma-senha-longa-123'
const input = {
  email: 'dono@example.com',
  name: 'Dono',
  password: PASSWORD,
  confirmation: PASSWORD,
}

function fakeRepo(): OwnerRepository {
  let users = 0
  return {
    countUsers: async () => users,
    createUserWithSettings: async () => {
      users++
      return { id: 'u1' }
    },
    findOnlyUser: async () => null,
    replacePasswordAndRevokeAccess: async () => {},
  }
}

describe('createOwner + categorias padrão (FC2-F1-07, CA-08)', () => {
  it('cria o dono e em seguida as 80 categorias padrão para o id criado', async () => {
    const categories = fakeCategoryRepository()
    const result = await createOwner(
      {
        repo: fakeRepo(),
        hashPassword: async () => 'hash',
        onOwnerCreated: (userId) => ensureDefaultCategories(userId, { categories }),
      },
      input,
    )
    expect(result).toEqual({
      ok: true,
      email: 'dono@example.com',
      categories: { created: 80, existing: 0 },
    })
    expect(categories.rows).toHaveLength(80)
    expect(categories.rows.every((row) => row.userId === 'u1')).toBe(true)
  })

  it('sem o gancho o comportamento da F0-06 não muda', async () => {
    const result = await createOwner({ repo: fakeRepo(), hashPassword: async () => 'hash' }, input)
    expect(result).toEqual({ ok: true, email: 'dono@example.com' })
  })

  it('não chama o gancho quando a criação é recusada', async () => {
    const onOwnerCreated = vi.fn(async () => ({ created: 0, existing: 0 }))
    const repo = fakeRepo()
    await repo.createUserWithSettings({ email: 'a@example.com', name: 'A', passwordHash: 'h' })
    const result = await createOwner(
      { repo, hashPassword: async () => 'hash', onOwnerCreated },
      input,
    )
    expect(result.ok).toBe(false)
    expect(onOwnerCreated).not.toHaveBeenCalled()
  })

  it('falha do gancho vira erro claro que aponta o seed idempotente', async () => {
    await expect(
      createOwner(
        {
          repo: fakeRepo(),
          hashPassword: async () => 'hash',
          onOwnerCreated: async () => {
            throw new Error('banco indisponível')
          },
        },
        input,
      ),
    ).rejects.toThrow(/Dono criado.*banco indisponível.*seed:categories/)
  })
})
