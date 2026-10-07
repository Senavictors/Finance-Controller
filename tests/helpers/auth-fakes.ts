import type {
  AuthUser,
  LoginAttemptRepository,
  NewSession,
  SessionRecord,
  SessionRepository,
  UserRepository,
} from '../../src/server/auth/ports'

/** Relógio controlável para testes de auth. */
export function createClock(start: Date) {
  let current = start.getTime()
  return {
    now: () => new Date(current),
    advanceMs(ms: number) {
      current += ms
    },
    set(date: Date) {
      current = date.getTime()
    },
  }
}

type StoredSession = SessionRecord & { tokenHash: string; userAgent: string | null }

export class FakeSessionRepository implements SessionRepository {
  rows: StoredSession[] = []
  touchCount = 0
  private seq = 0

  async create(data: NewSession) {
    this.rows.push({ ...data, id: `s${++this.seq}` })
  }
  async findByTokenHash(tokenHash: string) {
    return this.rows.find((row) => row.tokenHash === tokenHash) ?? null
  }
  async touch(id: string, data: { lastSeenAt: Date; expiresAt: Date }) {
    this.touchCount++
    const row = this.rows.find((r) => r.id === id)
    if (row) Object.assign(row, data)
  }
  async deleteById(id: string) {
    this.rows = this.rows.filter((row) => row.id !== id)
  }
  async deleteByTokenHash(tokenHash: string) {
    this.rows = this.rows.filter((row) => row.tokenHash !== tokenHash)
  }
  async deleteAllExcept(userId: string, keepSessionId: string) {
    this.rows = this.rows.filter((row) => row.userId !== userId || row.id === keepSessionId)
  }
}

type StoredAttempt = { id: string; key: string; success: boolean; createdAt: Date }

export class FakeLoginAttemptRepository implements LoginAttemptRepository {
  rows: StoredAttempt[] = []
  private seq = 0

  /** `latencyMs > 0` simula a ida ao banco e deixa chamadas concorrentes se entrelaçarem. */
  constructor(private latencyMs = 0) {}

  private async io() {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
  }

  async listFailures(key: string, since: Date) {
    await this.io()
    return this.rows
      .filter((row) => row.key === key && !row.success && row.createdAt >= since)
      .map((row) => row.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())
  }
  async record(key: string, success: boolean, at: Date) {
    await this.io()
    const id = `a${++this.seq}`
    this.rows.push({ id, key, success, createdAt: at })
    return id
  }
  async remove(id: string) {
    await this.io()
    this.rows = this.rows.filter((row) => row.id !== id)
  }
  async clear(key: string) {
    await this.io()
    this.rows = this.rows.filter((row) => row.key !== key)
  }
  async purgeOlderThan(date: Date) {
    await this.io()
    this.rows = this.rows.filter((row) => row.createdAt >= date)
  }
}

export class FakeUserRepository implements UserRepository {
  constructor(public users: AuthUser[] = []) {}

  async findByEmail(email: string) {
    return this.users.find((user) => user.email === email) ?? null
  }
  async findById(id: string) {
    return this.users.find((user) => user.id === id) ?? null
  }
}
