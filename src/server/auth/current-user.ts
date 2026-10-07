import type { UserRepository } from './ports'

export type CurrentUser = { id: string; name: string | null; email: string }

/** Dados públicos do usuário da sessão (nunca expõe o hash da senha). */
export async function getCurrentUser(
  users: UserRepository,
  userId: string,
): Promise<CurrentUser | null> {
  const user = await users.findById(userId)
  return user ? { id: user.id, name: user.name, email: user.email } : null
}
