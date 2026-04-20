import { describe, expect, it } from 'vitest'
import { createAccountSchema, updateAccountSchema } from './schemas'

describe('finance/http schemas - account', () => {
  it('aceita cartao de credito com emissor, bandeira e icones nulos opcionais', () => {
    const parsed = createAccountSchema.safeParse({
      name: 'Cartao Itau',
      type: 'CREDIT_CARD',
      initialBalance: 0,
      creditLimit: 250_000,
      statementClosingDay: 8,
      statementDueDay: 15,
      color: '#FF6200',
      icon: 'itau',
      networkBrandKey: 'mastercard',
    })

    expect(parsed.success).toBe(true)
  })

  it('mantem a validacao de billing obrigatorio para cartao de credito', () => {
    const parsed = createAccountSchema.safeParse({
      name: 'Cartao sem fechamento',
      type: 'CREDIT_CARD',
      initialBalance: 0,
      creditLimit: 250_000,
      statementDueDay: 15,
      icon: null,
      networkBrandKey: null,
    })

    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.flatten().fieldErrors.statementClosingDay).toContain(
      'Dia de fechamento obrigatorio para cartao de credito',
    )
  })

  it('aceita limpar emissor e bandeira em updates parciais', () => {
    const parsed = updateAccountSchema.safeParse({
      icon: null,
      networkBrandKey: null,
    })

    expect(parsed.success).toBe(true)
  })
})
