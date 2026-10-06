import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { prisma } from '@/server/db'

const SESSION_COOKIE_NAME = 'fc_session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// O banco guarda apenas o SHA-256 (hex) do token; o cookie leva o token bruto.
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })

  return token
}

export async function validateSession(): Promise<{ userId: string; sessionId: string } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true },
  })

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } })
    }
    return null
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  })

  return { userId: session.userId, sessionId: session.id }
}

export async function invalidateOtherSessions(
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId, NOT: { id: keepSessionId } },
  })
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }

  cookieStore.delete(SESSION_COOKIE_NAME)
}
