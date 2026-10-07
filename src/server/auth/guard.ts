import { AuthError } from './errors'
import { validateSession } from './session'
import type { SessionContext } from './session-service'

export { AuthError }
export type AuthContext = SessionContext

/** Valida a sessão no banco; lança `AuthError` (rotas respondem 401). Nunca confie só no proxy. */
export async function requireAuth(): Promise<AuthContext> {
  const session = await validateSession()
  if (!session) {
    throw new AuthError()
  }
  return session
}
