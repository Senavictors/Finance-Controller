// Portas de persistência do módulo de auth. Implementação real em `prisma-repositories.ts`;
// os testes usam repositórios falsos (tests/helpers/auth-fakes.ts).

export type SessionRecord = {
  id: string
  userId: string
  expiresAt: Date
  lastSeenAt: Date
}

export type NewSession = {
  tokenHash: string
  userId: string
  expiresAt: Date
  lastSeenAt: Date
  userAgent: string | null
}

export interface SessionRepository {
  create(data: NewSession): Promise<void>
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>
  /** Renovação deslizante: um único UPDATE com `lastSeenAt` e `expiresAt`. */
  touch(id: string, data: { lastSeenAt: Date; expiresAt: Date }): Promise<void>
  deleteById(id: string): Promise<void>
  deleteByTokenHash(tokenHash: string): Promise<void>
  deleteAllExcept(userId: string, keepSessionId: string): Promise<void>
}

export interface LoginAttemptRepository {
  /** Instantes das falhas da chave desde `since`, em ordem crescente. */
  listFailures(key: string, since: Date): Promise<Date[]>
  /** Grava a tentativa e devolve o id da linha (permite desfazer só ela com `remove`). */
  record(key: string, success: boolean, at: Date): Promise<string>
  remove(id: string): Promise<void>
  clear(key: string): Promise<void>
  purgeOlderThan(date: Date): Promise<void>
}

export type AuthUser = {
  id: string
  name: string | null
  email: string
  passwordHash: string
}

export interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>
  findById(id: string): Promise<AuthUser | null>
}

export type Clock = () => Date
