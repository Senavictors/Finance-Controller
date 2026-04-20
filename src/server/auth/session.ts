import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { prisma } from '@/server/db'

const SESSION_COOKIE_NAME = 'fc_session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await prisma.session.create({
    data: { token, userId, expiresAt },
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
    where: { token },
    select: { id: true, userId: true, expiresAt: true },
  })

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } })
    }
    return null
  }

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
    await prisma.session.deleteMany({ where: { token } })
  }

  cookieStore.delete(SESSION_COOKIE_NAME)
}
