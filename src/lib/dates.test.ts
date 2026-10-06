import { describe, expect, it } from 'vitest'
import { localDateSchema } from './dates'

describe('lib/dates localDateSchema', () => {
  it('converte data válida para meio-dia UTC', () => {
    const result = localDateSchema().parse('2026-10-05')
    expect(result.toISOString()).toBe('2026-10-05T12:00:00.000Z')
  })

  it('rejeita formato inválido com a mensagem informada', () => {
    const result = localDateSchema('Data inválida').safeParse('05/10/2026')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Data inválida')
    }
  })

  it('não é estrito: 2026-02-30 é aceito e normalizado pelo JS para 2 de março (pendência F1-01)', () => {
    const result = localDateSchema().safeParse('2026-02-30')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.toISOString()).toBe('2026-03-02T12:00:00.000Z')
    }
  })
})
