import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await validateSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, image: true },
  })

  return (
    <Suspense>
      <AppShell
        userName={user?.name ?? user?.email ?? 'Usuario'}
        userEmail={user?.email ?? ''}
        userImage={user?.image ?? null}
      >
        {children}
      </AppShell>
    </Suspense>
  )
}
