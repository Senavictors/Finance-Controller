import { describe, expect, it, vi } from 'vitest'
import { FIXED_NOW_ISO, fixedNow, withFakeTime } from './clock'

describe('fuso e relógio da suíte', () => {
  it('roda com TZ=America/Sao_Paulo', () => {
    expect(process.env.TZ).toBe('America/Sao_Paulo')
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Sao_Paulo')
  })

  it('o fuso é efetivo: meio-dia UTC vira 09:00 em São Paulo', () => {
    expect(new Date('2026-10-05T12:00:00.000Z').getHours()).toBe(9)
  })

  it('fixedNow() devolve 2026-10-05T12:00:00.000Z e um novo Date a cada chamada', () => {
    expect(fixedNow().toISOString()).toBe('2026-10-05T12:00:00.000Z')
    expect(FIXED_NOW_ISO).toBe('2026-10-05T12:00:00.000Z')
    expect(fixedNow()).not.toBe(fixedNow())
  })

  it('fixedNow rejeita data inválida', () => {
    expect(() => fixedNow('nao-e-data')).toThrow()
  })

  it('withFakeTime congela Date.now() e restaura o relógio real', async () => {
    const result = await withFakeTime(() => {
      expect(vi.isFakeTimers()).toBe(true)
      return Date.now()
    })
    expect(result).toBe(Date.parse('2026-10-05T12:00:00.000Z'))
    expect(vi.isFakeTimers()).toBe(false)
  })

  it('withFakeTime restaura o relógio mesmo quando a função lança', async () => {
    await expect(
      withFakeTime(() => {
        throw new Error('falha')
      }),
    ).rejects.toThrow('falha')
    expect(vi.isFakeTimers()).toBe(false)
  })
})
