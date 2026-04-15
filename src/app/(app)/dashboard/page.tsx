import { redirect } from 'next/navigation'
import { validateSession } from '@/server/auth/session'
import { prisma } from '@/server/db'

export default async function DashboardPage() {
  const session = await validateSession()
  if (!session) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true },
  })

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-primary text-3xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Bem-vindo, {user?.name ?? user?.email}</p>
      <LogoutButton />
    </div>
  )
}

function LogoutButton() {
  return (
    <form
      action={async () => {
        'use server'
        const { destroySession } = await import('@/server/auth/session')
        await destroySession()
        const { redirect: rdr } = await import('next/navigation')
        rdr('/login')
      }}
    >
      <button
        type="submit"
        className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg px-4 py-2 text-sm font-medium"
      >
        Sair
      </button>
    </form>
  )
}
