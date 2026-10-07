import { describe, expect, it } from 'vitest'

import {
  isExpired,
  nextExpiry,
  renewalDay,
  sessionCookieOptions,
  SESSION_TTL_SECONDS,
  shouldReissueCookie,
  shouldRenew,
} from './session-policy'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const now = new Date('2026-10-05T15:00:00.000Z')

describe('session-policy', () => {
  describe('shouldRenew', () => {
    it('não renova com 23h59 de diferença', () => {
      expect(shouldRenew(new Date(now.getTime() - (24 * HOUR - 60_000)), now)).toBe(false)
    })
    it('renova com exatamente 24h', () => {
      expect(shouldRenew(new Date(now.getTime() - 24 * HOUR), now)).toBe(true)
    })
    it('renova com 90 dias', () => {
      expect(shouldRenew(new Date(now.getTime() - 90 * DAY), now)).toBe(true)
    })
    it('não renova no mesmo instante', () => {
      expect(shouldRenew(now, now)).toBe(false)
    })
  })

  describe('isExpired', () => {
    it('expira no limite exato', () => {
      expect(isExpired(now, now)).toBe(true)
    })
    it('1ms antes do limite ainda vale', () => {
      expect(isExpired(new Date(now.getTime() + 1), now)).toBe(false)
    })
    it('passado está expirado', () => {
      expect(isExpired(new Date(now.getTime() - 1), now)).toBe(true)
    })
  })

  it('nextExpiry é now + 90 dias', () => {
    expect(nextExpiry(now).getTime() - now.getTime()).toBe(90 * DAY)
  })

  it('atributos do cookie: HttpOnly, Lax, path /, Max-Age 90 dias; Secure só em produção', () => {
    expect(sessionCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7776000,
    })
    expect(SESSION_TTL_SECONDS).toBe(7776000)
    expect(sessionCookieOptions(false).secure).toBe(false)
  })

  describe('cookie auxiliar de reemissão', () => {
    it('reemite quando não há marca ou a marca é de outro dia', () => {
      expect(shouldReissueCookie(undefined, now)).toBe(true)
      expect(shouldReissueCookie(renewalDay(new Date(now.getTime() - DAY)), now)).toBe(true)
    })
    it('não reemite com a marca de hoje', () => {
      expect(shouldReissueCookie(renewalDay(now), now)).toBe(false)
    })
  })
})
