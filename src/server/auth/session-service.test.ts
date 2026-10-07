import { beforeEach, describe, expect, it } from 'vitest'

import { createClock, FakeSessionRepository } from '../../../tests/helpers/auth-fakes'
import {
  hashToken,
  issueSession,
  resolveSession,
  revokeOtherSessions,
  revokeSession,
  type SessionDeps,
} from './session-service'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('session-service', () => {
  let sessions: FakeSessionRepository
  let clock: ReturnType<typeof createClock>
  let deps: SessionDeps

  beforeEach(() => {
    sessions = new FakeSessionRepository()
    clock = createClock(new Date('2026-10-05T12:00:00.000Z'))
    deps = { sessions, now: clock.now }
  })

  it('CA-04: grava só o hash (64 hex) do token, expira em ~90 dias e devolve o token bruto', async () => {
    const { token, expiresAt } = await issueSession(deps, { userId: 'u1', userAgent: 'UA' })

    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(sessions.rows).toHaveLength(1)
    const row = sessions.rows[0]
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.tokenHash).toBe(hashToken(token))
    expect(row.tokenHash).not.toBe(token)
    expect(JSON.stringify(row)).not.toContain(token)
    expect(row.expiresAt.getTime() - clock.now().getTime()).toBe(90 * DAY)
    expect(expiresAt).toEqual(row.expiresAt)
    expect(row.lastSeenAt).toEqual(clock.now())
    expect(row.userAgent).toBe('UA')
  })

  it('limita o user agent a 255 caracteres', async () => {
    await issueSession(deps, { userId: 'u1', userAgent: 'x'.repeat(400) })
    expect(sessions.rows[0].userAgent).toHaveLength(255)
  })

  it('CA-05: lastSeenAt de 2 dias atrás renova lastSeenAt e expiresAt', async () => {
    const { token } = await issueSession(deps, { userId: 'u1' })
    clock.advanceMs(2 * DAY)

    const ctx = await resolveSession(deps, token)

    expect(ctx).toEqual({ userId: 'u1', sessionId: sessions.rows[0].id })
    expect(sessions.touchCount).toBe(1)
    expect(sessions.rows[0].lastSeenAt).toEqual(clock.now())
    expect(sessions.rows[0].expiresAt.getTime()).toBe(clock.now().getTime() + 90 * DAY)
  })

  it('CA-05: lastSeenAt de 2 horas atrás NÃO gera escrita', async () => {
    const { token } = await issueSession(deps, { userId: 'u1' })
    const before = { ...sessions.rows[0] }
    clock.advanceMs(2 * HOUR)

    expect(await resolveSession(deps, token)).not.toBeNull()
    expect(await resolveSession(deps, token)).not.toBeNull()

    expect(sessions.touchCount).toBe(0)
    expect(sessions.rows[0].lastSeenAt).toEqual(before.lastSeenAt)
    expect(sessions.rows[0].expiresAt).toEqual(before.expiresAt)
  })

  it('no máximo 1 escrita por dia: duas leituras seguidas após 2 dias escrevem uma vez', async () => {
    const { token } = await issueSession(deps, { userId: 'u1' })
    clock.advanceMs(2 * DAY)
    await resolveSession(deps, token)
    await resolveSession(deps, token)
    expect(sessions.touchCount).toBe(1)
  })

  it('CA-06: sessão expirada é rejeitada e removida', async () => {
    const { token } = await issueSession(deps, { userId: 'u1' })
    clock.advanceMs(90 * DAY + 1000)

    expect(await resolveSession(deps, token)).toBeNull()
    expect(sessions.rows).toHaveLength(0)
    expect(sessions.touchCount).toBe(0)
  })

  it('uso contínuo estende a sessão além dos 90 dias originais (deslizante)', async () => {
    const { token } = await issueSession(deps, { userId: 'u1' })
    for (let i = 0; i < 4; i++) {
      clock.advanceMs(60 * DAY)
      expect(await resolveSession(deps, token)).not.toBeNull()
    }
  })

  it('token ausente, vazio ou desconhecido devolve null', async () => {
    expect(await resolveSession(deps, undefined)).toBeNull()
    expect(await resolveSession(deps, '')).toBeNull()
    expect(await resolveSession(deps, 'a'.repeat(64))).toBeNull()
  })

  it('revokeSession apaga a linha; revokeOtherSessions mantém só a atual', async () => {
    const a = await issueSession(deps, { userId: 'u1' })
    await issueSession(deps, { userId: 'u1' })
    await issueSession(deps, { userId: 'u2' })
    const keep = sessions.rows[0].id

    await revokeOtherSessions(deps, 'u1', keep)
    expect(sessions.rows.map((row) => row.userId).sort()).toEqual(['u1', 'u2'])
    expect(await resolveSession(deps, a.token)).not.toBeNull()

    await revokeSession(deps, a.token)
    expect(await resolveSession(deps, a.token)).toBeNull()
  })
})
