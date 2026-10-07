import { describe, expect, it } from 'vitest'

import { loginSchema } from './schemas'

describe('loginSchema', () => {
  it('normaliza o e-mail (trim + minúsculas)', () => {
    const parsed = loginSchema.parse({ email: '  Dono@Example.COM ', password: 'x' })
    expect(parsed.email).toBe('dono@example.com')
  })

  it('mensagens em pt-BR para ausente, vazio e e-mail inválido', () => {
    const missing = loginSchema.safeParse({})
    expect(missing.success).toBe(false)
    if (!missing.success) {
      const errors = missing.error.flatten().fieldErrors
      expect(errors.email?.[0]).toBe('Informe o e-mail')
      expect(errors.password?.[0]).toBe('Informe a senha')
    }

    const invalid = loginSchema.safeParse({ email: 'nao-e-email', password: '' })
    expect(invalid.success).toBe(false)
    if (!invalid.success) {
      const errors = invalid.error.flatten().fieldErrors
      expect(errors.email?.[0]).toBe('E-mail inválido')
      expect(errors.password?.[0]).toBe('Informe a senha')
    }
  })

  it('rejeita senha gigante', () => {
    expect(
      loginSchema.safeParse({ email: 'dono@example.com', password: 'x'.repeat(201) }).success,
    ).toBe(false)
  })
})
