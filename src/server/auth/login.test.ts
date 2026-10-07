import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createClock,
  FakeLoginAttemptRepository,
  FakeSessionRepository,
  FakeUserRepository,
} from '../../../tests/helpers/auth-fakes'
import { DUMMY_PASSWORD_HASH, login, type LoginDeps } from './login'
import { hashToken } from './session-service'

const MIN = 60 * 1000
const USER_HASH = 'hash-do-dono-de-teste'

// verifyPassword falso: só a senha "senha-correta-123" confere com o hash do dono.
function fakeVerify() {
  return vi.fn(
    async (plain: string, hash: string) => hash === USER_HASH && plain === 'senha-correta-123',
  )
}

describe('login (use-case com repositórios falsos)', () => {
  let sessions: FakeSessionRepository
  let attempts: FakeLoginAttemptRepository
  let clock: ReturnType<typeof createClock>
  let verifyPassword: ReturnType<typeof fakeVerify>
  let deps: LoginDeps

  const base = { ip: '203.0.113.7', userAgent: 'UA-teste' }
  const good = { ...base, email: 'dono@example.com', password: 'senha-correta-123' }
  const bad = { ...base, email: 'dono@example.com', password: 'senha-errada' }

  beforeEach(() => {
    sessions = new FakeSessionRepository()
    attempts = new FakeLoginAttemptRepository()
    clock = createClock(new Date('2026-10-05T12:00:00.000Z'))
    verifyPassword = fakeVerify()
    deps = {
      sessions,
      attempts,
      now: clock.now,
      users: new FakeUserRepository([
        { id: 'u1', name: 'Dono', email: 'dono@example.com', passwordHash: USER_HASH },
      ]),
      verifyPassword,
    }
  })

  it('credenciais válidas criam sessão com hash, sem vazar o hash da senha', async () => {
    const result = await login(deps, good)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.user).toEqual({ id: 'u1', name: 'Dono', email: 'dono@example.com' })
    expect(JSON.stringify(result.user)).not.toContain(USER_HASH)
    expect(sessions.rows).toHaveLength(1)
    expect(sessions.rows[0].tokenHash).toBe(hashToken(result.token))
    expect(sessions.rows[0].userAgent).toBe('UA-teste')
  })

  it('usuário inexistente executa o bcrypt fictício e responde igual à senha errada', async () => {
    const unknown = await login(deps, { ...base, email: 'ninguem@example.com', password: 'x' })
    expect(verifyPassword).toHaveBeenCalledTimes(1)
    expect(verifyPassword).toHaveBeenCalledWith('x', DUMMY_PASSWORD_HASH)

    const wrong = await login(deps, bad)
    expect(verifyPassword).toHaveBeenCalledTimes(2)
    expect(verifyPassword).toHaveBeenLastCalledWith('senha-errada', USER_HASH)

    expect(unknown).toEqual({ ok: false, reason: 'invalid-credentials' })
    expect(wrong).toEqual(unknown)
    expect(sessions.rows).toHaveLength(0)
  })

  it('CA-09: 5 falhas bloqueiam; o 6º login, mesmo correto, é 429 até a janela expirar', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await login(deps, bad)).toEqual({ ok: false, reason: 'invalid-credentials' })
      clock.advanceMs(1000)
    }

    const blocked = await login(deps, good)
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.reason).toBe('rate-limited')
    if (blocked.reason === 'rate-limited') {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(15 * 60)
    }
    expect(sessions.rows).toHaveLength(0)

    clock.advanceMs(15 * MIN)
    expect((await login(deps, good)).ok).toBe(true)
  })

  it('bloqueado não executa bcrypt nem grava novas falhas', async () => {
    for (let i = 0; i < 5; i++) await login(deps, bad)
    const rowsBefore = attempts.rows.length
    verifyPassword.mockClear()

    await login(deps, good)

    expect(verifyPassword).not.toHaveBeenCalled()
    expect(attempts.rows).toHaveLength(rowsBefore)
  })

  it('sucesso zera as falhas da chave', async () => {
    for (let i = 0; i < 4; i++) await login(deps, bad)
    expect((await login(deps, good)).ok).toBe(true)
    for (let i = 0; i < 4; i++) await login(deps, bad)
    expect((await login(deps, good)).ok).toBe(true)
  })

  it('o limite é por IP + e-mail', async () => {
    for (let i = 0; i < 5; i++) await login(deps, bad)
    const otherIp = await login(deps, { ...good, ip: '203.0.113.99' })
    expect(otherIp.ok).toBe(true)
  })

  it('apaga tentativas com mais de 24h no próprio login', async () => {
    await login(deps, bad)
    clock.advanceMs(25 * 60 * MIN)
    await login(deps, good)
    expect(
      attempts.rows.every(
        (row) => row.createdAt >= new Date(clock.now().getTime() - 24 * 60 * MIN),
      ),
    ).toBe(true)
  })
})

// Rajada paralela: o limite de 5 falhas não pode ser ultrapassado por requisições simultâneas.
// Relógio falso: o entrelaçamento (latência do banco e do bcrypt) fica determinístico.
describe('login: limite de tentativas sob concorrência', () => {
  const LIMIT = 5
  const BURST = 12
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const input = { ip: '203.0.113.7', email: 'dono@example.com', password: 'senha-errada' }

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(options: { bcryptMs: number; dbMs: number }) {
    const attempts = new FakeLoginAttemptRepository(options.dbMs)
    const sessions = new FakeSessionRepository()
    // bcrypt falso com latência (~240 ms reais): é o intervalo em que a rajada se acumula.
    const verifyPassword = vi.fn(async (plain: string, hash: string) => {
      await sleep(options.bcryptMs)
      return hash === USER_HASH && plain === 'senha-correta-123'
    })
    const deps: LoginDeps = {
      sessions,
      attempts,
      now: () => new Date(),
      users: new FakeUserRepository([
        { id: 'u1', name: 'Dono', email: 'dono@example.com', passwordHash: USER_HASH },
      ]),
      verifyPassword,
    }
    return { attempts, deps, verifyPassword }
  }

  /** Dispara `BURST` logins, o i-ésimo após `i * staggerMs`, e roda o relógio até todos terminarem. */
  async function burst(deps: LoginDeps, staggerMs: number, password = input.password) {
    const pending = Promise.all(
      Array.from({ length: BURST }, (_, i) =>
        sleep(i * staggerMs).then(() => login(deps, { ...input, password })),
      ),
    )
    await vi.advanceTimersByTimeAsync(10_000)
    return pending
  }

  function tally(results: Awaited<ReturnType<typeof login>>[]) {
    const invalid = results.filter((r) => !r.ok && r.reason === 'invalid-credentials').length
    const limited = results.filter((r) => !r.ok && r.reason === 'rate-limited').length
    return { invalid, limited }
  }

  it('rajada com a primeira decisão pronta antes da seguinte: LIMITE vão ao bcrypt (401), o resto 429', async () => {
    const { deps, verifyPassword } = setup({ bcryptMs: 500, dbMs: 2 })

    const results = await burst(deps, 20)

    const { invalid, limited } = tally(results)
    expect(invalid).toBe(LIMIT)
    expect(limited).toBe(BURST - LIMIT)
    expect(verifyPassword).toHaveBeenCalledTimes(LIMIT)
    for (const r of results) {
      if (!r.ok && r.reason === 'rate-limited') {
        expect(r.retryAfterSeconds).toBeGreaterThan(0)
        expect(r.retryAfterSeconds).toBeLessThanOrEqual(15 * 60)
      }
    }
  })

  it('rajada com decisões entrelaçadas: nunca mais que LIMITE respostas 401 nem bcrypts', async () => {
    const { attempts, deps, verifyPassword } = setup({ bcryptMs: 500, dbMs: 3 })

    const results = await burst(deps, 1)

    const { invalid, limited } = tally(results)
    expect(invalid).toBeLessThanOrEqual(LIMIT)
    expect(invalid + limited).toBe(BURST)
    expect(verifyPassword.mock.calls.length).toBeLessThanOrEqual(LIMIT)
    // Falhas definitivas = só as que chegaram ao bcrypt; as bloqueadas desfazem a própria linha.
    expect(attempts.rows).toHaveLength(invalid)
  })

  it('rajada totalmente simultânea: nunca mais que LIMITE respostas 401 nem bcrypts', async () => {
    const { deps, verifyPassword } = setup({ bcryptMs: 500, dbMs: 3 })

    const results = await burst(deps, 0)

    const { invalid, limited } = tally(results)
    expect(invalid).toBeLessThanOrEqual(LIMIT)
    expect(invalid + limited).toBe(BURST)
    expect(verifyPassword.mock.calls.length).toBeLessThanOrEqual(LIMIT)
  })

  it('depois da rajada a chave segue bloqueada, inclusive para a senha correta', async () => {
    const { deps } = setup({ bcryptMs: 500, dbMs: 2 })
    await burst(deps, 20)

    const pending = login(deps, { ...input, password: 'senha-correta-123' })
    await vi.advanceTimersByTimeAsync(1000)
    const blocked = await pending

    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.reason).toBe('rate-limited')
  })

  it('a senha correta dentro do limite ainda entra e zera as falhas', async () => {
    const { attempts, deps } = setup({ bcryptMs: 10, dbMs: 1 })
    const run = async (password: string) => {
      const pending = login(deps, { ...input, password })
      await vi.advanceTimersByTimeAsync(1000)
      return pending
    }
    await run('senha-errada')
    await run('senha-errada')

    const ok = await run('senha-correta-123')

    expect(ok.ok).toBe(true)
    expect(attempts.rows).toHaveLength(0)
  })
})

// Falha de infraestrutura no meio do login: a reserva fica gravada (fail closed, nunca libera tentativa extra).
describe('login: exceção depois da reserva', () => {
  it('se o bcrypt lança, a falha provisória permanece e a exceção propaga', async () => {
    const attempts = new FakeLoginAttemptRepository()
    const deps: LoginDeps = {
      sessions: new FakeSessionRepository(),
      attempts,
      now: () => new Date('2026-10-05T12:00:00.000Z'),
      users: new FakeUserRepository([
        { id: 'u1', name: 'Dono', email: 'dono@example.com', passwordHash: USER_HASH },
      ]),
      verifyPassword: vi.fn(async () => {
        throw new Error('falha simulada do bcrypt')
      }),
    }
    const input = { ip: '203.0.113.7', email: 'dono@example.com', password: 'qualquer' }

    await expect(login(deps, input)).rejects.toThrow('falha simulada do bcrypt')

    expect(attempts.rows).toHaveLength(1)
    expect(attempts.rows[0].success).toBe(false)
  })
})
