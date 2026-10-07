import type { AuthUser, UserRepository } from './ports'
import {
  loginRateLimitKey,
  purgeOldAttempts,
  recordLoginSuccess,
  reserveLoginAttempt,
  type RateLimitDeps,
} from './rate-limit'
import { issueSession, type SessionDeps } from './session-service'

// Use-case de login (single-user). Sem Next nem Prisma: dependências injetadas.

// Hash bcrypt (custo 12) de um valor aleatório descartado. Serve só para gastar o mesmo tempo
// quando o e-mail não existe (tempo uniforme); não corresponde a nenhuma senha real.
export const DUMMY_PASSWORD_HASH = '$2b$12$jGu6.7j.pQRHYRoajYQAAO1M3L.EgqMwBH6ng0dwObTZ3t0fIoJCi'

export type LoginDeps = SessionDeps &
  RateLimitDeps & {
    users: UserRepository
    verifyPassword: (plaintext: string, hash: string) => Promise<boolean>
  }

export type LoginInput = {
  email: string
  password: string
  ip: string
  userAgent?: string | null
}

export type LoginResult =
  | {
      ok: true
      user: { id: string; name: string | null; email: string }
      token: string
      expiresAt: Date
    }
  | { ok: false; reason: 'rate-limited'; retryAfterSeconds: number }
  | { ok: false; reason: 'invalid-credentials' }

export async function login(deps: LoginDeps, input: LoginInput): Promise<LoginResult> {
  const key = loginRateLimitKey(input.ip, input.email)

  // A tentativa é reservada (gravada como falha provisória) antes do bcrypt: ver rate-limit.ts.
  const gate = await reserveLoginAttempt(deps, key)
  if (!gate.allowed) {
    return { ok: false, reason: 'rate-limited', retryAfterSeconds: gate.retryAfterSeconds }
  }

  const user: AuthUser | null = await deps.users.findByEmail(input.email)
  // Sempre executa o bcrypt, contra um hash fictício se o usuário não existir.
  const passwordOk = await deps.verifyPassword(
    input.password,
    user ? user.passwordHash : DUMMY_PASSWORD_HASH,
  )

  if (!user || !passwordOk) {
    // A falha provisória reservada acima já é a falha definitiva.
    await purgeOldAttempts(deps)
    return { ok: false, reason: 'invalid-credentials' }
  }

  await recordLoginSuccess(deps, key)
  await purgeOldAttempts(deps)

  const { token, expiresAt } = await issueSession(deps, {
    userId: user.id,
    userAgent: input.userAgent,
  })

  return { ok: true, user: { id: user.id, name: user.name, email: user.email }, token, expiresAt }
}
