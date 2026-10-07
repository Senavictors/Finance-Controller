import { prisma } from '@/server/db'

import type { LoginAttemptRepository, SessionRepository, UserRepository } from './ports'

// Implementações Prisma das portas de auth. Única ponte entre o módulo e o banco.

export const prismaSessionRepository: SessionRepository = {
  async create(data) {
    await prisma.session.create({ data })
  },
  findByTokenHash(tokenHash) {
    return prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, lastSeenAt: true },
    })
  },
  async touch(id, data) {
    await prisma.session.update({ where: { id }, data })
  },
  async deleteById(id) {
    await prisma.session.deleteMany({ where: { id } })
  },
  async deleteByTokenHash(tokenHash) {
    await prisma.session.deleteMany({ where: { tokenHash } })
  },
  async deleteAllExcept(userId, keepSessionId) {
    await prisma.session.deleteMany({ where: { userId, NOT: { id: keepSessionId } } })
  },
}

export const prismaLoginAttemptRepository: LoginAttemptRepository = {
  async listFailures(key, since) {
    const rows = await prisma.loginAttempt.findMany({
      where: { key, success: false, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    })
    return rows.map((row) => row.createdAt)
  },
  async record(key, success, at) {
    const row = await prisma.loginAttempt.create({
      data: { key, success, createdAt: at },
      select: { id: true },
    })
    return row.id
  },
  async remove(id) {
    await prisma.loginAttempt.deleteMany({ where: { id } })
  },
  async clear(key) {
    await prisma.loginAttempt.deleteMany({ where: { key } })
  },
  async purgeOlderThan(date) {
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: date } } })
  },
}

export const prismaUserRepository: UserRepository = {
  async findByEmail(email) {
    const user = await prisma.user.findUnique({ where: { email } })
    return user
      ? { id: user.id, name: user.name, email: user.email, passwordHash: user.password }
      : null
  },
  async findById(id) {
    const user = await prisma.user.findUnique({ where: { id } })
    return user
      ? { id: user.id, name: user.name, email: user.email, passwordHash: user.password }
      : null
  },
}
