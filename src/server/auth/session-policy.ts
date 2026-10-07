// Política de sessão (FC2-F0-06): funções puras, sem I/O. O relógio entra por parâmetro.

export const SESSION_COOKIE_NAME = 'fc_session'
// Cookie auxiliar, não sensível: dia (desde a época Unix, UTC) da última reemissão de `fc_session`.
export const SESSION_RENEW_COOKIE_NAME = 'fc_session_r'

export const SESSION_TTL_DAYS = 90
export const RENEW_AFTER_HOURS = 24

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const SESSION_TTL_MS = SESSION_TTL_DAYS * DAY_MS
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60
export const RENEW_AFTER_MS = RENEW_AFTER_HOURS * HOUR_MS

/** Nova data de expiração: `now + 90 dias`. */
export function nextExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS)
}

/** Sessão expirada quando `expiresAt` já foi alcançada (limite exato conta como expirada). */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime()
}

/** Renova no banco quando o último uso tem 24h ou mais (no máximo 1 escrita por dia). */
export function shouldRenew(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= RENEW_AFTER_MS
}

export type SessionCookieOptions = {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  maxAge: number
}

/** Atributos do cookie `fc_session`. `Secure` apenas em produção (HTTP local não o aceitaria). */
export function sessionCookieOptions(isProduction: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}

/** Dia (UTC, desde a época Unix) usado como marca do cookie auxiliar. */
export function renewalDay(now: Date): string {
  return String(Math.floor(now.getTime() / DAY_MS))
}

/** Reemite o cookie no máximo uma vez por dia: só quando a marca difere da de hoje. */
export function shouldReissueCookie(renewCookieValue: string | undefined, now: Date): boolean {
  return renewCookieValue !== renewalDay(now)
}
