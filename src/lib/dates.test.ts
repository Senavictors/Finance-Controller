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

  it('é estrito: data inexistente (2026-02-30) é rejeitada, não normalizada', () => {
    const result = localDateSchema('Data inválida').safeParse('2026-02-30')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Data inválida')
    }
  })

  it('aceita 29/02 só em ano bissexto e rejeita mês 13 e dia 00', () => {
    expect(localDateSchema().safeParse('2028-02-29').success).toBe(true)
    expect(localDateSchema().safeParse('2027-02-29').success).toBe(false)
    expect(localDateSchema().safeParse('2026-13-01').success).toBe(false)
    expect(localDateSchema().safeParse('2026-10-00').success).toBe(false)
  })
})
