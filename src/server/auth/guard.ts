import { validateSession } from './session'

export type AuthContext = {
  userId: string
  sessionId: string
}

export class AuthError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message)
    this.name = 'AuthError'
  }
}

export async function requireAuth(): Promise<AuthContext> {
  const session = await validateSession()
  if (!session) {
    throw new AuthError()
  }
  return session
}
