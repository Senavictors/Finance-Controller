import { cookies } from 'next/headers'

import { verifyPassword } from './password'
import {
  prismaLoginAttemptRepository,
  prismaSessionRepository,
  prismaUserRepository,
} from './prisma-repositories'
import { login, type LoginInput, type LoginResult } from './login'
import {
  issueSession,
  resolveSession,
  revokeOtherSessions,
  revokeSession,
  type SessionContext,
  type SessionDeps,
} from './session-service'
import {
  renewalDay,
  SESSION_COOKIE_NAME,
  SESSION_RENEW_COOKIE_NAME,
  sessionCookieOptions,
} from './session-policy'

// Adaptador Next da sessão: lê/grava o cookie `fc_session` e delega as regras ao session-service.
// Server Components não gravam cookie; a reemissão deslizante do cookie acontece em `proxy.ts`.

const sessionDeps: SessionDeps = {
  sessions: prismaSessionRepository,
  now: () => new Date(),
}

const isProduction = () => process.env.NODE_ENV === 'production'

async function setSessionCookies(token: string): Promise<void> {
  const cookieStore = await cookies()
  const options = sessionCookieOptions(isProduction())
  cookieStore.set(SESSION_COOKIE_NAME, token, options)
  cookieStore.set(SESSION_RENEW_COOKIE_NAME, renewalDay(new Date()), options)
}

/** Cria a sessão e grava o cookie (para Route Handlers e Server Actions). */
export async function createSession(
  userId: string,
  userAgent?: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const issued = await issueSession(sessionDeps, { userId, userAgent })
  await setSessionCookies(issued.token)
  return issued
}

/** Login completo (limite de tentativas, bcrypt, sessão); grava o cookie quando bem-sucedido. */
export async function loginWithCookie(input: LoginInput): Promise<LoginResult> {
  const result = await login(
    {
      ...sessionDeps,
      attempts: prismaLoginAttemptRepository,
      users: prismaUserRepository,
      verifyPassword,
    },
    input,
  )
  if (result.ok) await setSessionCookies(result.token)
  return result
}

/** Valida o cookie contra o banco (hash do token); renova no máximo 1x a cada 24h. */
export async function validateSession(): Promise<SessionContext | null> {
  const cookieStore = await cookies()
  return resolveSession(sessionDeps, cookieStore.get(SESSION_COOKIE_NAME)?.value)
}

export async function invalidateOtherSessions(
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await revokeOtherSessions(sessionDeps, userId, keepSessionId)
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  await revokeSession(sessionDeps, cookieStore.get(SESSION_COOKIE_NAME)?.value)
  cookieStore.delete(SESSION_COOKIE_NAME)
  cookieStore.delete(SESSION_RENEW_COOKIE_NAME)
}
