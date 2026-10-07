import { beforeEach, describe, expect, it } from 'vitest'

import { createClock, FakeLoginAttemptRepository } from '../../../tests/helpers/auth-fakes'
import {
  checkLoginAllowed,
  loginRateLimitKey,
  purgeOldAttempts,
  recordLoginFailure,
  recordLoginSuccess,
  reserveLoginAttempt,
} from './rate-limit'

const MIN = 60 * 1000

describe('rate-limit persistido', () => {
  let attempts: FakeLoginAttemptRepository
  let clock: ReturnType<typeof createClock>
  let deps: { attempts: FakeLoginAttemptRepository; now: () => Date }
  const key = loginRateLimitKey('203.0.113.7', 'dono@example.com')

  beforeEach(() => {
    attempts = new FakeLoginAttemptRepository()
    clock = createClock(new Date('2026-10-05T12:00:00.000Z'))
    deps = { attempts, now: clock.now }
  })

  async function fail(times: number, gapMs = 1000) {
    for (let i = 0; i < times; i++) {
      await recordLoginFailure(deps, key)
      clock.advanceMs(gapMs)
    }
  }

  it('a chave é um SHA-256 em hex, estável e sem IP/e-mail em claro', () => {
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain('203.0.113.7')
    expect(loginRateLimitKey('203.0.113.7', ' Dono@Example.com ')).toBe(key)
    expect(loginRateLimitKey('203.0.113.8', 'dono@example.com')).not.toBe(key)
  })

  it('4 falhas ainda permitem; a 5ª bloqueia', async () => {
    await fail(4)
    expect(await checkLoginAllowed(deps, key)).toEqual({ allowed: true })
    await fail(1)
    const result = await checkLoginAllowed(deps, key)
    expect(result.allowed).toBe(false)
  })

  it('o bloqueio informa Retry-After e libera quando a janela da falha mais antiga expira', async () => {
    await fail(5, 0)
    const blocked = await checkLoginAllowed(deps, key)
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 15 * 60 })

    clock.advanceMs(10 * MIN)
    const later = await checkLoginAllowed(deps, key)
    expect(later).toEqual({ allowed: false, retryAfterSeconds: 5 * 60 })

    clock.advanceMs(5 * MIN + 1)
    expect(await checkLoginAllowed(deps, key)).toEqual({ allowed: true })
  })

  it('a janela é deslizante: falhas antigas deixam de contar', async () => {
    await fail(3, 6 * MIN) // t=0, 6, 12 min; agora t=18
    await fail(2, 0) // mais duas em t=18: as de t=0 já saíram da janela de 15 min
    expect(await checkLoginAllowed(deps, key)).toEqual({ allowed: true })
  })

  it('sucesso limpa a chave', async () => {
    await fail(4)
    await recordLoginSuccess(deps, key)
    await fail(4)
    expect(await checkLoginAllowed(deps, key)).toEqual({ allowed: true })
  })

  it('outra chave não é afetada', async () => {
    await fail(5)
    const other = loginRateLimitKey('203.0.113.9', 'dono@example.com')
    expect(await checkLoginAllowed(deps, other)).toEqual({ allowed: true })
  })

  it('limpeza oportunista apaga linhas com mais de 24h', async () => {
    await fail(1)
    clock.advanceMs(25 * 60 * MIN)
    await fail(1)
    await purgeOldAttempts(deps)
    expect(attempts.rows).toHaveLength(1)
  })
})

describe('reserveLoginAttempt (reserva antes do bcrypt)', () => {
  const key = loginRateLimitKey('203.0.113.7', 'dono@example.com')
  let attempts: FakeLoginAttemptRepository
  let clock: ReturnType<typeof createClock>
  let deps: { attempts: FakeLoginAttemptRepository; now: () => Date }

  beforeEach(() => {
    attempts = new FakeLoginAttemptRepository()
    clock = createClock(new Date('2026-10-05T12:00:00.000Z'))
    deps = { attempts, now: clock.now }
  })

  it('as 5 primeiras reservas passam e já gravam a falha provisória', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await reserveLoginAttempt(deps, key)).toEqual({ allowed: true })
      clock.advanceMs(1000)
    }
    expect(attempts.rows).toHaveLength(5)
    expect(attempts.rows.every((row) => !row.success)).toBe(true)
  })

  it('a 6ª é bloqueada sem gravar nada (o bloqueio não é estendido)', async () => {
    for (let i = 0; i < 5; i++) await reserveLoginAttempt(deps, key)
    const result = await reserveLoginAttempt(deps, key)
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 15 * 60 })
    expect(attempts.rows).toHaveLength(5)
  })

  it('se a disputa estoura o limite depois de gravar, desfaz só a própria linha', async () => {
    // Simula 5 reservas concorrentes gravadas entre a checagem e a releitura da 6ª.
    const original = attempts.listFailures.bind(attempts)
    let first = true
    attempts.listFailures = async (k, since) => {
      const result = await original(k, since)
      if (first) {
        first = false
        // Checagem inicial: a chave ainda parece livre; as outras 5 gravam em seguida.
        for (let i = 0; i < 5; i++) await attempts.record(k, false, clock.now())
        return []
      }
      return result
    }

    const result = await reserveLoginAttempt(deps, key)

    expect(result).toEqual({ allowed: false, retryAfterSeconds: 15 * 60 })
    expect(attempts.rows).toHaveLength(5)
  })
})
