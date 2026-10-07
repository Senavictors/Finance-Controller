import crypto from 'node:crypto'

import type { Clock, SessionRepository } from './ports'
import { isExpired, nextExpiry, shouldRenew } from './session-policy'

// Regras de sessão sem Next nem Prisma: repositório e relógio injetados (testáveis sem banco).

export type SessionDeps = {
  sessions: SessionRepository
  now: Clock
  generateToken?: () => string
}

export type SessionContext = { userId: string; sessionId: string }

const USER_AGENT_MAX = 255

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** O banco guarda só o SHA-256 (hex) do token (RN-03); o cookie leva o token bruto. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function issueSession(
  deps: SessionDeps,
  input: { userId: string; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const now = deps.now()
  const token = (deps.generateToken ?? generateSessionToken)()
  const expiresAt = nextExpiry(now)

  await deps.sessions.create({
    tokenHash: hashToken(token),
    userId: input.userId,
    expiresAt,
    lastSeenAt: now,
    userAgent: input.userAgent ? input.userAgent.slice(0, USER_AGENT_MAX) : null,
  })

  return { token, expiresAt }
}

/**
 * Resolve o token do cookie em sessão. Expirada: apaga a linha e devolve `null`.
 * Válida com último uso há 24h ou mais: renova `lastSeenAt` e `expiresAt` (no máximo 1 escrita/dia).
 */
export async function resolveSession(
  deps: SessionDeps,
  token: string | undefined | null,
): Promise<SessionContext | null> {
  if (!token) return null

  const session = await deps.sessions.findByTokenHash(hashToken(token))
  if (!session) return null

  const now = deps.now()

  if (isExpired(session.expiresAt, now)) {
    await deps.sessions.deleteById(session.id)
    return null
  }

  if (shouldRenew(session.lastSeenAt, now)) {
    await deps.sessions.touch(session.id, { lastSeenAt: now, expiresAt: nextExpiry(now) })
  }

  return { userId: session.userId, sessionId: session.id }
}

export async function revokeSession(
  deps: SessionDeps,
  token: string | undefined | null,
): Promise<void> {
  if (!token) return
  await deps.sessions.deleteByTokenHash(hashToken(token))
}

export async function revokeOtherSessions(
  deps: SessionDeps,
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await deps.sessions.deleteAllExcept(userId, keepSessionId)
}
